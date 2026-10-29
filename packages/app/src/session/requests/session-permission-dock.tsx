import { For, Show, onCleanup, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode/client/promise"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Button } from "@opencode/ui/button"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.action}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])

    if (value === key) return ""

    return value
  }

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
    root.style.setProperty("--permission-prompt-max-height", `${Math.max(160, Math.floor(available))}px`)
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

  // The decisions sit in the header, not the footer: a request carrying a long command can grow the dock past the
  // visible area on a phone, and the top of the dock is the part that stays reachable.
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
            <div data-slot="permission-header-title">{language.t("notification.permission.title")}</div>
          </div>
          <div data-slot="permission-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Button
              variant="neutral"
              size="normal"
              onClick={() => props.onDecide("always")}
              disabled={props.responding}
            >
              {language.t("ui.permission.allowAlways")}
            </Button>
            <Button variant="submit" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={toolDescription()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{toolDescription()}</div>
        </div>
      </Show>

      <Show when={props.request.resources.length > 0}>
        <div data-slot="permission-row" data-variant="patterns">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.resources}>
              {(pattern) => <code class="text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
