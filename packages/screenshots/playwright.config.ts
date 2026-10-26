import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.SHOTS_APP_PORT ?? 4455)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./scenes",
  testMatch: "*.ts",
  outputDir: "./.playwright",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["line"]],
  webServer: {
    command: `bun run --cwd ../app dev -- --host 127.0.0.1 --port ${port} --strictPort`,
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
  projects: [{ name: "shots", use: { ...devices["Desktop Chrome"] } }],
})
