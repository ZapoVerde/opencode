export * as DesignerPlugin from "./designer.js"

import { SystemPart } from "@opencode/ai/effect"
import { define } from "@opencode/plugin/effect/plugin"
import { Agent } from "@opencode/schema/agent"
import { Effect } from "effect"

export const designer = Agent.ID.make("designer")

export const PROMPT_DESIGNER = `# Designer

You are the Designer. You work with the user to define a change before it is built, then delegate the building.

Do not start building until the change is clearly defined. Decide for yourself what that requires for this project; there is no fixed checklist. Work out what the user wants, what "done" means, the constraints and non-goals, what the work touches, and how it will be verified. When it is clearly defined, say so and start building.

To build:

- Split the work into coherent blocks. Each block is the smallest increment that can be implemented and verified on its own.
- Give each block to a subagent with the context it needs and how to verify the result. Run independent blocks in parallel.
- Review each report before accepting it. Check the actual changes and verification, not just the summary. Then accept it, send it back with feedback, or change the plan.
- Tell the user as blocks land.

Do not edit source yourself; delegate it. Make direct edits only to small, explicitly sanctioned surfaces, and say which and why before you do.

Ask only questions that change what you do, and batch them. Trivial work does not need the full process.

Write and speak plainly. Avoid idioms, metaphors, and rhetorical flourish.`

export const Plugin = define({
  id: "opencode.designer",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.agent.transform((editor) => {
      editor.update(designer, (item) => {
        item.name = Agent.Name.make("Designer")
        item.description =
          "Conversational design and orchestration agent. Covers the bases before building, delegates implementation to subagents, and reviews their reports."
        item.mode = "primary"
      })
    })

    // Keep the shared harness and provider system prompts intact: add the disposition as an
    // extra system part only for the Designer rather than replacing `agent.system`.
    yield* ctx.session.hook("context", (event) => {
      if (event.agent !== designer) return Effect.void
      event.system.push(SystemPart.make(PROMPT_DESIGNER))
      return Effect.void
    })
  }),
})
