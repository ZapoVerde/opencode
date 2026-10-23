import { test } from "@playwright/test"
import { NO_PROVIDER } from "@opencode/app-harness/app"
import { openSettings } from "@opencode/app-harness/workspace"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } })

test("settings-light", async ({ page }) => {
  await openSettings(page, {
    name: "Screenshots",
    provider: NO_PROVIDER,
    seed: { theme: { id: "oc-2", scheme: "light" } },
  })

  await capture(page, "settings-light")
})
