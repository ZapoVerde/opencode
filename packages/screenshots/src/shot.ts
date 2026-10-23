import type { Locator, Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

export async function capture(target: Page | Locator, name: string) {
  const dir = process.env.SHOTS_DIR ?? path.resolve(import.meta.dirname, "../output")
  await fs.promises.mkdir(dir, { recursive: true })
  await target.screenshot({ path: path.join(dir, name + ".png"), animations: "disabled", caret: "hide" })
}
