import { expect, test } from "@playwright/test"
import { seed } from "@opencode/app-harness/app"
import { fixture, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block" })

test("home", async ({ page }) => {
  await mockStressTimeline(page)
  await seed(page, {
    projects: { local: [{ worktree: fixture.directory, expanded: true }] },
    lastProject: { local: fixture.directory },
  })

  await page.goto("/")
  await expect(page.locator('[data-component="home-session-row"]').first()).toBeVisible()

  await capture(page, "home")
})
