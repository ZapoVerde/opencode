import { For, Show, createResource, onCleanup, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode/client/promise"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { makeEventListener } from "@solid-primitives/event-listener"
import { abort } from "@opencode/util/abort"
import { Button } from "@opencode/ui/button"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { describePermission } from "./permission-description"

type PermissionAgent = { id: string; name: string; remit?: string }

// Switching away and back must not start a second model review for the same pending request.
const reviewCache = new Map<string, string>()
const reviewCacheLimit = 50

function rememberReview(id: string, text: string) {
  reviewCache.delete(id)
  reviewCache.set(id, text)
  for (const oldest of reviewCache.keys()) {
    if (reviewCache.size <= reviewCacheLimit) break
    reviewCache.delete(oldest)
  }
}

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  agent?: PermissionAgent
  agents?: readonly PermissionAgent[]
  onDecide: (response: "once" | "session" | "always" | "reject", message?: string) => void
  onRoute?: (agent: string) => void
  review?: (request: PermissionRequest, signal: AbortSignal) => Promise<string>
}) {
  const language = useLanguage()
  const description = () => describePermission(props.request, props.agent?.id)
  const t = (key: string) => language.t(key as Parameters<typeof language.t>[0])
  let reviewAbort: AbortController | undefined
  // A review follows the open dock. Switching sessions or requests must abort it, or the stale model call keeps
  // holding a browser connection and the next session waits behind it.
  onCleanup(() => abort(reviewAbort))
  const [review] = createResource(
    () =>
      props.review && !props.request.message && !reviewCache.has(props.request.id) ? props.request.id : undefined,
    () => {
      const cached = reviewCache.get(props.request.id)
      if (cached) return Promise.resolve(cached)
      abort(reviewAbort)
      const controller = new AbortController()
      reviewAbort = controller
      return (props.review?.(props.request, controller.signal) ?? Promise.resolve("")).then((text) => {
        if (text.trim() && !controller.signal.aborted) rememberReview(props.request.id, text)
        return text
      })
    },
  )
  const reviewText = () =>
    (reviewCache.get(props.request.id) ?? review() ?? props.request.message ?? "").trim().slice(0, 1200)

  let root: HTMLDivElement | undefined
  let measuring: number | undefined

  // The dock is anchored to the bottom of the pane, so a request taller than the pane is clipped at its top. Cap it to
  // the visible space: the decisions sit in the header and must stay reachable, and the resource list scrolls instead.
  const measure = () => {
    if (!root) return

    const region = root.closest('[data-component="session-composer-dock"]')
    const pane = region?.parentElement?.previousElementSibling

    if (!(region instanceof HTMLElement) || !(pane instanceof HTMLElement)) return

    // The region springs its own height while a request opens, so the dock's bottom moves until the spring settles. The
    // region's bottom and padding are fixed, so measure those instead of reading the dock back mid-animation.
    const inset = Number.parseFloat(getComputedStyle(region).paddingBottom) || 0
    const available = region.getBoundingClientRect().bottom - inset - pane.getBoundingClientRect().top
    // On a phone the request should not become the whole screen: keep part of the conversation visible above it
    // while the decision is considered. The dock's content scrolls inside this cap.
    const cap = window.innerWidth <= 767 ? pane.getBoundingClientRect().height * 0.62 : available
    root.style.setProperty("--permission-prompt-max-height", `${Math.max(140, Math.floor(Math.min(available, cap)))}px`)
  }

  const requestMeasure = () => {
    if (measuring !== undefined) return
    measuring = requestAnimationFrame(() => {
      measuring = undefined
      measure()
    })
  }

  onMount(() => {
    requestMeasure()
    makeEventListener(window, "resize", requestMeasure)
    if (window.visualViewport) makeEventListener(window.visualViewport, "resize", requestMeasure)

    const region = root?.closest('[data-component="session-composer-dock"]')
    const pane = region?.parentElement?.previousElementSibling
    // The region has no height of its own until the request opens, and springs to its height after mount. Watching it
    // re-measures once that spring lands, including on the first request of a session.
    createResizeObserver([region, pane, root?.closest('[data-slot="session-chat-panel"]')], requestMeasure)

    onCleanup(() => {
      if (measuring !== undefined) cancelAnimationFrame(measuring)
    })
  })

  const route = () => {
    const target = description().target
    if (!target || !props.onRoute) return
    const agent = props.agents?.find((item) => item.id === target.agent)
    if (props.agents && !agent) return
    return {
      ...target,
      name: agent?.name ?? target.agent[0].toUpperCase() + target.agent.slice(1),
    }
  }

  return (
    <DockPrompt
      kind="permission"
      ref={(element) => (root = element)}
      header={
        <>
          <div data-slot="permission-row" data-variant="header">
            <span data-slot="permission-icon">
              <Icon name="warning" size="normal" />
            </span>
            <div data-slot="permission-header-title">
              {props.agent
                ? language.t("permission.title.outside", { agent: props.agent.name })
                : language.t("notification.permission.title")}
            </div>
          </div>
          <div data-slot="permission-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Button variant="submit" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <div data-slot="permission-summary">
          <div data-slot="permission-hint">{t(description().summary)}</div>
          <Show when={description().consequence}>
            {(key) => <div data-slot="permission-consequence">{t(key())}</div>}
          </Show>
          <Show when={reviewText() || review.loading || review.error}>
            <div data-slot="permission-review">
              <div data-slot="permission-review-title">{language.t("permission.reviewer")}</div>
              <div data-slot="permission-review-text">
                {reviewText() ||
                  (review.loading
                    ? language.t("permission.reviewer.loading")
                    : language.t("permission.reviewer.unavailable"))}
              </div>
            </div>
          </Show>
          <Show when={props.agent?.remit}>
            {(remit) => (
              <div data-slot="permission-remit">
                {language.t("permission.remit", { remit: remit(), agent: props.agent?.name ?? "" })}
              </div>
            )}
          </Show>
          <Show when={route()}>
            {(target) => (
              <div data-slot="permission-route">
                <div>
                  {language.t("permission.route.title", { agent: target().name })}
                  <span> {t(target().reason)}</span>
                </div>
                <Button variant="neutral" size="normal" onClick={() => props.onRoute?.(target().agent)}>
                  {language.t("permission.route.switch", { agent: target().name })}
                </Button>
              </div>
            )}
          </Show>
          <Show when={props.request.scope}>
            {(scope) => (
              <Button
                variant="neutral"
                size="normal"
                class="w-full"
                onClick={() => props.onDecide("session")}
                disabled={props.responding}
              >
                {language.t("permission.allowScope", { scope: scope().label })}
              </Button>
            )}
          </Show>
        </div>
      </div>

      <Show when={props.request.resources.length > 0}>
        <div data-slot="permission-row" data-variant="patterns">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <div data-slot="permission-details-label">{language.t("permission.details")}</div>
            <For each={props.request.resources}>
              {(pattern) => <code class="text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
