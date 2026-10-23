import { expect, test } from "@playwright/test"
import { seed, sessionHref } from "@opencode/app-harness/app"
import { fixture, installTimelineSettings, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } })

test("session-dark", async ({ page }) => {
  await mockStressTimeline(page)
  await installTimelineSettings(page)
  await seed(page, {
    projects: { local: [{ worktree: fixture.directory, expanded: true }] },
    lastProject: { local: fixture.directory },
    tabs: [fixture.sourceID, fixture.targetID],
    theme: { id: "oc-2", scheme: "dark" },
  })

  await page.goto(sessionHref(fixture.targetID))
  await expect(page.locator('[data-component="composer-editor"]')).toBeVisible()
  await expect(page.getByText("bun typecheck").first()).toBeVisible()

  await capture(page, "session-dark")
})
