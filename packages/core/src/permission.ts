export * as Permission from "./permission.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Deferred, Effect, Layer, Schema } from "effect"
import { Permission } from "@opencode/schema/permission"
import { SessionEvent } from "@opencode/schema/session-event"
import { PermissionLog } from "@opencode/util/permission-log"
import type { Tool } from "@opencode/schema/tool"
import { Bus } from "./bus.js"
import { Location } from "./location.js"
import { Agent } from "./agent.js"
import { SessionErrors } from "./session/error.js"
import { SessionSchema } from "./session/schema.js"
import { SessionStore } from "./session/store.js"
import { Wildcard } from "./util/wildcard.js"
import { PermissionSaved } from "./permission/saved.js"
import { scope } from "./permission/scope.js"
import { PluginHooks } from "./plugin/hooks.js"

const PermissionEffect = Permission.Effect
export { PermissionEffect as Effect }
export { Rule, Ruleset } from "@opencode/schema/permission"
const missingAgentPermissions: Permission.Ruleset = [{ action: "*", resource: "*", effect: "deny" }]

export const ID = Permission.ID
export type ID = typeof ID.Type

export const Source = Permission.Source
export type Source = typeof Source.Type

export const Request = Permission.Request
export type Request = typeof Request.Type

export const Reply = Permission.Reply
export type Reply = typeof Reply.Type

export { scope }

export interface AssertInput extends Omit<Request, "id" | "message" | "scope"> {
  readonly id?: ID
  readonly agent?: Agent.ID
}

/** The requester fields of a permission request made by a tool call. */
export const invocation = (context: Pick<Tool.Context, "sessionID" | "agent" | "messageID" | "id">) => ({
  sessionID: context.sessionID,
  agent: context.agent,
  source: { type: "tool" as const, messageID: context.messageID, id: context.id },
})

export interface ReplyInput {
  readonly requestID: ID
  readonly reply: Reply
  readonly message?: string
}

export interface AskResult {
  readonly id: ID
  readonly effect: Permission.Effect
}

export { Event } from "@opencode/schema/permission"

/**
 * Rules that settle a request which would otherwise ask, for work nobody is present to answer, such as a schedule's
 * check. A request they do not allow is denied. Configured denies still win, as they are evaluated first.
 */
export const Unattended = Context.Reference<Permission.Ruleset | undefined>("@opencode/Permission/Unattended", {
  defaultValue: () => undefined,
})

export class DeclinedError extends Schema.TaggedError<DeclinedError>()("Permission.DeclinedError", {}) {}

export class CorrectedError extends Schema.TaggedError<CorrectedError>()("Permission.CorrectedError", {
  feedback: Schema.String,
}) {
  override get message() {
    return this.feedback
  }
}

export class BlockedError extends Schema.TaggedError<BlockedError>()("Permission.BlockedError", {
  rules: Permission.Ruleset,
  permission: Schema.String,
  resources: Schema.Array(Schema.String),
  reason: Schema.String.pipe(Schema.optional),
}) {
  override get message() {
    return this.reason ?? `Permission denied: ${this.permission}`
  }
}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()("Permission.NotFoundError", {
  requestID: ID,
}) {}

export type Error = BlockedError | CorrectedError

export function evaluate(action: string, resource: string, ...rulesets: Permission.Ruleset[]): Permission.Rule {
  return match(action, resource, ...rulesets) ?? { action, resource: "*", effect: "ask" }
}

// The default ruleset asks when nothing matches. Callers that report why an ask happened need to
// tell that apart from a configured `ask` rule, so they use this and keep `undefined` as "no rule".
function match(action: string, resource: string, ...rulesets: Permission.Ruleset[]) {
  return rulesets
    .flat()
    .findLast((rule) => Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource))
}

// A configured `*` / `*` ask matches every resource and decides nothing, so it is the fallback in
// everything but name. Reporting it as the winning rule would hide that no specific rule applied.
function blanketAsk(rule: Permission.Rule) {
  return rule.effect === "ask" && rule.action === "*" && rule.resource === "*"
}

export function merge(...rulesets: Permission.Ruleset[]): Permission.Ruleset {
  return rulesets.flat()
}

