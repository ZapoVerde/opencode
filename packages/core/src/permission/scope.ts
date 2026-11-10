export * as PermissionScope from "./scope.js"

import { existsSync } from "node:fs"
import path from "path"
import type { Permission } from "@opencode/schema/permission"

type Input = {
  readonly action: string
  readonly resources: readonly string[]
  readonly save?: readonly string[]
}

type Options = {
  /** The session's working directory. Internal resources are relative to it. */
  readonly directory?: string
  /** The worktree root. A file grant never widens above it. */
  readonly root?: string
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

export function scope(input: Input, options: Options = {}): Permission.Scope | undefined {
  if (input.action === "webfetch") return web(input.resources)
  if (input.action === "subagent") return exact("helper", "this helper", input.resources)
  if (input.action === "mcp") return exact("tool", "this tool", input.resources)
  // File work is approved at the nearest project boundary, so a session grant covers a project tree
  // instead of one file at a time. The worktree root is never widened to a wildcard.
  if (input.action === "edit") return files(input.resources, options)
  if (input.action !== "shell") return

  const family = families.find((item) => input.resources.every((resource) => item.match.test(resource.trim())))
  if (!family) return
  return { id: family.id, label: family.label, resources: [...family.resources] }
}

// A file has no project marker of its own, so walk up from its directory to the nearest project root
// below the worktree: a package manifest, build file, or repository marker. Directories without a
// marker fall back to the file's own directory, which is still a directory grant rather than a file
// grant. A file at the worktree root has no narrower boundary, so it stays a one-time decision.
const projectMarkers = [
  ".git",
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "deno.json",
  "deno.jsonc",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile",
  "mix.exs",
  "pubspec.yaml",
]

function files(resources: readonly string[], options: Options): Permission.Scope | undefined {
  const directory = options.directory
  const root = options.root
  if (!directory || !root || resources.length === 0) return
  const scopes = new Set<string>()
  const projects = new Set<string>()
  for (const resource of resources) {
    // A path carrying matcher wildcards cannot be granted without widening it.
    if (/[*?]/.test(resource)) return
    const absolute = path.resolve(directory, resource)
    if (!inside(root, absolute)) return
    const project = projectRoot(absolute, root)
    if (!project) return
    const relative = path.relative(directory, project).replaceAll("\\", "/")
    // A session already rooted at the project can grant its whole working directory. A session rooted
    // at the worktree cannot: that would turn one file into a worktree-wide grant.
    if (!relative && path.resolve(directory) === path.resolve(root)) return
    scopes.add(relative ? `${relative}/*` : "*")
    projects.add(path.relative(root, project).replaceAll("\\", "/"))
  }
  if (scopes.size === 0) return
  return {
    id: "project",
    label: scopes.size === 1 ? `edits in ${[...projects][0]}` : "edits in these projects",
    resources: [...scopes],
  }
}

function projectRoot(absolute: string, root: string) {
  const start = path.dirname(absolute)
  let current = start
  while (inside(root, current) && path.resolve(current) !== path.resolve(root)) {
    if (projectMarkers.some((marker) => existsSync(path.join(current, marker)))) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  // No marker below the worktree. Keep the grant to the directory that contained the file.
  if (path.resolve(start) === path.resolve(root)) return
  return start
}

function inside(root: string, absolute: string) {
  const relative = path.relative(root, absolute)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
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
