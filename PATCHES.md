# opencode Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode.

Each active patch must live on its own persistent branch based directly on the upstream version it modifies. Patched integration branches cherry-pick those independent patch branches. See `README-patched.md` for the lifecycle.

The repository `patches/` directory is OpenCode's dependency/package patch machinery and is not this patch ledger.

---

## v1.18.27 — branch: `opencode-1.18.27-patched`

Upstream base: `4b7e19e315cca414121ba1d61523fef74bb3ae8b` (release `v1.18.27`).

### OpenAI OAuth: preserve base GPT-5.6 / Luna model availability

- **Status:** Applied
- **Patch branch:** `fix/luna-oauth-model-filtering-v1.18.27`
- **Upstream base:** `v1.18.27` / `4b7e19e315cca414121ba1d61523fef74bb3ae8b`
- **Files:** `packages/opencode/src/plugin/openai/codex.ts`, `packages/opencode/test/plugin/codex-luna.test.ts`
- **Problem:** Upstream OAuth model filtering explicitly rejects base `gpt-5.6`, which breaks the local ChatGPT/Luna model path while the related `gpt-5.6-luna` family remains otherwise supported.
- **Fix:** Remove only the explicit base `gpt-5.6` rejection and keep the existing generic OAuth filtering and context-limit behavior.
- **Verification:** `bun test test/plugin/codex-luna.test.ts` must pass after integration and again after the live OpenCode container is restarted.
- **When updating:** Check `packages/opencode/src/plugin/openai/codex.ts` for the explicit `gpt-5.6` OAuth rejection. If upstream removes it or otherwise supports the required model path, verify the behavior and retire this patch instead of replaying it.
- **Historical branch:** `luna-oauth-fix` contains the original July 2026 implementation; `fix/luna-oauth-model-filtering` was the recovered current-dev patch used to reconstruct this release-specific patch.

## Patch entry template

### Short patch name

- **Status:** Applied / Retired
- **Patch branch:** `fix/...` or `feat/...`
- **Upstream base:** tag or commit
- **Files:** affected files
- **Problem:** behavior requiring the patch
- **Fix:** concise description of the local change
- **Verification:** tests or manual proof
- **When updating:** what to check in upstream before re-applying
- **Upstream issue/PR:** optional
