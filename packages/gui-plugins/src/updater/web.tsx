import { Icon } from "@opencode/ui/icon"
import { showToast } from "@opencode/ui/toast"
import { createSignal, lazy, onCleanup, Suspense } from "solid-js"
import { Command, createKeyed, SettingsPage, type SetupContext } from "@opencode/plugin/gui"
import { onIdle } from "@opencode/plugin/gui/builtin"
import { startWebUpdater } from "./web-driver"
import { initialWebUpdate, webUpdateAction, type WebUpdateState } from "./web-machine"
import type definition from "./index"

/**
 * Updates for the web app and installed web app (PWA): Settings › Updates offers a check and a full reload from the
 * server. It does not announce a ready build in a toast or the titlebar; this checkout deploys often, and the worker
 * in `vite.pwa.ts` now activates and claims the window itself, so an open app moves to the new build without a prompt.
 */
export function webUpdates(ctx: SetupContext<typeof definition>) {
  const [state, setState] = createSignal<WebUpdateState>(initialWebUpdate)

  const updater = startWebUpdater({
    changed: setState,
    // Silent on purpose: no "update ready" toast to dismiss or click through.
    announce: () => {},
    report: (report) => {
      if (report.result === "up-to-date")
        return void showToast({
          variant: "success",
          icon: () => <Icon name="circle-check" />,
          title: ctx.t("toast.latest.title"),
          description: ctx.t("toast.latest.description", { version: ctx.app.version }),
        })

      showToast({ title: ctx.t("common.requestFailed"), description: report.message || undefined })
    },
  })

  onCleanup(updater.dispose)

  const run = () => {
    const next = webUpdateAction(state()).run

    if (next === "apply") return updater.apply()

    if (next === "check") updater.check()
  }

  const Section = lazy(() => import("./section"))
  onCleanup(onIdle(() => void Section.preload()))

  // Without a service worker (development, an insecure origin) a reload is already the newest build: offer nothing.
  createKeyed(
    () => state().status !== "unavailable",
    () => {
      ctx.add(SettingsPage, {
        id: "updates",
        page: "general",
        get title() {
          return ctx.t("section.title")
        },
        get entries() {
          return [
            { id: "settings-release-notes", title: ctx.t("releaseNotes.title") },
            { id: "settings-check-updates", title: ctx.t("check.title") },
            { id: "settings-reload-from-server", title: ctx.t("web.reset.title") },
          ]
        },
        render: () => (
          <Suspense>
            <Section action={() => webUpdateAction(state())} run={run} reset={() => updater.reset()} />
          </Suspense>
        ),
      })

      ctx.add(Command, (): Command => ({ id: "check", title: ctx.t("menu.check"), hidden: true, run: updater.check }))
    },
  )
}
