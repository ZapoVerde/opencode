import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.SHOTS_STORIES_PORT ?? 6006)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./story",
  testMatch: "*.ts",
  outputDir: "./.playwright-story",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["line"]],
  webServer: {
    command: `bun run --cwd ../stories dev --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL,
    serviceWorkers: "block",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "stories", use: { ...devices["Desktop Chrome"] } }],
})
