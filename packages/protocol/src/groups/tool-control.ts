import { Location } from "@opencode/schema/location"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { LocationQuery, locationQueryOpenApi } from "./location.js"
import { UnknownError } from "../errors.js"

const Definition = Schema.Struct({ name: Schema.String, description: Schema.String, inputSchema: Schema.Unknown, outputSchema: Schema.optional(Schema.Unknown) })
const ExecutePayload = Schema.Struct({
  sessionID: Session.ID,
  tool: Schema.String,
  input: Schema.Unknown,
  /**
   * The message this call belongs to. Tools receive it as their context
   * `messageID`, so a tool that records provenance (a trace link, an audit
   * entry) can point at a message that exists instead of a fabricated id.
   * Omitted, the handler synthesizes one, as it always did.
   */
  messageID: SessionMessage.ID.pipe(Schema.optional),
})
const ExecuteResult = Schema.Struct({ output: Schema.optional(Schema.Unknown), content: Schema.Array(Schema.Unknown), metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) })

export const ToolControlGroup = HttpApiGroup.make("server.toolControl")
  .add(HttpApiEndpoint.get("toolControl.list", "/api/tool", { query: LocationQuery, success: Location.response(Schema.Array(Definition)) })
    .annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.tool.list", summary: "List native tools", description: "List native OpenCode tools at the requested location." })))
  .add(HttpApiEndpoint.post("toolControl.execute", "/api/tool/execute", { query: LocationQuery, payload: ExecutePayload, success: Location.response(ExecuteResult), error: UnknownError })
    .annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.tool.execute", summary: "Execute native tool", description: "Execute one native OpenCode tool in an existing session without invoking a model." })))
  .annotateMerge(OpenApi.annotations({ title: "tool-control" }))
