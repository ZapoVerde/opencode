export * as PermissionLog from "./permission-log.js"

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "./global.js"
import { redactSecrets } from "./redact.js"

/** How many requests the log keeps. New requests push the oldest out. */
export const Limit = 1000

// A resource is a command or path, not a document. The cap keeps one paste from filling the file.
const resourceLimit = 200

/** Why the engine asked instead of allowing the request. */
export type Cause = "default" | "rule" | "plugin"

export type Rule = {
  readonly action: string
  readonly resource: string
  readonly effect: string
}

export type Request = {
  readonly id: string
  readonly at: number
  readonly session: string
  readonly agent: string
  readonly action: string
  readonly resources: readonly string[]
  readonly scope?: { readonly id: string; readonly label: string }
  readonly cause: Cause
  /** The rule that asked, or the rule the plugin replaced. Absent when no rule matched. */
  readonly rule?: Rule
  /** The resource that forced the ask. A batched command asks for all of its statements, but one of them decided. */
  readonly asker?: string
  /** The countable group the asker belongs to, such as `git push` or `read .ts`. */
  readonly shape: string
  /** How many times the same shape already asked in this session, before this request. */
  readonly repeat: number
}

export type Reply = {
  readonly at: number
  /** `once`, `session`, `always` or `reject`. */
  readonly reply: string
  readonly latency: number
}

export type Entry = Request & { readonly reply?: Reply }

type Line =
  | { readonly type: "ask"; readonly request: Request }
  | { readonly type: "reply"; readonly id: string; readonly reply: Reply }

type State = {
  readonly requests: Request[]
  readonly replies: Map<string, Reply>
  readonly repeats: Map<string, number>
  appends: number
  loaded?: Promise<void>
}

const states = new Map<string, State>()
const queues = new Map<string, Promise<void>>()

export type Options = { readonly directory?: string; readonly at?: number }

export function file(directory = Global.Path.data) {
  return path.join(directory, "permissions.jsonl")
}

/**
 * Record an ask. Resources are redacted and truncated before they reach the file, so a command that
 * carries a token does not leave one behind. Logging never decides the permission: callers ignore a
 * failure here.
 */
export async function record(input: Omit<Request, "at" | "shape" | "repeat">, options: Options = {}) {
  const directory = options.directory ?? Global.Path.data
  const state = current(directory)
  await state.loaded
  const resources = input.resources.map((resource) => redactSecrets(resource).slice(0, resourceLimit))
  const asker = redactSecrets(input.asker ?? resources[0] ?? "").slice(0, resourceLimit)
  const shape = shapeOf(input.action, asker)
  const key = repeatKey(input.session, input.action, shape)
  const request: Request = {
    ...input,
    resources,
    asker,
    at: options.at ?? Date.now(),
    shape,
    repeat: state.repeats.get(key) ?? 0,
  }
  state.requests.push(request)
  state.repeats.set(key, request.repeat + 1)
  state.appends += 1
  await enqueue(directory, async () => {
    await mkdir(directory, { recursive: true })
    await appendFile(file(directory), JSON.stringify({ type: "ask", request } satisfies Line) + "\n")
  })
  if (state.requests.length > Limit || state.appends >= Limit) await compact(directory, state)
}

/** Record how the person answered. An ask that fell out of the log has no reply to attach. */
export async function reply(input: { readonly id: string; readonly reply: string }, options: Options = {}) {
  const directory = options.directory ?? Global.Path.data
  const state = current(directory)
  await state.loaded
  const request = state.requests.find((item) => item.id === input.id)
  if (!request) return
  const at = options.at ?? Date.now()
  const value: Reply = { at, reply: input.reply, latency: at - request.at }
  state.replies.set(input.id, value)
  state.appends += 1
  await enqueue(directory, async () => {
    await mkdir(directory, { recursive: true })
    await appendFile(file(directory), JSON.stringify({ type: "reply", id: input.id, reply: value } satisfies Line) + "\n")
  })
}

/** The retained requests, oldest first, with the answer when one was given. */
export async function read(options: { readonly directory?: string } = {}): Promise<Entry[]> {
  const directory = options.directory ?? Global.Path.data
  const state = current(directory)
  await state.loaded
  return state.requests
    .map((request) => ({ ...request, reply: state.replies.get(request.id) }))
    .sort((left, right) => left.at - right.at)
}

export type Summary = {
  readonly agent: string
  readonly action: string
  readonly cause: Cause
  readonly shape: string
  readonly asks: number
  readonly once: number
  readonly session: number
  readonly always: number
  readonly reject: number
  readonly unanswered: number
  /** Average milliseconds between the ask and the answer, over answered requests. */
  readonly latency: number
}

