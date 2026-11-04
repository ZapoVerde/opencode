import { expect } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Agent } from "@opencode/core/agent"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { Tool } from "@opencode/core/tool"
import { ensurePluginRuntime } from "@opencode/plugin/runtime"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Effect, Exit } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

/**
 * The out-of-tree ticket plugin lives outside this repository, so this test
 * skips when that checkout is absent. It runs the plugin through the real
 * Promise adapter: schema-validated input, the trace the host supplies, and the
 * failure shape the agent loop receives. The plugin's own suite cannot see
 * that boundary.
 */
const PLUGIN_DIR = "/config/workspace/opencode2-tickets"

const it = testEffect(PluginTestLayer)

it.live(
  "loads the out-of-tree ticket plugin and writes through the host",
  () =>
    Effect.gen(function* () {
      if (!existsSync(path.join(PLUGIN_DIR, "server.ts"))) return
      const directory = mkdtempSync(path.join(os.tmpdir(), "tickets-host-"))
      process.env.OPENCODE_TICKETS_DB = path.join(directory, "tickets.db")
      ensurePluginRuntime()
      const plugins = yield* Plugin.Service
      const tools = yield* Tool.Service

      const module = yield* Effect.promise(() => import(path.join(PLUGIN_DIR, "server.ts")))
      yield* PluginPromise.fromPromise(module.default).effect(yield* PluginHost.make(plugins, "tickets"))

      expect((yield* tools.list()).map((tool) => tool.name).sort()).toEqual([
        "ticket_artifact",
        "ticket_create",
        "ticket_handover",
        "ticket_note",
        "ticket_owner",
        "ticket_question",
        "ticket_relation",
        "ticket_stage",
      ])

      const snapshot = yield* tools.snapshot()
      const call = (id: string, name: string, input: unknown) =>
        snapshot.execute({
          sessionID: Session.ID.make("ses_ticket_host"),
          agent: Agent.ID.make("build"),
          messageID: SessionMessage.ID.make(`msg_${id}`),
          call: { type: "tool-call", id: `call_${id}`, name, input },
        })

      const created = yield* call("create", "ticket_create", {
        title: "Host load",
        intent: "prove the plugin loads in the host",
      })
      const id = /tick_[a-z0-9]+/.exec(JSON.stringify(created))?.[0]
      expect(id).toBeDefined()

      const staged = yield* call("stage", "ticket_stage", { ticket: id, stage: "building" })
      expect(JSON.stringify(staged)).toContain("planned → building")

      // The loop this shape forbids: deploy, check, find it wanting, reopen.
      yield* call("ready", "ticket_stage", { ticket: id, stage: "ready-to-deploy" })
      yield* call("deploy", "ticket_stage", { ticket: id, stage: "deployed" })
      const reopen = yield* call("reopen", "ticket_stage", { ticket: id, stage: "building" }).pipe(Effect.exit)
      expect(Exit.isFailure(reopen)).toBe(true)
      expect(String(JSON.stringify(reopen))).toContain("cannot move from deployed to building")

      // The follow-up is a new ticket that points back at what prompted it.
      const followUp = yield* call("follow", "ticket_create", {
        title: "Cap retries",
        intent: "stop retrying after five attempts",
      })
      const followUpID = /tick_[a-z0-9]+/.exec(JSON.stringify(followUp))?.[0]
      const related = yield* call("relate", "ticket_relation", {
        ticket: followUpID,
        relation: "fork",
        target: id,
      })
      expect(JSON.stringify(related)).toContain(`${followUpID} fork ${id}`)

      // abandoned is terminal, so leaving it must surface the refusal too.
      yield* call("abandon", "ticket_stage", { ticket: followUpID, stage: "abandoned" })
      const refused = yield* call("bad", "ticket_stage", { ticket: followUpID, stage: "building" }).pipe(Effect.exit)
      expect(Exit.isFailure(refused)).toBe(true)
      expect(String(JSON.stringify(refused))).toContain("cannot move from abandoned to building")

      rmSync(directory, { recursive: true, force: true })
    }),
  30_000,
)
