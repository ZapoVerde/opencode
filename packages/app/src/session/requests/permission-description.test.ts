import { describe, expect, test } from "bun:test"
import { categorize, describePermission } from "./permission-description"

const command = (resources: string[]) => ({ action: "shell", resources })

describe("permission description", () => {
  test("categorizes the command by the most consequential thing it does", () => {
    expect(categorize(["git status --porcelain"])).toBe("default")
    expect(categorize(["git reset --hard"])).toBe("history")
    expect(categorize(["git push origin dev"])).toBe("push")
    expect(categorize(["npm publish"])).toBe("push")
    expect(categorize(["docker compose up -d"])).toBe("deploy")
    expect(categorize(["rm -rf build"])).toBe("destructive")
    expect(categorize(["curl https://example.com"])).toBe("network")
    expect(categorize(["bun install"])).toBe("install")
    expect(categorize(["sudo rm -rf /"])).toBe("privileged")
    expect(categorize(["docker compose config"])).toBe("secrets")
    expect(categorize(["gh release create v1"])).toBe("push")
  })

  test("keeps ordinary work ordinary and names the consequence only when it matters", () => {
    expect(describePermission(command(["git status"]), "build")).toEqual({
      summary: "permission.summary.shell.default",
      consequence: undefined,
      target: undefined,
    })
    expect(describePermission(command(["rm -rf build"]), "build")).toMatchObject({
      summary: "permission.summary.shell.destructive",
      consequence: "permission.consequence.destructive",
    })
  })

  test("describes code execution as using the agent's tools", () => {
    expect(describePermission({ action: "execute", resources: [] }, "build")).toEqual({
      summary: "permission.summary.execute",
      consequence: "permission.consequence.execute",
    })
  })

  test("treats secret files differently from ordinary files", () => {
    expect(describePermission({ action: "read", resources: [".env"] }, "build")).toMatchObject({
      summary: "permission.summary.readSecret",
      consequence: "permission.consequence.secret",
    })
    expect(describePermission({ action: "read", resources: [".env.example"] }, "build")).toEqual({
      summary: "permission.summary.read",
      consequence: undefined,
    })
  })

  test("routes work to the agent that owns it", () => {
    expect(describePermission(command(["git push origin dev"]), "build").target).toEqual({
      agent: "boss",
      reason: "permission.route.boss",
    })
    expect(describePermission(command(["docker compose up -d"]), "build").target).toEqual({
      agent: "boss",
      reason: "permission.route.boss",
    })
    expect(describePermission({ action: "edit", resources: ["src/index.ts"] }, "boss").target).toEqual({
      agent: "build",
      reason: "permission.route.build",
    })
    expect(describePermission({ action: "webfetch", resources: ["https://example.com"] }, "build").target).toEqual({
      agent: "plan",
      reason: "permission.route.plan",
    })
  })

  test("does not route a job back to the agent already doing it", () => {
    expect(describePermission(command(["git push origin dev"]), "boss").target).toBeUndefined()
    expect(describePermission({ action: "edit", resources: ["src/index.ts"] }, "build").target).toBeUndefined()
    expect(describePermission({ action: "webfetch", resources: ["https://example.com"] }, "plan").target).toBeUndefined()
  })
})
