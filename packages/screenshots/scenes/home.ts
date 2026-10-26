import { expect, test } from "@playwright/test"
import { seed } from "@opencode/app-harness/app"
import { fixture, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block" })

test("home", async ({ page }) => {
  await mockStressTimeline(page)
  await seed(page, {
    usedProjects: { local: [fixture.project.id] },
  })

  await page.goto("/")
  await expect(page.locator('[data-component="home-session-row"]').first()).toBeVisible()

  await capture(page, "home")
})