export interface Interface {
  readonly close: Effect.Effect<void>
  readonly ask: (input: AssertInput) => Effect.Effect<AskResult, SessionErrors.NotFoundError>
  readonly assert: (input: AssertInput) => Effect.Effect<void, Error | SessionErrors.NotFoundError>
  /** Fails only when the rules deny the request; never asks the user. */
  readonly assertNotDenied: (input: AssertInput) => Effect.Effect<void, BlockedError | SessionErrors.NotFoundError>
  /** True only when the rules already allow the request; never asks the user. */
  readonly allows: (input: AssertInput) => Effect.Effect<boolean, SessionErrors.NotFoundError>
  readonly reply: (input: ReplyInput) => Effect.Effect<void, NotFoundError>
  readonly get: (id: ID) => Effect.Effect<Request | undefined>
  readonly forSession: (sessionID: SessionSchema.ID) => Effect.Effect<ReadonlyArray<Request>>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Permission") {}

interface Pending {
  readonly request: Request
  readonly agent?: Agent.ID
  readonly deferred: Deferred.Deferred<void, DeclinedError | CorrectedError>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const location = yield* Location.Service
    const agents = yield* Agent.Service
    const sessions = yield* SessionStore.Service
    const saved = yield* PermissionSaved.Service
    const hooks = yield* PluginHooks.Service
    const pending = new Map<ID, Pending>()
    // A session approval is deliberately process-local: it is stored at the root of the agent tree and
    // covers that tree, not the project, and a restart or an agent switch on the root forgets it.
    // Grants are checked after the agent and session rules, so they can widen an ask but can never
    // override an agent deny.
    const grants = new Map<SessionSchema.ID, Permission.Ruleset>()
    // Identical asks per session, so a repeat can offer the exact session scope a first ask cannot.
    const asked = new Map<SessionSchema.ID, Map<string, number>>()
    const unsubscribe = yield* bus.listen((event) => {
      if (event.type !== SessionEvent.AgentSelected.type) return Effect.void
      // The event type check above owns this payload shape.
      grants.delete((event.data as { sessionID: SessionSchema.ID }).sessionID)
      asked.delete((event.data as { sessionID: SessionSchema.ID }).sessionID)
      return Effect.void
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    let closed = false

    const close = Effect.gen(function* () {
      closed = true
      yield* Effect.forEach(Array.from(pending.values()), (item) =>
        bus
          .publish(Permission.Event.Replied, {
            sessionID: item.request.sessionID,
            requestID: item.request.id,
            reply: "reject",
          })
          .pipe(Effect.ensuring(Deferred.fail(item.deferred, new DeclinedError()))),
      )
      pending.clear()
    }).pipe(Effect.uninterruptible)
    yield* Effect.addFinalizer(() => close)

    const savedRules = Effect.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
        (item): Permission.Rule => ({
          action: item.action,
          resource: item.resource,
          effect: "allow",
        }),
      )
    })

    // The answer is already published, so a log failure is dropped rather than failing the reply.
    const logReply = (id: ID, reply: Permission.Reply) =>
      Effect.tryPromise(() => PermissionLog.reply({ id, reply })).pipe(Effect.orElseSucceed(() => undefined))

    const configured = Effect.fnUntraced(function* (sessionID: SessionSchema.ID, agentID?: Agent.ID) {
      const session = yield* sessions.get(sessionID)
      if (!session) return yield* new SessionErrors.NotFoundError({ sessionID })
      const agent = yield* agents.resolve(agentID ?? session.agent)
      return {
        agent: agent?.id,
        session,
        rules: merge(agent?.permissions ?? missingAgentPermissions, session.permissions ?? []),
      }
    })

    // A session approval covers the session that gave it and the subagents that session spawns. A
    // child runs in a fresh session, so without this a "session" answer lasts only until the next
    // child asks the same question. The nearest session's grants win, so build the chain root first.
    const sessionRules = Effect.fnUntraced(function* (session: SessionSchema.Info) {
      const chain = [session]
      let current = session
      while (current.parentID) {
        const parent = yield* sessions.get(current.parentID)
        if (!parent) break
        chain.push(parent)
        current = parent
      }
      return chain.reverse().flatMap((item) => grants.get(item.id) ?? [])
    })

    // Store a session approval at the root of the agent tree so one decision covers the parent and
    // every sibling that asks the same question. The ancestry walk above makes it visible downward.
    const sessionRoot = Effect.fnUntraced(function* (sessionID: SessionSchema.ID) {
      let current = yield* sessions.get(sessionID)
      while (current?.parentID) {
        const parent = yield* sessions.get(current.parentID)
        if (!parent) break
        current = parent
      }
      return current?.id ?? sessionID
    })