/** Group the log by agent, action, cause and shape: the table that names the policy gaps. */
export function summarize(entries: ReadonlyArray<Entry>): Summary[] {
  const groups = new Map<string, Summary & { total: number }>()
  for (const entry of entries) {
    const key = [entry.agent, entry.action, entry.cause, entry.shape].join("\n")
    const row = groups.get(key) ?? {
      agent: entry.agent,
      action: entry.action,
      cause: entry.cause,
      shape: entry.shape,
      asks: 0,
      once: 0,
      session: 0,
      always: 0,
      reject: 0,
      unanswered: 0,
      latency: 0,
      total: 0,
    }
    const asked = entry.reply?.reply
    groups.set(key, {
      ...row,
      asks: row.asks + 1,
      once: row.once + (asked === "once" ? 1 : 0),
      session: row.session + (asked === "session" ? 1 : 0),
      always: row.always + (asked === "always" ? 1 : 0),
      reject: row.reject + (asked === "reject" ? 1 : 0),
      unanswered: row.unanswered + (entry.reply ? 0 : 1),
      latency: row.latency + (entry.reply?.latency ?? 0),
      total: row.total + (entry.reply ? 1 : 0),
    })
  }
  return Array.from(groups.values())
    .map(({ total, ...row }) => ({ ...row, latency: total ? Math.round(row.latency / total) : 0 }))
    .sort((left, right) => right.asks - left.asks || left.shape.localeCompare(right.shape))
}

function current(directory: string) {
  const existing = states.get(directory)
  if (existing) return existing
  const state: State = { requests: [], replies: new Map(), repeats: new Map(), appends: 0 }
  state.loaded = load(directory, state)
  states.set(directory, state)
  return state
}

async function load(directory: string, state: State) {
  const text = await readFile(file(directory), "utf8").catch(() => "")
  for (const line of text.split("\n")) {
    const parsed = parse(line)
    if (!parsed) continue
    if (parsed.type === "ask") {
      state.requests.push(parsed.request)
      const key = repeatKey(parsed.request.session, parsed.request.action, parsed.request.shape)
      state.repeats.set(key, (state.repeats.get(key) ?? 0) + 1)
    } else state.replies.set(parsed.id, parsed.reply)
  }
  if (state.requests.length > Limit) state.requests.splice(0, state.requests.length - Limit)
  const kept = new Set(state.requests.map((request) => request.id))
  for (const id of state.replies.keys()) if (!kept.has(id)) state.replies.delete(id)
  rebuild(state)
}

// A crash during a write can leave a partial last line. Anything that does not parse is not a record.
function parse(line: string): Line | undefined {
  if (!line.trim()) return undefined
  try {
    const value = JSON.parse(line) as Line
    if (value?.type === "ask" && typeof value.request?.id === "string") return value
    if (value?.type === "reply" && typeof value.id === "string" && typeof value.reply?.at === "number") return value
    return undefined
  } catch {
    return undefined
  }
}

// Serialized per directory so two asks in the same step cannot interleave their lines.
function enqueue(directory: string, work: () => Promise<void>) {
  const previous = queues.get(directory) ?? Promise.resolve()
  const next = previous.then(work, work)
  queues.set(directory, next)
  return next
}

async function compact(directory: string, state: State) {
  if (state.requests.length > Limit) state.requests.splice(0, state.requests.length - Limit)
  const kept = new Set(state.requests.map((request) => request.id))
  for (const id of state.replies.keys()) if (!kept.has(id)) state.replies.delete(id)
  rebuild(state)
  const lines: Line[] = [
    ...state.requests.map((request): Line => ({ type: "ask", request })),
    ...Array.from(state.replies, ([id, reply]): Line => ({ type: "reply", id, reply })),
  ]
  await enqueue(directory, async () => {
    await mkdir(directory, { recursive: true })
    await writeFile(file(directory), lines.map((line) => JSON.stringify(line) + "\n").join(""))
  })
  state.appends = 0
}

function rebuild(state: State) {
  state.repeats.clear()
  for (const request of state.requests) {
    const key = repeatKey(request.session, request.action, request.shape)
    state.repeats.set(key, (state.repeats.get(key) ?? 0) + 1)
  }
}

function repeatKey(session: string, action: string, shape: string) {
  return [session, action, shape].join("\n")
}

const multiword = new Set([
  "apt",
  "apt-get",
  "brew",
  "bun",
  "bunx",
  "cargo",
  "deno",
  "docker",
  "gh",
  "git",
  "go",
  "kubectl",
  "npm",
  "npx",
  "pip",
  "pip3",
  "pnpm",
  "systemctl",
  "terraform",
  "yarn",
])

/**
 * The countable group for a resource. Raw command text is nearly unique, so counting it directly says
 * nothing; `git push` and `docker compose logs` are what a policy rule actually covers.
 */
export function shapeOf(action: string, resource: string) {
  const text = resource.trim()
  if (!text) return action
  if (action === "external_directory") return "external directory"
  if (action === "webfetch" || action === "websearch") {
    const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]+)/i.exec(text)?.[1]
    return host ? `${action} ${host.toLowerCase()}` : action
  }
  if (action !== "shell") {
    const extension = path.extname(text)
    return extension ? `${action} ${extension}` : action
  }
  const tokens = text.split(/\s+/).filter(Boolean)
  let index = 0
  // Leading `FOO=bar` assignments are part of the environment, not the program.
  while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1
  const program = tokens[index]
  if (!program) return "shell"
  if (!multiword.has(program)) return program
  const next = tokens[index + 1]?.replace(/^["']|["']$/g, "")
  if (!next || next.startsWith("-")) return program
  if (program !== "docker" || next !== "compose") return `${program} ${next}`
  const command = tokens[index + 2]
  return command && !command.startsWith("-") ? `docker compose ${command}` : "docker compose"
}
