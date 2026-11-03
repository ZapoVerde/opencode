import { expect, test } from "bun:test"
import { OpenCode } from "../src/promise/index"

/**
 * A tool-control call may name the message it belongs to, and the client must
 * put that field on the wire unchanged. Tools that record provenance — the
 * tickets plugin writes a trace link per write — hand the host a message id,
 * and an id the request never carried cannot become a link.
 */
const capture = async (payload: Record<string, unknown>) => {
  let body: unknown
  const client = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init)
      body = await request.clone().json().catch(() => undefined)
      return Response.json({ output: {}, content: [] })
    },
  })
  await client["server.toolControl"].tool.execute({
    location: { directory: "/repo" },
    ...payload,
  } as never)
  return body
}

test("forwards a caller-supplied messageID on tool execution", async () => {
  const body = await capture({
    sessionID: "ses_1",
    tool: "ticket_create",
    input: { title: "t" },
    messageID: "msg_abc123",
  })
  expect(body).toMatchObject({ sessionID: "ses_1", tool: "ticket_create", messageID: "msg_abc123" })
})

test("omits messageID when the caller does not supply one", async () => {
  const body = (await capture({
    sessionID: "ses_1",
    tool: "ticket_create",
    input: { title: "t" },
  })) as Record<string, unknown>
  // Absent, not null: the server picks the fallback only when the field is missing.
  expect(Object.hasOwn(body, "messageID")).toBe(false)
})
