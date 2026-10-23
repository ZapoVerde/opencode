import { expect, test } from "@playwright/test"
import { seed, sessionHref } from "@opencode/app-harness/app"
import { fixture, installTimelineSettings, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } })

test("session-mobile", async ({ page }) => {
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
  await expect(
    page.locator(
      `[data-timeline-row="UserMessage"][data-message-id="${fixture.expected.targetMessageIDs.at(-1)}"]`,
    ),
  ).toBeVisible()

  await capture(page, "session-mobile")
})
