import { expect, test } from "@playwright/test"
import { seed, sessionHref } from "@opencode/app-harness/app"
import { fixture, installTimelineSettings, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } })

test("session-dark", async ({ page }) => {
  await mockStressTimeline(page)
  await installTimelineSettings(page)
  await seed(page, {
    tabs: [fixture.sourceID, fixture.targetID],
    theme: { id: "oc-2", scheme: "dark" },
  })

  await page.goto(sessionHref(fixture.targetID))
  await expect(page.locator('[data-component="composer-editor"]')).toBeVisible()
  await expect(page.getByText("bun typecheck").first()).toBeAttached()

  await capture(page, "session-dark")
})
