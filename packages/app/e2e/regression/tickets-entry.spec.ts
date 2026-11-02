import { expect, test, type Page } from "@playwright/test"
import { seed, sessionHref } from "@opencode/app-harness/app"
import { fixture, mockStressTimeline } from "@opencode/app-harness/session-fixture"

// The Tickets entry is the second way a person reaches the read-only board at
// /tickets/. It must sit beside Usage in both surfaces that carry Usage, and it
// must carry the attention dot only when the board says work waits on a person.
const board = (needsYou: number) => ({
  generatedAt: 0,
  counts: { needsYou, working: 0, closed: 0, stale: 0, total: needsYou },
  needsYou: [],
  working: [],
  closed: [],
})

async function mockBoard(page: Page, needsYou: number) {
  await page.route(/\/tickets\/api\/board$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(board(needsYou)) }),
  )
}

const drawer = (page: Page) => page.locator('[data-slot="mobile-tabs-drawer"]')

async function openDrawer(page: Page) {
  await page.locator('[data-slot="mobile-tabs-trigger"]').click()
  await expect(drawer(page)).toBeVisible()
}

test("the phone tabs drawer opens the board from a Tickets entry beside Usage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockStressTimeline(page)
  await mockBoard(page, 0)
  await seed(page, { usedProjects: { local: [fixture.project.id] } })
  await page.goto(sessionHref(fixture.targetID))
  await openDrawer(page)

  const tickets = drawer(page).locator('[data-action="mobile-tabs-tickets"]')
  const usage = drawer(page).locator('[data-action="mobile-tabs-usage"]')
  await expect(tickets).toHaveText("Tickets")
  await expect(usage).toHaveText("Usage")
  // Beside Usage: the same row, Tickets immediately after it.
  expect(await tickets.evaluate((element) => element.previousElementSibling?.getAttribute("data-action"))).toBe(
    "mobile-tabs-usage",
  )
  // No waiting work, so no dot: the entry must not claim attention it cannot prove.
  await expect(tickets.locator('[data-slot="mobile-tabs-attention"]')).toHaveCount(0)
})

test("a waiting ticket puts the attention dot on both Tickets entries", async ({ page }) => {
  // The Home utility nav only renders from the lg breakpoint up.
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockStressTimeline(page)
  await mockBoard(page, 2)
  await seed(page, { usedProjects: { local: [fixture.project.id] } })
  await page.goto("/")

  // Home renders the utility nav twice, for the wide sidebar and the md–lg bar.
  const home = page.locator('[data-action="home-tickets"]:visible')
  await expect(home).toHaveText(/Tickets/)
  await expect(home.locator('[data-slot="home-tickets-attention"]')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await openDrawer(page)
  await expect(drawer(page).locator('[data-slot="mobile-tabs-attention"]')).toBeVisible()
})
