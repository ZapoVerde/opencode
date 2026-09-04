import { expect, test } from "bun:test"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"

test("keeps base gpt-5.6 available for ChatGPT OAuth", async () => {
  const hooks = await CodexAuthPlugin({} as never)
  const limit = { context: 1_050_000, input: 922_000, output: 128_000 }
  const provider = {
    models: Object.fromEntries(
      ["gpt-5.6", "gpt-5.6-luna"].map((id) => [id, { id, api: { id }, limit, cost: {}, options: {} }]),
    ),
  }
  const models = await hooks.provider!.models!(provider as never, { auth: { type: "oauth" } } as never)
  expect(models["gpt-5.6"]).toBeDefined()
  expect(models["gpt-5.6-luna"]).toBeDefined()
  expect(models["gpt-5.6"]?.limit).toEqual({ context: 400_000, input: 272_000, output: 128_000 })
  expect(models["gpt-5.6-luna"]?.limit).toEqual({ context: 400_000, input: 272_000, output: 128_000 })
})
