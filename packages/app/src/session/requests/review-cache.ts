import { createSignal } from "solid-js"

// One review per pending request, shared by the app-level prefetch and any open dock. Switching away and
// back must neither start a second model call nor lose a brief that already arrived.
const completed = new Map<string, string>()
const inFlight = new Map<string, Promise<string | undefined>>()
const completedLimit = 50

const [revision, setRevision] = createSignal(0)

const changed = () => setRevision((value) => value + 1)

/** The settled brief for a request. Reading this tracks completion. */
export function cachedReview(requestID: string) {
  revision()

  return completed.get(requestID)
}

/** A review is on its way. Reading this tracks completion. */
export function reviewInFlight(requestID: string) {
  revision()

  return inFlight.has(requestID)
}

export function rememberReview(requestID: string, text: string) {
  completed.delete(requestID)
  completed.set(requestID, text)
  for (const oldest of completed.keys()) {
    if (completed.size <= completedLimit) break
    completed.delete(oldest)
  }
  changed()
}

/**
 * Start one review per request; a later caller joins the call already running. An aborted or empty
 * result is never cached, so the next surface can ask again.
 */
export function startReview(requestID: string, run: () => Promise<string | undefined>) {
  const running = inFlight.get(requestID)
  if (running) return running

  const promise = run()
    .then((text) => {
      const value = text?.trim()

      if (value) rememberReview(requestID, value)

      return value
    })
    .catch(() => undefined)
    .finally(() => {
      if (inFlight.get(requestID) === promise) inFlight.delete(requestID)
      changed()
    })

  inFlight.set(requestID, promise)
  changed()

  return promise
}
