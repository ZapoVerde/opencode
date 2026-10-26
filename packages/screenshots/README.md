# Screenshots

Central screenshot tool for reviewing OpenCode's real UI. It lives in its own workspace package, not in
`packages/app/e2e`, so anyone can capture representative screens without owning app test code.

Each scene renders the **real app** on the Vite dev server against the in-memory mock backend from
`@opencode/app-harness`. There is no production build, no real backend, and no real data. It is a review tool,
not a CI pixel-baseline suite: nothing compares pixels or fails on visual differences.

## Commands

From the repository root:

```sh
bun run shots                  # capture every app scene
bun run shots:ui               # watch and rerun scenes in Playwright UI mode
SHOTS_STORY_ID=<id> bun run shots:story
```

Run a single scene with Playwright's `--grep`:

```sh
bun run shots -- --grep "session-dark"
```

The story command mounts a story on the shared story server in `packages/stories` and captures it. Example ID:
`current-session-error-card--provider-errors`. Story ids are the story file's meta `id` (or kebab-cased `title`)
followed by `--` and the kebab-cased export, as `packages/stories` names them.

To browse stories, run `bun run dev:stories` and open `http://127.0.0.1:6006/?id=<id>`, or use the components
lab at `/components` in a dev build of the app.

## Output

PNGs land in `packages/screenshots/output/` by default. Point `SHOTS_DIR` elsewhere to keep them out of the
repository:

```sh
SHOTS_DIR=/tmp/opencode/shots bun run shots
```

`SHOTS_NAME` overrides the file name of a story capture. `SHOTS_APP_PORT` and `SHOTS_STORIES_PORT` choose the
dev server ports (defaults `4455` and `6006`).

## Adding a scene

1. Add one file to `packages/screenshots/scenes/` exporting a Playwright `test`.
2. Seed the state with the harness (`mockStressTimeline`, `mockOpenCodeServer`, `seed`, `openSettings`, ...).
3. Navigate, then wait for the specific UI state the screenshot needs (a visible component or text). Never use
   `waitForTimeout`.
4. Call `capture(page, "name")` (or pass a `Locator` to crop to an element).

```ts
import { expect, test } from "@playwright/test"
import { seed } from "@opencode/app-harness/app"
import { fixture, mockStressTimeline } from "@opencode/app-harness/session-fixture"
import { capture } from "../src/shot"

test.use({ serviceWorkers: "block" })

test("home", async ({ page }) => {
  await mockStressTimeline(page)
  await seed(page, { usedProjects: { local: [fixture.project.id] } })

  await page.goto("/")
  await expect(page.locator('[data-component="home-session-row"]').first()).toBeVisible()

  await capture(page, "home")
})
```

## Container note

If the local dev server hits the inotify limit, set `CHOKIDAR_USEPOLLING=true`. Both the app and the story
server watch through Vite:

```sh
CHOKIDAR_USEPOLLING=true SHOTS_STORY_ID=<id> bun run shots:story
```

