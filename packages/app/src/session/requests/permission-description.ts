import type { PermissionRequest } from "@opencode/client/promise"

type Category =
  | "privileged"
  | "secrets"
  | "destructive"
  | "push"
  | "deploy"
  | "history"
  | "github"
  | "install"
  | "network"
  | "default"

const categories: ReadonlyArray<{ category: Category; pattern: RegExp }> = [
  { category: "privileged", pattern: /(^|\n)\s*(?:sudo|doas|su)\b/ },
  {
    category: "secrets",
    pattern:
      /(^|\n)\s*(?:docker\s+(?:inspect|logs)|docker\s+compose\s+(?:config|logs)|env|printenv|cat\s+\S*\.env)\b/,
  },
  { category: "destructive", pattern: /(^|\n)\s*(?:rm|rmdir|mv|chmod|chown|dd|mkfs|truncate|shred)\b/ },
  {
    category: "push",
    pattern: /(^|\n)\s*(?:git\s+push|gh\s+release|(?:npm|bun|pnpm|yarn)\s+publish|docker\s+push)\b/,
  },
  {
    category: "deploy",
    pattern:
      /(^|\n)\s*(?:docker\s+(?:compose\s+(?:up|down|restart|stop|start)|run|system|volume|service)|kubectl|helm|terraform\s+(?:apply|destroy)|systemctl)\b/,
  },
  {
    category: "history",
    pattern: /(^|\n)\s*git\s+(?:reset|rebase|clean|restore|checkout\s+--|commit\s+--amend)\b/,
  },
  { category: "github", pattern: /(^|\n)\s*gh\b/ },
  {
    category: "install",
    pattern:
      /(^|\n)\s*(?:npm\s+(?:install|ci|add)|bun\s+(?:install|add)|pnpm\s+(?:install|add)|yarn\s+(?:install|add)|pip\s+install|cargo\s+install|go\s+get|apt|apt-get|brew)\b/,
  },
  {
    category: "network",
    pattern: /(^|\n)\s*(?:curl|wget|ssh|scp|rsync|nc|socat|telnet|ftp|ping)\b/,
  },
]

// The commands whose arguments name a host. Used only to decide which statements to read for targets,
// so it must stay the same set the network category matches.
const networkTool = /^(?:curl|wget|ssh|scp|rsync|nc|socat|telnet|ftp|ping)$/i

const summaries: Record<Category, string> = {
  privileged: "permission.summary.shell.privileged",
  secrets: "permission.summary.shell.secrets",
  destructive: "permission.summary.shell.destructive",
  push: "permission.summary.shell.push",
  deploy: "permission.summary.shell.deploy",
  history: "permission.summary.shell.history",
  github: "permission.summary.shell.github",
  install: "permission.summary.shell.install",
  network: "permission.summary.shell.network",
  default: "permission.summary.shell.default",
}

const consequences: Partial<Record<Category, string>> = {
  privileged: "permission.consequence.privileged",
  secrets: "permission.consequence.secret",
  destructive: "permission.consequence.destructive",
  push: "permission.consequence.push",
  deploy: "permission.consequence.deploy",
  history: "permission.consequence.history",
  github: "permission.consequence.github",
  install: "permission.consequence.install",
  network: "permission.consequence.network",
}

export type PermissionDescription = {
  summary: string
  consequence?: string
  target?: { agent: string; reason: string }
}

