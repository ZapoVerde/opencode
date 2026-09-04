import { expect, test } from "bun:test"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"

test("keeps base gpt-5.6 available for ChatGPT OAuth", async () => {
  const hooks = await CodexAuthPlugin({} as never)
  const limit = { context: 1_050_000, input: 922_000, output: 128_000 }
  const provider = {
    models: {
      "gpt-5.6": { id: "gpt-5.6", api: { id: "gpt-5.6" }, limit, cost: {}, options: {} },
      "gpt-5.6-luna": { id: "gpt-5.6-luna", api: { id: "gpt-5.6-luna" }, limit, cost: {}, options: {} },
    },
  }

  const models = await hooks.provider!.models!(provider as never, { auth: { type: "oauth" } } as never)

  expect(models["gpt-5.6"]).toBeDefined()
  expect(models["gpt-5.6-luna"]).toBeDefined()
  expect(models["gpt-5.6"]?.limit).toEqual({ context: 400_000, input: 272_000, output: 128_000 })
  expect(models["gpt-5.6-luna"]?.limit).toEqual({ context: 400_000, input: 272_000, output: 128_000 })
})
