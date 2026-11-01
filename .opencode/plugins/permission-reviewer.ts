// Superseded by the app-side asynchronous reviewer. This no-op keeps the
// previously loaded local plugin from doing anything if the server watches it.
import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"

export default define({
  id: "permission-reviewer",
  effect: () => Effect.void,
})
