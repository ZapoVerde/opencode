import { story } from "@opencode/stories/playwright/story"
import { capture } from "../src/shot"

const id = process.env.SHOTS_STORY_ID

if (!id) {
  throw new Error("SHOTS_STORY_ID is required, for example current-session-error-card--provider-errors")
}

story("capture story", async ({ mount }) => {
  const root = await mount(id)
  await capture(root, process.env.SHOTS_NAME ?? id)
})
