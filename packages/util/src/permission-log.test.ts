import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PermissionLog } from "./permission-log.js"

function directory() {
  return mkdtemp(path.join(tmpdir(), "opencode-permission-log-"))
}

function ask(index: number): PermissionLog.Request {
  return {
    id: `per_${index}`,
    at: index,
    session: "ses_a",
    agent: "boss",
    action: "shell",
    resources: [`git push origin ${index}`],
    cause: "default",
    shape: "git push",
    repeat: 0,
  }
}

describe("permission log", () => {
  test("keeps the newest requests and lets the oldest fall out", async () => {
    const dir = await directory()
    const file = path.join(dir, "permissions.jsonl")
    const lines = Array.from({ length: PermissionLog.Limit + 5 }, (_, index) =>
      JSON.stringify({ type: "ask", request: ask(index) }),
    )
    await writeFile(file, lines.join("\n") + "\n")

    await PermissionLog.record(
      { id: "per_new", session: "ses_a", agent: "boss", action: "shell", resources: ["cd /tmp"], cause: "default" },
      { directory: dir, at: 10_000 },
    )

    const entries = await PermissionLog.read({ directory: dir })
    expect(entries).toHaveLength(PermissionLog.Limit)
    expect(entries[0]?.id).toBe("per_6")
    expect(entries.at(-1)?.id).toBe("per_new")
    expect((await readFile(file, "utf8")).trimEnd().split("\n")).toHaveLength(PermissionLog.Limit)
  })

  test("redacts credentials and truncates long resources before writing", async () => {
    const dir = await directory()
    await PermissionLog.record(
      {
        id: "per_secret",
        session: "ses_a",
        agent: "build",
        action: "shell",
        resources: [
          "curl -H 'Authorization: Bearer abc123secret' https://user:hunter2@example.com/x",
          "npm publish " + "0123456789abcdef".repeat(40),
        ],
        cause: "default",
      },
      { directory: dir, at: 1 },
    )

    const [entry] = await PermissionLog.read({ directory: dir })
    expect(entry?.resources[0]).not.toContain("abc123secret")
    expect(entry?.resources[0]).not.toContain("hunter2")
    expect(entry?.resources[1]).toHaveLength(200)
  })

  test("groups a batched ask by the statement that forced it", async () => {
    const dir = await directory()
    await PermissionLog.record(
      {
        id: "per_batch",
        session: "ses_a",
        agent: "boss",
        action: "shell",
        resources: ["echo hello", "cd /project"],
        asker: "cd /project",
        cause: "default",
      },
      { directory: dir, at: 1 },
    )

    const [entry] = await PermissionLog.read({ directory: dir })
    expect(entry).toMatchObject({ asker: "cd /project", shape: "cd" })
  })

  test("counts repeats of the same shape inside one session", async () => {
    const dir = await directory()
    const record = (id: string, session: string, command: string, cause: PermissionLog.Cause = "default") =>
      PermissionLog.record(
        { id, session, agent: "boss", action: "shell", resources: [command], cause },
        { directory: dir, at: 1 },
      )

    await record("per_r1", "ses_a", "cd /config/workspace/opencode2")
    await record("per_r2", "ses_a", "cd /tmp/elsewhere")
    await record("per_r3", "ses_b", "docker compose logs opencode2")
    await record("per_r4", "ses_a", "docker compose logs web", "rule")

    const entries = await PermissionLog.read({ directory: dir })
    expect(entries.map((entry) => [entry.id, entry.shape, entry.repeat])).toEqual([
      ["per_r1", "cd", 0],
      ["per_r2", "cd", 1],
      ["per_r3", "docker compose logs", 0],
      ["per_r4", "docker compose logs", 0],
    ])
  })

  test("records how long the answer took", async () => {
    const dir = await directory()
    await PermissionLog.record(
      { id: "per_reply", session: "ses_a", agent: "boss", action: "shell", resources: ["git push"], cause: "default" },
      { directory: dir, at: 1_000 },
    )
    await PermissionLog.reply({ id: "per_reply", reply: "session" }, { directory: dir, at: 2_500 })

    const [entry] = await PermissionLog.read({ directory: dir })
    expect(entry?.reply).toEqual({ at: 2_500, reply: "session", latency: 1_500 })
  })

  test("groups the log by agent, cause and shape", () => {
    const entry = (id: string, cause: PermissionLog.Cause, shape: string, reply?: string): PermissionLog.Entry => ({
      ...ask(0),
      id,
      cause,
      shape,
      ...(reply ? { reply: { at: 100, reply, latency: 100 } } : {}),
    })

    const rows = PermissionLog.summarize([
      entry("per_1", "default", "cd", "once"),
      entry("per_2", "default", "cd", "once"),
      entry("per_3", "rule", "docker compose up", "reject"),
      entry("per_4", "default", "cd"),
    ])

    expect(rows).toEqual([
      {
        agent: "boss",
        action: "shell",
        cause: "default",
        shape: "cd",
        asks: 3,
        once: 2,
        session: 0,
        always: 0,
        reject: 0,
        unanswered: 1,
        latency: 100,
      },
      {
        agent: "boss",
        action: "shell",
        cause: "rule",
        shape: "docker compose up",
        asks: 1,
        once: 0,
        session: 0,
        always: 0,
        reject: 1,
        unanswered: 0,
        latency: 100,
      },
    ])
  })
})