export function describePermission(
  request: Pick<PermissionRequest, "action" | "resources">,
  agent?: string,
): PermissionDescription {
  if (request.action === "shell") {
    const category = categorize(request.resources)
    return {
      summary: summaries[category],
      consequence: consequences[category],
      target: route(agent, request.action, category),
    }
  }

  if (request.action === "execute") {
    return {
      summary: "permission.summary.execute",
      consequence: "permission.consequence.execute",
    }
  }

  if (request.action === "read") {
    const secret = isSecret(request.resources)
    return {
      summary: secret ? "permission.summary.readSecret" : "permission.summary.read",
      consequence: secret ? "permission.consequence.secret" : undefined,
    }
  }

  if (request.action === "edit" || request.action === "write" || request.action === "patch") {
    const secret = isSecret(request.resources)
    return {
      summary: secret ? "permission.summary.editSecret" : "permission.summary.edit",
      consequence: secret ? "permission.consequence.secret" : undefined,
      target: route(agent, request.action, "default"),
    }
  }

  if (request.action === "webfetch") {
    return {
      summary: "permission.summary.webfetch",
      consequence: "permission.consequence.network",
      target: route(agent, request.action, "network"),
    }
  }
  if (request.action === "websearch") {
    return {
      summary: "permission.summary.websearch",
      consequence: "permission.consequence.network",
      target: route(agent, request.action, "network"),
    }
  }
  if (request.action === "external_directory") {
    return {
      summary: "permission.summary.external",
      consequence: "permission.consequence.external",
    }
  }
  if (request.action === "subagent" || request.action === "task") return { summary: "permission.summary.subagent" }
  if (request.action === "question") return { summary: "permission.summary.question" }
  if (request.action === "skill") return { summary: "permission.summary.skill" }
  if (request.action === "glob" || request.action === "grep") return { summary: "permission.summary.search" }

  return { summary: "permission.summary.default" }
}

export function categorize(resources: readonly string[]): Category {
  const command = resources.join("\n")
  const category = categories.find((item) => item.pattern.test(command))?.category ?? "default"
  // A request against the loopback interface never leaves this machine, so "Use the internet" would
  // overstate it. Judge each statement, because "curl localhost/health && echo ok" stays here while
  // "curl localhost/health && curl elsewhere" does not.
  if (category !== "network") return category
  const targets = command
    .split(/[;&|\n]+/)
    .map((statement) => statement.trim().split(/\s+/))
    .filter((words) => networkTool.test(words[0] ?? ""))
    .map((words) => words.map(host).filter((item): item is string => item !== undefined))
  // No network statement to judge, or one whose target cannot be read (an unexpanded variable, a bare
  // remote name), is not evidence that the command stays local.
  if (targets.length === 0) return "network"
  return targets.every((hosts) => hosts.length > 0 && hosts.every(isLocalHost)) ? "default" : "network"
}

// The host a token names when it names one plainly: an absolute URL, an authority with a port, or a bare
// loopback name or IP literal. Anything else, such as a bare remote name or an unexpanded variable, is
// not evidence that the command stays local.
function host(token: string) {
  const word = token.replace(/^["']|["']$/g, "")
  const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^/:?#]+)/i.exec(word)
  if (url) return url[1]
  const authority = /^([a-z0-9.-]+):\d+(?:\/|$)/i.exec(word)
  if (authority) return authority[1]
  if (/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])$/i.test(word)) return word
}

function isLocalHost(host: string) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    value === "localhost" ||
    value === "::" ||
    value === "::1" ||
    value === "0.0.0.0" ||
    value.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(value)
  )
}

function isSecret(resources: readonly string[]) {
  return resources.some((resource) => {
    const value = resource.replaceAll("\\", "/").toLowerCase()
    if (value.endsWith(".env.example") || value.endsWith(".env.sample")) return false
    return (
      /(^|\/)\.env(\..*)?$/.test(value) ||
      /(^|\/).*\.(pem|key|age)$/.test(value) ||
      /(^|\/).*credentials.*\.ya?ml$/.test(value) ||
      /(^|\/).*panel-password$/.test(value)
    )
  })
}

function route(agent: string | undefined, action: string, category: Category): PermissionDescription["target"] {
  const id = agent?.toLowerCase()

  if (id === "build" && (category === "push" || category === "deploy" || category === "github")) {
    return { agent: "boss", reason: "permission.route.boss" }
  }

  if (id === "boss" && (action === "edit" || action === "write" || action === "patch")) {
    return { agent: "build", reason: "permission.route.build" }
  }

  if (id === "plan" && (action === "edit" || action === "write" || action === "patch")) {
    return { agent: "build", reason: "permission.route.build" }
  }

  if ((id === "build" || id === "boss") && (action === "webfetch" || action === "websearch")) {
    return { agent: "plan", reason: "permission.route.plan" }
  }

  return undefined
}
