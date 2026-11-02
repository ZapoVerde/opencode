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

  test("scopes a repeated unrecognised command to its exact statements", () => {
    expect(Permission.scope(shell(['echo "=== board ==="']))).toBeUndefined()
    expect(Permission.scope(shell(['echo "=== board ==="']), { repeat: true })).toEqual({
      id: "command",
      label: "this command",
      resources: ['echo "=== board ==="'],
    })
    expect(Permission.scope(shell(["cat a.txt", "tail -3"]), { repeat: true })).toEqual({
      id: "command",
      label: "these commands",
      resources: ["cat a.txt", "tail -3"],
    })
  })

  test("leaves commands whose text would read as a wildcard a one-time decision", () => {
    expect(Permission.scope(shell(["rm -rf build/*"]), { repeat: true })).toBeUndefined()
    expect(Permission.scope(shell(["cat file?.txt"]), { repeat: true })).toBeUndefined()
  })

  test("scopes external directory work to the paths that asked", () => {
    expect(Permission.scope({ action: "external_directory", resources: ["/dev/*"] })).toEqual({
      id: "external",
      label: "external access",
      resources: ["/dev/*"],
    })
    expect(Permission.scope({ action: "external_directory", resources: ["/dev/*", "/tmp/*"] })).toEqual({
      id: "external",
      label: "external access",
      resources: ["/dev/*", "/tmp/*"],
    })
  })
})
