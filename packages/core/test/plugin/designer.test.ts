import { describe, expect } from "bun:test"
import type { SystemPart } from "@opencode/ai/effect"
import type { SessionContext } from "@opencode/plugin/effect/session"
import { Agent } from "@opencode/core/agent"
import { DesignerPlugin, PROMPT_DESIGNER, designer } from "@opencode/core/plugin/designer"
import { Permission } from "@opencode/core/permission"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Session } from "@opencode/core/session"
import { Effect, Types } from "effect"
import { it } from "../lib/effect"
import { host } from "./host"

const sessionID = Session.ID.make("ses_designer_test")
const build = Agent.ID.make("build")

/** Runs the designer plugin against stubbed domains, capturing the registered agent and context hook. */
const run = Effect.fnUntraced(function* () {
  let contextHook: ((input: SessionContext) => Effect.Effect<void>) | undefined
  const defaults = Agent.Info.default(designer)
  const designerAgent: Types.DeepMutable<Agent.Info> = {
    ...defaults,
    permissions: [...defaults.permissions],
  }
  yield* DesignerPlugin.Plugin.effect(
    host({
      agent: {
        get: () => Effect.die("unused agent.get"),
        list: () => Effect.die("unused agent.list"),
        reload: () => Effect.die("unused agent.reload"),
        transform: (callback) => {
          callback({
            list: () => [designerAgent],
            get: (id) => (id === designer ? designerAgent : undefined),
            default: () => {},
            update: (id, update) => {
              if (id === designer) update(designerAgent)
            },
            remove: () => {},
          })
          return Effect.succeed({ dispose: Effect.void })
        },
      },
      session: {
        hook: (name, callback) => {
          if (name === "context") contextHook = callback as (input: SessionContext) => Effect.Effect<void>
          return Effect.succeed({ dispose: Effect.void })
        },
      },
    }),
  )
  if (!contextHook) return yield* Effect.die("designer plugin did not register a context hook")
  return { contextHook, designerAgent }
})

const request = (agent: Agent.ID, system: Array<SystemPart>): SessionContext => ({
  sessionID,
  agent,
  model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test") },
  system,
  messages: [],
  tools: {},
  options: {},
})

describe("designer plugin", () => {
  it.effect("registers a selectable primary agent", () =>
    Effect.gen(function* () {
      const { designerAgent } = yield* run()
      expect(designerAgent.name).toBe(Agent.Name.make("Designer"))
      expect(designerAgent.mode).toBe("primary")
      expect(designerAgent.hidden).toBe(false)
      expect(designerAgent.description).toContain("delegates implementation to subagents")
    }),
  )

  it.effect("does not replace the shared system prompt", () =>
    Effect.gen(function* () {
      const { designerAgent } = yield* run()
      expect(designerAgent.system).toBeUndefined()
    }),
  )

  it.effect("keeps edits permissive, with the surface governed by instructions", () =>
    Effect.gen(function* () {
      const { designerAgent } = yield* run()
      expect(Permission.evaluate("edit", "source.ts", designerAgent.permissions).effect).toBe("allow")
      expect(Permission.evaluate("shell", "git status", designerAgent.permissions).effect).toBe("allow")
      expect(Permission.evaluate("subagent", "general", designerAgent.permissions).effect).toBe("allow")
    }),
  )

  it.effect("appends the disposition for the designer request", () =>
    Effect.gen(function* () {
      const { contextHook } = yield* run()
      const system: Array<SystemPart> = []
      yield* contextHook(request(designer, system))
      expect(system).toHaveLength(1)
      expect(system[0]?.text).toBe(PROMPT_DESIGNER)
    }),
  )

  it.effect("leaves other agents untouched", () =>
    Effect.gen(function* () {
      const { contextHook } = yield* run()
      const system: Array<SystemPart> = []
      yield* contextHook(request(build, system))
      expect(system).toHaveLength(0)
    }),
  )
})
