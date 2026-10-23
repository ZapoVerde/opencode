import { expect, test, type Page } from "@playwright/test"
import { fixture, installStressSessionTabs } from "@opencode/app-harness/session-fixture"
import { sessionHref } from "@opencode/app-harness/app"
import { openWithDirection } from "@opencode/app-harness/direction"
import { openDraft } from "@opencode/app-harness/workspace"
import { mockOpenCodeServer } from "@opencode/app-harness/mock-server"

declare global {
  interface Window {
    showKeyboard: (height: number) => void
  }
}

for (const { width, direction } of [
  { width: 390, direction: "ltr" },
  { width: 390, direction: "rtl" },
  { width: 1280, direction: "ltr" },
] as const) {
  test(`submitting a prompt ${width < 768 ? "unfocuses" : "keeps focus on"} the composer at ${width}px in ${direction}`, async ({
    page,
  }) => {
    await openSubmitSession(page, width, direction)

    const editor = page.getByRole("textbox", { name: "Prompt", exact: true })
    await expect(editor).toBeEditable()
    await editor.fill("Please check focus after sending.")
    await expect(editor).toBeFocused()

    const admitted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/session/${fixture.targetID}/prompt`,
    )

    await editor.press("Enter")
    expect((await admitted).ok()).toBe(true)
    await expect(editor).toBeEmpty()

    if (width < 768) {
      await expect(editor).not.toBeFocused()

      return
    }

    await expect(editor).toBeFocused()
  })
}

test.describe("touch submission", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test("tapping Send unfocuses the composer", async ({ page }) => {
    await openSubmitSession(page, 390, "ltr")
    const editor = page.getByRole("textbox", { name: "Prompt", exact: true })
    await expect(editor).toBeEditable()
    await editor.fill("Please dismiss the keyboard after sending.")
    await expect(editor).toBeFocused()

    const admitted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/session/${fixture.targetID}/prompt`,
    )

    await page.getByRole("button", { name: "Send", exact: true }).tap()
    expect((await admitted).ok()).toBe(true)
    await expect(editor).toBeEmpty()
    await expect(editor).not.toBeFocused()
  })

  test("keeps the composer above a keyboard that only resizes the visual viewport", async ({ page }) => {
    await installVisualKeyboard(page)
    const draft = await openDraft(page, { name: "Keyboard" })

    await draft.editor.focus()
    await page.evaluate(() => window.showKeyboard(420))

    await expect(page.locator("html")).toHaveAttribute("data-keyboard")
    await expect
      .poll(() => page.locator("#root").evaluate((element) => element.getBoundingClientRect().height))
      .toBe(420)
    await expect
      .poll(() =>
        page.locator('[data-component="composer"]').evaluate((element) => element.getBoundingClientRect().bottom),
      )
      .toBeLessThanOrEqual(420)

    await page.evaluate(() => window.showKeyboard(844))
    await expect(page.locator("html")).not.toHaveAttribute("data-keyboard")
  })
})

async function openSubmitSession(page: Page, width: number, direction: "ltr" | "rtl") {
  await page.setViewportSize({ width, height: 844 })
  await mockOpenCodeServer(page, {
    directory: fixture.directory,
    project: fixture.project,
    sessions: fixture.sessions,
    provider: fixture.provider,
    pageMessages: () => ({ items: [] }),
  })
  await installStressSessionTabs(page)
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { mobileTitlebarPosition: "bottom" } }))
  })
  await openWithDirection(page, sessionHref(fixture.targetID), direction)
}

// The viewport metadata asks browsers to resize the layout viewport for the software keyboard, but some resize only
// the visual viewport. Emulate one: the app must keep its own height in step with the visible area.
async function installVisualKeyboard(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<(event: Event) => void>()

    const viewport = {
      width: 390,
      height: 844,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (type === "resize") listeners.add(listener)
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        if (type === "resize") listeners.delete(listener)
      },
      dispatchEvent: (event: Event) => {
        listeners.forEach((listener) => listener(event))

        return true
      },
    }

    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport })

    window.showKeyboard = (height) => {
      viewport.height = height
      viewport.dispatchEvent(new Event("resize"))
    }
  })
}
