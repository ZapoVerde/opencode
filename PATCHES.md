# opencode2 Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode V2.

Each active patch must live on its own persistent branch based directly on the upstream V2 commit/version it modifies. Patched integration branches cherry-pick those independent patch branches. See `README-patched.md` for the lifecycle.

The repository `patches/` directory is OpenCode dependency/package patch machinery and is not this patch ledger.

---

## V2 beta — branch: `opencode2-v2-patched`

Upstream base: `b2e6e764a88dbcc9231a2ac1f73d011817f80f98` (`upstream/v2` at workspace creation on 2026-09-12).

### Active local source patches

#### Native tool control HTTP boundary

- **Status:** Applied
- **Patch branch:** `feat/native-tool-control-v2`
- **Upstream base:** `upstream/v2` / `b2e6e764a88dbcc9231a2ac1f73d011817f80f98`
- **Patch commit:** `388cc88b42f75fbf2efe38a0d8dff1a44e743429`
- **Files:** `packages/protocol/src/api.ts`, `packages/protocol/src/groups/tool-control.ts`, `packages/server/src/handlers.ts`, `packages/server/src/handlers/tool-control.ts`
- **Problem:** OpenCode has a model-independent `Tool.Snapshot.execute` boundary but no authenticated external API for direct native-tool control.
- **Fix:** Expose location-scoped tool discovery and session-scoped native tool execution through the existing HTTP API, preserving OpenCode tool schemas, permissions, hooks, and execution semantics without invoking a model.
- **Verification:** Server typecheck passes; live `/api/tool` discovery exposes native tools including `read`; Taskbridge E2E executes native `read` successfully without calling the prompt/model path.
- **When updating:** Check for an upstream native tool-control endpoint. Retire this patch if upstream exposes equivalent discovery and direct execution semantics.


#### OpenAI OAuth: preserve base GPT-5.6 / Luna model availability

- **Status:** Applied
- **Patch branch:** `fix/luna-oauth-model-filtering-v2`
- **Upstream base:** `upstream/v2` / `b2e6e764a88dbcc9231a2ac1f73d011817f80f98`
- **Patch commit:** `254dd84db8b9c4c8213597b99965016ce590cd8b`
- **Files:** `packages/core/src/plugin/provider/openai.ts`, `packages/core/test/plugin/provider-openai.test.ts`
- **Problem:** V2 explicitly places base `gpt-5.6` in `codexDisallowed`, hiding the local ChatGPT/Luna model path under OpenAI OAuth.
- **Fix:** Remove only base `gpt-5.6` from `codexDisallowed`; retain the generic Codex eligibility filter and the explicit `gpt-5.5-pro` rejection.
- **Verification:** From `packages/core`, `bun test test/plugin/provider-openai.test.ts` passes 4/4 and explicitly expects base `gpt-5.6` enabled under ChatGPT OAuth.
- **When updating:** Check `packages/core/src/plugin/provider/openai.ts` first. If upstream no longer explicitly rejects base `gpt-5.6` or otherwise supports the required model path, verify behavior and retire this patch instead of replaying it.

#### Source-run client version metadata for Zen free models

- **Status:** Applied
- **Patch branch:** `zen-version-v2`
- **Patch commit:** `af373e84d4`
- **Upstream base:** `upstream/v2` / `a90ad8566d`
- **Files:** `packages/cli/src/version.ts`; runtime settings in `/config/workspace/stacks/opencode2/compose.yaml` (deployment file, outside this repository)
- **Problem:** The OC2 stack runs the CLI directly from source. Without build-time constants, its server identified itself as `opencode/local/local/cli-node`; Zen free-model requests were rejected with `FreeTierError` even though the Console account was connected.
- **Fix:** When compile-time metadata is absent, allow `OPENCODE_VERSION` and `OPENCODE_CHANNEL` environment variables to supply the runtime identity. The current stack sets these to the source package version (`2.0.24`) and channel (`beta`), so the server reports `opencode/beta/2.0.24/cli-node` rather than a `local` version.
- **Verification:** With those environment values, `opencode2 run --standalone --model opencode/nemotron-3.5-lightning-free` used the existing authenticated Console credential and returned `OK`; the user subsequently confirmed Muse Spark worked in the running OC2 app.
- **When updating:** Keep the advertised version aligned with the actual source package and channel; do not hard-code a different release identity. Check whether upstream has changed source-run metadata defaults or the Zen free-tier client check, and retest a real free-model request before carrying this patch forward.

Before carrying any OC1 patch forward, verify the required behavior against this exact V2 base. In particular, test OpenAI OAuth availability for base `gpt-5.6` / Luna. If V2 already supports it, do not recreate the OC1 patch.

## Patch entry template

### Short patch name

- **Status:** Applied / Retired
- **Patch branch:** `fix/...` or `feat/...`
- **Upstream base:** branch/tag and exact commit
- **Files:** affected files
- **Problem:** behavior requiring the patch
- **Fix:** concise description of the local change
- **Verification:** tests or manual proof
- **When updating:** what to check in upstream before re-applying
- **Upstream issue/PR:** optional
