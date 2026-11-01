export * as PermissionScope from "./scope.js"

import type { Permission } from "@opencode/schema/permission"

type Input = {
  readonly action: string
  readonly resources: readonly string[]
  readonly save?: readonly string[]
}

type Family = {
  readonly id: string
  readonly label: string
  readonly match: RegExp
  readonly resources: readonly string[]
}

const families: readonly Family[] = [
  {
    id: "test",
    label: "test commands",
    match:
      /^(?:bun test|npm (?:run )?test|pnpm (?:run )?test|yarn test|(?:npx|bunx) (?:vitest|jest)|vitest|jest|pytest|go test|cargo test)\b/,
    resources: [
      "bun test *",
      "npm test *",
      "npm run test *",
      "pnpm test *",
      "pnpm run test *",
      "yarn test *",
      "npx vitest *",
      "npx jest *",
      "bunx vitest *",
      "bunx jest *",
      "vitest *",
      "jest *",
      "pytest *",
      "go test *",
      "cargo test *",
    ],
  },
  {
    id: "git-read",
    label: "read-only git",
    match: /^git (?:status|diff|log|show|rev-parse|ls-files|blame|describe|shortlog|whatchanged)\b/,
    resources: [
      "git status *",
      "git diff *",
      "git log *",
      "git show *",
      "git rev-parse *",
      "git ls-files *",
      "git blame *",
      "git describe *",
      "git shortlog *",
      "git whatchanged *",
    ],
  },
  {
    id: "build",
    label: "build commands",
    match:
      /^(?:bun run build|npm run build|pnpm run build|yarn build|npx tsc|vite build|tsc|cargo build|go build)\b/,
    resources: [
      "bun run build *",
      "npm run build *",
      "pnpm run build *",
      "yarn build *",
      "npx tsc *",
      "vite build *",
      "tsc *",
      "cargo build *",
      "go build *",
    ],
  },
  {
    id: "lint",
    label: "lint and format commands",
    match:
      /^(?:bun run (?:lint|format)|npm run (?:lint|format)|pnpm run (?:lint|format)|yarn (?:lint|format)|npx (?:eslint|prettier|biome)|eslint|prettier|biome)\b/,
    resources: [
      "bun run lint *",
      "bun run format *",
      "npm run lint *",
      "npm run format *",
      "pnpm run lint *",
      "pnpm run format *",
      "yarn lint *",
      "yarn format *",
      "npx eslint *",
      "npx prettier *",
      "npx biome *",
      "eslint *",
      "prettier *",
      "biome *",
    ],
  },
  {
    id: "install",
    label: "package installs",
    match:
      /^(?:bun (?:install|add)|npm (?:install|ci)|pnpm (?:install|add)|yarn (?:install|add)|pip install|cargo install|go get)\b/,
    resources: [
      "bun install *",
      "bun add *",
      "npm install *",
      "npm ci *",
      "pnpm install *",
      "pnpm add *",
      "yarn install *",
      "yarn add *",
      "pip install *",
      "cargo install *",
      "go get *",
    ],
  },
]

export function scope(input: Input): Permission.Scope | undefined {
  if (input.action === "webfetch") return web(input.resources)
  if (input.action === "subagent") return exact("helper", "this helper", input.resources)
  if (input.action === "mcp") return exact("tool", "this tool", input.resources)
  if (input.action !== "shell") return

  const family = families.find((item) => input.resources.every((resource) => item.match.test(resource.trim())))
  if (!family) return
  return { id: family.id, label: family.label, resources: [...family.resources] }
}

function web(resources: readonly string[]): Permission.Scope | undefined {
  const hosts = resources.flatMap((resource) => {
    if (!URL.canParse(resource)) return []
    const url = new URL(resource)
    return [`${url.protocol}//${url.host}`]
  })
  const unique = [...new Set(hosts)]
  if (unique.length !== 1) return
  return { id: "site", label: "this site", resources: [`${unique[0]}/*`] }
}

function exact(id: string, label: string, resources: readonly string[]): Permission.Scope | undefined {
  if (resources.length === 0) return
  return { id, label, resources: [...resources] }
}
