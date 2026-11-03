export * as SessionSystemPrompt from "./system-prompt.js"

import type { Agent } from "@opencode/schema/agent"
import PROMPT from "./runner/prompt/system.txt"

/** The agent's own identity, so it can answer "which agent am I" without a tool call. */
export type Identity = {
  readonly id: Agent.ID
  readonly name: Agent.Name
  readonly remit?: string
}

export function make(tools: string[], identity?: Identity) {
  return render(PROMPT, tools, identity)
}

export function render(prompt: string, tools: string[], identity?: Identity) {
  const instructions: string[] = []
  if (tools.includes("shell")) {
    instructions.push(
      "- Prefer dedicated tools over shell commands; fall back to the shell when a tool cannot do what you need.",
      "- Do not chain shell commands with separators like `echo \"====\";` or `printf '---'`; the output becomes noisy in a way that makes the user's side of the conversation worse.",
    )
  }
  if (tools.includes("write")) {
    instructions.push(
      "- Use the write tool to create files or completely replace their content. Prefer using the edit tool for targeted changes.",
    )
  }
  if (tools.includes("edit")) {
    instructions.push(
      "- Use the edit tool for targeted changes to existing text files. It replaces the exact text in `oldString` with `newString`, and the values must differ. By default, `oldString` must occur exactly once. If it occurs multiple times, include more surrounding context to make it unique or set `replaceAll` to true to replace every occurrence.",
    )
  }
  return identityBanner(identity) + prompt.replace("${OPENCODE_TOOL_GUIDANCE}", instructions.join("\n"))
}

/**
 * State the agent up front, in the shape the permission dock uses: the name
 * first, then one sentence of remit when the agent has one. An agent that
 * cannot tell what it is has no way to notice it is being asked to act outside
 * its job, and asks the user instead of checking.
 */
function identityBanner(identity?: Identity) {
  if (!identity) return ""
  const remit = identity.remit?.trim()
  const lines = [
    `<agent id="${identity.id}" name="${identity.name}">`,
    `You are ${identity.name}.`,
    ...(remit ? [remit] : []),
    "This is who you are; do not ask which agent you are.",
    "</agent>",
  ]
  return lines.join("\n") + "\n\n"
}
