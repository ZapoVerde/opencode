import { expect, test } from "bun:test"
import { SessionSystemPrompt } from "@opencode/core/session/system-prompt"
import { Agent } from "@opencode/schema/agent"

const identity = {
  id: Agent.ID.make("build"),
  name: Agent.Name.make("Build"),
  remit: "Build writes and edits code in the workspace.",
}

test("renders the default system prompt instructions", () => {
  const prompt = SessionSystemPrompt.make(["edit", "read", "shell"])
  expect(prompt).not.toContain("${OPENCODE_TOOL_GUIDANCE}")
  expect(prompt).toContain("Use the edit tool for targeted changes to existing text files")
})

test("tells the agent which agent it is", () => {
  const prompt = SessionSystemPrompt.make(["read"], identity)
  expect(prompt).toContain('<agent id="build" name="Build">')
  expect(prompt).toContain("You are Build.")
  expect(prompt).toContain("Build writes and edits code in the workspace.")
  // Named once, in one block: the body never repeats the identity.
  expect(prompt.split("You are Build.").length - 1).toBe(1)
})

test("omits the identity block when there is no agent to name", () => {
  const prompt = SessionSystemPrompt.make(["read"])
  expect(prompt).not.toContain("<agent")
  expect(prompt).not.toContain("This is who you are")
})

test("an agent without a remit still gets its name and id", () => {
  const prompt = SessionSystemPrompt.make(["read"], { id: Agent.ID.make("plan"), name: Agent.Name.make("Plan") })
  expect(prompt).toContain('<agent id="plan" name="Plan">')
  expect(prompt).toContain("You are Plan.")
  expect(prompt).not.toContain("undefined")
})

test("identity comes before the tool guidance so it is not buried", () => {
  const prompt = SessionSystemPrompt.make(["edit"], identity)
  expect(prompt.indexOf("You are Build.")).toBeLessThan(
    prompt.indexOf("Use the edit tool for targeted changes"),
  )
})

test("a blank remit is skipped rather than leaving an empty line", () => {
  const prompt = SessionSystemPrompt.make(["read"], { ...identity, remit: "   " })
  // Name and the closing line stay adjacent, with no gap where the remit would be.
  expect(prompt).toContain("You are Build.\nThis is who you are")
})
