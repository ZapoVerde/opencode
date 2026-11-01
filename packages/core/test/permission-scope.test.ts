import { describe, expect, test } from "bun:test"
import { Permission } from "@opencode/core/permission"

const shell = (resources: string[]) => ({ action: "shell", resources })

describe("permission session scope", () => {
  test("groups a command into the narrowest safe family", () => {
    expect(Permission.scope(shell(["git status --porcelain"]))).toMatchObject({
      id: "git-read",
      label: "read-only git",
    })
    expect(Permission.scope(shell(["git status", "git diff --stat"]))).toMatchObject({ id: "git-read" })
    expect(Permission.scope(shell(["bun test src/date.test.ts"]))).toMatchObject({ id: "test" })
    expect(Permission.scope(shell(["bun run lint"]))).toMatchObject({ id: "lint" })
    expect(Permission.scope(shell(["tsc --noEmit"]))).toMatchObject({ id: "build" })
  })

  test("does not grant a session scope for risky or mixed commands", () => {
    expect(Permission.scope(shell(["npm publish"]))).toBeUndefined()
    expect(Permission.scope(shell(["git push origin dev"]))).toBeUndefined()
    expect(Permission.scope(shell(["rm -rf build"]))).toBeUndefined()
    expect(Permission.scope(shell(["git status", "npm publish"]))).toBeUndefined()
    expect(Permission.scope(shell(["docker compose up -d"]))).toBeUndefined()
  })

  test("grants package installs as their own family", () => {
    expect(Permission.scope(shell(["bun install"]))).toMatchObject({
      id: "install",
      label: "package installs",
    })
  })

  test("scopes a web fetch to the site, and leaves secrets alone", () => {
    expect(Permission.scope({ action: "webfetch", resources: ["https://example.com/docs"] })).toEqual({
      id: "site",
      label: "this site",
      resources: ["https://example.com/*"],
    })
    expect(Permission.scope({ action: "read", resources: [".env"] })).toBeUndefined()
  })

  test("keeps helper and tool scopes exact", () => {
    expect(Permission.scope({ action: "subagent", resources: ["explore"] })).toEqual({
      id: "helper",
      label: "this helper",
      resources: ["explore"],
    })
    expect(Permission.scope({ action: "mcp", resources: ["github:*"] })).toEqual({
      id: "tool",
      label: "this tool",
      resources: ["github:*"],
    })
  })
})
