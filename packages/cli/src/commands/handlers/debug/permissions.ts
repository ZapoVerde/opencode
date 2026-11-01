import { EOL } from "os"
import { Effect, Option } from "effect"
import { Global } from "@opencode/util/global"
import { PermissionLog } from "@opencode/util/permission-log"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(
  Commands.commands.debug.commands.permissions,
  Effect.fn("cli.debug.permissions")(function* (input) {
    const global = yield* Global.Service
    const entries = yield* Effect.promise(() => PermissionLog.read({ directory: global.data }))
    if (input.json) {
      process.stdout.write(JSON.stringify(entries, null, 2) + EOL)
      return
    }
    if (!entries.length) {
      process.stdout.write(`No permission requests recorded in ${PermissionLog.file(global.data)}${EOL}`)
      return
    }
    const agent = Option.getOrUndefined(input.agent)
    const rows = PermissionLog.summarize(entries)
      .filter((row) => !agent || row.agent === agent)
      .slice(0, input.limit)
    const widths = [8, 8, 8, 22, 5, 5, 5, 7, 7, 5, 6]
    const line = (cells: ReadonlyArray<string | number>) =>
      cells.map((cell, index) => String(cell).padEnd(widths[index] ?? 0)).join(" ") + EOL
    process.stdout.write(
      line(["agent", "action", "cause", "shape", "asks", "once", "sess", "always", "reject", "open", "ms"]) +
        rows
          .map((row) =>
            line([
              row.agent,
              row.action,
              row.cause,
              row.shape,
              row.asks,
              row.once,
              row.session,
              row.always,
              row.reject,
              row.unanswered,
              row.latency,
            ]),
          )
          .join(""),
    )
    const defaults = entries.filter((entry) => entry.cause === "default").length
    const unanswered = entries.filter((entry) => !entry.reply).length
    process.stdout.write(
      `${EOL}${entries.length} requests, ${defaults} with no matching rule, ${unanswered} still open${EOL}`,
    )
  }),
)