    function denied(input: Pick<Request, "action" | "resources">, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === "deny")
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    type Layer = { readonly source: "agent" | "session" | "saved"; readonly rules: Permission.Ruleset }

    // Layers are ordered by precedence, so the winning rule is the last layer that matches.
    function winner(action: string, resource: string, layers: ReadonlyArray<Layer>) {
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const rule = match(action, resource, layers[index].rules)
        if (rule) return { rule, source: layers[index].source }
      }
      return undefined
    }

    interface Verdict {
      readonly effect: Permission.Effect
      readonly message?: string
      readonly rules: Permission.Ruleset
      readonly agent?: Agent.ID
      readonly session: SessionSchema.Info
      readonly cause?: PermissionLog.Cause
      readonly rule?: PermissionLog.Rule
      readonly asker?: string
      readonly grant?: PermissionLog.Grant
    }

    const evaluateInput: (input: AssertInput) => Effect.Effect<Verdict, SessionErrors.NotFoundError> =
      Effect.fnUntraced(function* (input: AssertInput) {
        const configuration = yield* configured(input.sessionID, input.agent)
        const rules = configuration.rules
        if (denied(input, rules))
          return {
            effect: "deny" as const,
            message: undefined,
            rules,
            agent: configuration.agent,
            session: configuration.session,
          }
        const layers: ReadonlyArray<Layer> = [
          { source: "agent", rules },
          { source: "session", rules: yield* sessionRules(configuration.session) },
          { source: "saved", rules: yield* savedRules() },
        ]
        const all = layers.flatMap((layer) => layer.rules)
        const matched = input.resources.map((resource) => {
          const decided = winner(input.action, resource, layers)
          return { resource, rule: decided?.rule, source: decided?.source }
        })
        const asking = matched.find((item) => (item.rule?.effect ?? "ask") === "ask")
        const effect: Permission.Effect = asking ? "ask" : "allow"
        const event = yield* hooks.trigger("permission", "evaluate", {
          sessionID: input.sessionID,
          agent: input.agent,
          action: input.action,
          resources: input.resources,
          metadata: input.metadata,
          source: input.source,
          effect,
        })
        // A `*` / `*` ask is the configured fallback: it matches everything and decides nothing, so it
        // reads as the default. A request a plugin turned into an ask was allowed by the rules.
        const cause: PermissionLog.Cause =
          effect === "ask" ? (asking?.rule && !blanketAsk(asking.rule) ? "rule" : "default") : "plugin"
        // An allowed request a user grant covered is its own evidence: which rule settled it and which
        // resource needed it. Agent rules are not grants and are never recorded.
        const covered =
          effect === "allow"
            ? matched.find((item) => item.source === "session" || item.source === "saved")
            : undefined
        const grant: PermissionLog.Grant | undefined =
          covered?.rule && (covered.source === "session" || covered.source === "saved")
            ? { by: covered.source, rule: covered.rule }
            : undefined
        const notice = {
          cause,
          rule: cause === "rule" ? asking?.rule : undefined,
          asker: asking?.resource ?? covered?.resource ?? input.resources[0],
          agent: configuration.agent,
          session: configuration.session,
        }
        const unattended = yield* Unattended
        if (event.effect !== "ask" || unattended === undefined)
          return { effect: event.effect, message: event.message, rules: all, grant, ...notice }
        const settled = [...all, ...unattended]
        const allowed = input.resources.every(
          (resource) => evaluate(input.action, resource, settled).effect === "allow",
        )
        if (allowed) return { effect: "allow" as const, message: event.message, rules: all, ...notice }
        return {
          effect: "deny" as const,
          message: `Permission ${input.action} needs approval, and nobody is present to give it`,
          rules: all,
          ...notice,
        }
      })

    // Repeats are counted per session and per exact ask, so the second identical request can offer an
    // exact session scope while the first stays a one-time decision. Bounded so a long session cannot
    // grow it without limit.
    function repeatAsk(input: AssertInput) {
      const key = [input.action, ...input.resources].join("\u0000")
      const counts = asked.get(input.sessionID) ?? new Map<string, number>()
      const previous = counts.get(key) ?? 0
      counts.delete(key)
      counts.set(key, previous + 1)
      while (counts.size > 200) {
        const oldest = counts.keys().next()
        if (oldest.done) break
        counts.delete(oldest.value)
      }
      asked.set(input.sessionID, counts)
      return previous > 0
    }

    function request(input: AssertInput, message?: string): Request {
      return {
        id: input.id ?? ID.create(),
        sessionID: input.sessionID,
        action: input.action,
        resources: input.resources,
        save: input.save,
        scope: scope(input, {
          repeat: repeatAsk(input),
          directory: location.directory,
          root: location.project.directory,
        }),
        // Tools copy optional inputs straight into metadata; undefined values are not JSON and would
        // fail the HttpApi response encoder when clients list pending requests.
        metadata:
          input.metadata &&
          Object.fromEntries(Object.entries(input.metadata).filter(([, value]) => value !== undefined)),
        source: input.source,
        message,
      }
    }

    // A request a user grant settled is its own evidence, so record it with the rule and the resource
    // that used it. An ask has its own record path, and an agent-rule allow leaves nothing to prove.
    const logUse = (id: ID, input: AssertInput, verdict: Verdict) =>
      verdict.grant === undefined || verdict.effect !== "allow"
        ? Effect.void
        : Effect.tryPromise(() =>
            PermissionLog.record({
              id,
              session: input.sessionID,
              parent: verdict.session.parentID,
              kind: verdict.session.parentID === undefined ? undefined : "subagent",
              agent: verdict.agent ?? "unknown",
              action: input.action,
              resources: input.resources,
              asker: verdict.asker,
              grant: verdict.grant,
            }),
          ).pipe(Effect.orElseSucceed(() => undefined))

    const create = (request: Request, agent: Agent.ID | undefined, notice: Verdict) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<void, DeclinedError | CorrectedError>()
          const item = { request, agent, deferred }
          if (closed) {
            yield* Deferred.fail(deferred, new DeclinedError())
            return item
          }
          if (pending.has(request.id))
            return yield* Effect.die(new Error(`Duplicate pending permission ID: ${request.id}`))
          pending.set(request.id, item)
          yield* bus
            .publish(Permission.Event.Asked, request)
            .pipe(Effect.onError(() => Effect.sync(() => pending.delete(request.id))))
          // The request is already visible, so a log failure is dropped rather than failing the ask.
          yield* Effect.tryPromise(() =>
            PermissionLog.record({
              id: request.id,
              session: request.sessionID,
              parent: notice.session.parentID,
              kind: notice.session.parentID === undefined ? undefined : "subagent",
              agent: agent ?? "unknown",
              action: request.action,
              resources: request.resources,
              scope: request.scope,
              cause: notice.cause,
              rule: notice.rule,
              asker: notice.asker,
            }),
          ).pipe(Effect.orElseSucceed(() => undefined))
          return item
        }),
      )

    const ask = Effect.fn("Permission.ask")(function* (input: AssertInput) {
      if (closed) return { id: input.id ?? ID.create(), effect: "deny" as const }
      const result = yield* evaluateInput(input)
      const value = request(input, result.message)
      if (result.effect === "ask") yield* create(value, result.agent ?? input.agent, result)
      else yield* logUse(value.id, input, result)
      return { id: value.id, effect: result.effect }
    })

    const assert = Effect.fn("Permission.assert")((input: AssertInput) =>
      Effect.gen(function* () {
        if (closed) return yield* Effect.die(new DeclinedError())
        const result = yield* evaluateInput(input)
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (result.effect === "deny") {
              return yield* new BlockedError({
                rules: relevant(input, result.rules),
                permission: input.action,
                resources: input.resources,
                reason: result.message,
              })
            }
            if (result.effect === "allow") {
              yield* logUse(input.id ?? ID.create(), input, result)
              return
            }
            const item = yield* create(request(input, result.message), result.agent ?? input.agent, result)
            return yield* restore(Deferred.await(item.deferred)).pipe(
              // Deliberate defect tunnel: leaves wrap execution in blanket `mapError`, which
              // must not convert a user's decline into model-facing tool output. The decline
              // resurfaces as a typed failure at SessionModelRequest.executeTool. A decline
              // WITH feedback (CorrectedError) intentionally stays typed so the leaf can turn
              // it into ToolFailure and the model continues.
              Effect.catchTag("Permission.DeclinedError", (error) => Effect.die(error)),
              Effect.ensuring(
                Effect.sync(() => {
                  pending.delete(item.request.id)
                }),
              ),
            )
          }),
        )
      }),
    )

    const assertNotDenied = Effect.fn("Permission.assertNotDenied")(function* (input: AssertInput) {
      const result = yield* evaluateInput(input)
      if (result.effect !== "deny") return
      return yield* new BlockedError({
        rules: relevant(input, result.rules),
        permission: input.action,
        resources: input.resources,
        reason: result.message,
      })
    })

    const allows = Effect.fn("Permission.allows")(function* (input: AssertInput) {
      if (closed) return false
      return (yield* evaluateInput(input)).effect === "allow"
    })

    const reply = Effect.fn("Permission.reply")((input: ReplyInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const existing = pending.get(input.requestID)
          if (!existing) return yield* new NotFoundError({ requestID: input.requestID })
          yield* bus.publish(Permission.Event.Replied, {
            sessionID: existing.request.sessionID,
            requestID: existing.request.id,
            reply: input.reply,
          })

          if (input.reply === "reject") {
            yield* Deferred.fail(
              existing.deferred,
              input.message ? new CorrectedError({ feedback: input.message }) : new DeclinedError(),
            )
            pending.delete(input.requestID)
            yield* logReply(existing.request.id, input.reply)
            for (const [id, item] of pending) {
              if (item.request.sessionID !== existing.request.sessionID) continue
              yield* bus.publish(Permission.Event.Replied, {
                sessionID: item.request.sessionID,
                requestID: item.request.id,
                reply: "reject",
              })
              // Feedback applies to the whole batch, so parallel asks don't end the step.
              yield* Deferred.fail(
                item.deferred,
                input.message ? new CorrectedError({ feedback: input.message }) : new DeclinedError(),
              )
              pending.delete(id)
              yield* logReply(item.request.id, "reject")
            }
            return
          }

          const save = existing.request.save
          if (input.reply === "always" && save?.length) {
            yield* saved.add({
              projectID: location.project.id,
              action: existing.request.action,
              resources: save,
            })
          }
          // A session approval grants the engine-selected scope, never a pattern supplied by the
          // client or invented by the reviewer. A request with no safe scope is a one-time decision.
          const sessionResources = input.reply === "session" ? (existing.request.scope?.resources ?? []) : []
          const grantRoot = sessionResources.length ? yield* sessionRoot(existing.request.sessionID) : undefined
          if (sessionResources.length && grantRoot !== undefined) {
            grants.set(
              grantRoot,
              merge(
                grants.get(grantRoot) ?? [],
                sessionResources.map((resource) => ({
                  action: existing.request.action,
                  resource,
                  effect: "allow" as const,
                })),
              ),
            )
          }
          yield* Deferred.succeed(existing.deferred, undefined)
          pending.delete(input.requestID)
          yield* logReply(existing.request.id, input.reply)
          if (input.reply === "once") return
          if (input.reply === "always" && !save?.length) return
          if (input.reply === "session" && !sessionResources.length) return

          for (const [id, item] of pending) {
            // A session grant settles pending asks across the tree that approved it. Project-wide
            // saved rules can settle pending asks everywhere.
            if (grantRoot !== undefined && (yield* sessionRoot(item.request.sessionID)) !== grantRoot) continue
            const result = yield* evaluateInput({ ...item.request, agent: item.agent }).pipe(
              Effect.catchTag("Session.NotFoundError", () => Effect.undefined),
            )
            if (result?.effect !== "allow") continue
            yield* bus.publish(Permission.Event.Replied, {
              sessionID: item.request.sessionID,
              requestID: item.request.id,
              reply: input.reply,
            })
            yield* Deferred.succeed(item.deferred, undefined)
            pending.delete(id)
            yield* logReply(item.request.id, input.reply)
          }
        }),
      ),
    )

    const list = Effect.fn("Permission.list")(function* () {
      return Array.from(pending.values(), (item) => item.request)
    })

    const get = Effect.fn("Permission.get")(function* (id: ID) {
      return pending.get(id)?.request
    })

    const forSession = Effect.fn("Permission.forSession")(function* (sessionID: SessionSchema.ID) {
      return Array.from(pending.values(), (item) => item.request).filter((request) => request.sessionID === sessionID)
    })

    return Service.of({ ask, assert, assertNotDenied, allows, reply, get, forSession, list, close })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Bus.node, Location.node, Agent.node, SessionStore.node, PermissionSaved.node, PluginHooks.node],
})
