import { SessionContext } from "@opencode/core/session/context"
import { Tool } from "@opencode/core/tool"
import { SessionMessage } from "@opencode/core/session/message"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"
import { UnknownError } from "@opencode/protocol/errors"

export const ToolControlHandler = HttpApiBuilder.group(Api, "server.toolControl", (handlers) =>
  handlers
    .handle("toolControl.list", () => response(Effect.gen(function* () {
      const registry = yield* Tool.Service
      const snapshot = yield* registry.snapshot()
      return snapshot.definitions.map((item) => ({ name: item.name, description: item.description, inputSchema: item.inputSchema, ...(item.outputSchema === undefined ? {} : { outputSchema: item.outputSchema }) }))
    })))
    .handle("toolControl.execute", Effect.fn(function* (ctx) {
      const context = yield* SessionContext.Service
      const selection = yield* context.select(ctx.payload.sessionID).pipe(Effect.mapError((error) => new UnknownError({ message: error.message })))
      const definitions = new Map(selection.tools.definitions.map((item) => [item.name, item]))
      const result = yield* selection.tools.execute({
        sessionID: selection.session.id, agent: selection.agent.id, messageID: SessionMessage.ID.create(),
        call: { type: "tool-call", id: `control_${SessionMessage.ID.create()}`, name: ctx.payload.tool, input: ctx.payload.input }, definitions,
      }).pipe(Effect.mapError((error) => new UnknownError({ message: error.message })))
      return yield* response(Effect.succeed(result))
    })),
)
