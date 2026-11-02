import { createEffect, onCleanup } from "solid-js"
import type { PermissionRequest } from "@opencode/client/promise"
import type { Data } from "@opencode/client/solid"
import type { ServerSDK } from "@/runtime/server/client"
import { cachedReview, reviewInFlight, startReview } from "./review-cache"
import { permissionReviewPrompt } from "./permission-review"

// Long enough that a request the client answers on its own (auto-approve) never reaches the model.
const debounceMs = 1_000

// Two at a time keeps a burst of asks from opening a wall of concurrent generations.
const concurrentReviews = 2

const attemptedLimit = 1_000

/**
 * Reviews a permission ask as soon as it arrives, so opening its session shows the brief instead of waiting on
 * a model call. The review stays off the permission path: it is debounced, deduplicated with any open dock, and
 * bounded in concurrency. The call keeps the session context and model, so the provider can reuse its cached
 * prompt prefix rather than re-reading the transcript.
 */
export function createPermissionReviewPrefetcher(input: { sdk: ServerSDK; data: Data }) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const answered = new Set<string>()
  const attempted = new Set<string>()
  const queue: PermissionRequest[] = []
  let running = 0
  let disposed = false

  const unsubscribe = [
    input.sdk.event.on("permission.asked", (event) => schedule(event.data)),
    input.sdk.event.on("permission.replied", (event) => {
      answered.add(event.data.requestID)
      const timer = timers.get(event.data.requestID)
      if (timer) clearTimeout(timer)
      timers.delete(event.data.requestID)
    }),
  ]

  // A request that was already pending when this client connected or reloaded never replays its ask event.
  createEffect(() => {
    for (const session of input.data.session.list())
      for (const request of input.data.session.permission.list(session.id) ?? []) schedule(request)
  })

  onCleanup(() => {
    disposed = true
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    unsubscribe.forEach((stop) => stop())
  })

  function schedule(request: PermissionRequest) {
    if (disposed || request.message || attempted.has(request.id)) return
    if (cachedReview(request.id) || reviewInFlight(request.id) || timers.has(request.id)) return
    remember(request.id)
    timers.set(
      request.id,
      setTimeout(() => {
        timers.delete(request.id)
        if (disposed || answered.has(request.id)) return
        queue.push(request)
        drain()
      }, debounceMs),
    )
  }

  function drain() {
    while (!disposed && running < concurrentReviews && queue.length > 0) {
      const request = queue.shift()
      if (!request) return
      running += 1
      void review(request).finally(() => {
        running -= 1
        drain()
      })
    }
  }

  async function review(request: PermissionRequest) {
    const session = input.data.session.get(request.sessionID)
    const agents = session ? input.data.location.agent.list({ directory: session.location.directory }) : undefined
    const agent = agents?.find((item) => item.id === session?.agent || item.name === session?.agent)

    await startReview(request.id, async () => {
      const result = await input.sdk.api.session.generate({
        sessionID: request.sessionID,
        prompt: permissionReviewPrompt(request, agent),
      })

      return result.text
    })
  }

  function remember(requestID: string) {
    attempted.add(requestID)

    for (const oldest of attempted) {
      if (attempted.size <= attemptedLimit) break
      attempted.delete(oldest)
    }
  }
}
