# opencode Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode.

Each active patch must live on its own persistent branch based directly on the upstream version it modifies. Patched integration branches cherry-pick those independent patch branches. See `README-patched.md` for the lifecycle.

The repository `patches/` directory is OpenCode's dependency/package patch machinery and is not this patch ledger.

---

## v1.18.19 — branch: `opencode-1.18.19-patched`

### OpenAI OAuth: preserve GPT-5.6 / Luna model availability

- **Status:** Applied
- **Patch branch:** `fix/luna-oauth-model-filtering`
- **Upstream base:** `03cb6324352b5e09477e56324aaaefb9e149b298` (`upstream/dev`, 2026-09-04)
- **Files:** `packages/opencode/src/plugin/openai/codex.ts`, `packages/opencode/test/plugin/codex-luna.test.ts`
- **Problem:** OpenCode explicitly filtered base `gpt-5.6` out of the ChatGPT OAuth model list even though GPT-5.6 family models such as Luna are supported by the Codex OAuth path. This made the model-family filtering inconsistent and could prevent Luna-related usage from behaving as expected.
- **Fix:** Remove the explicit `gpt-5.6` rejection while leaving the surrounding OAuth filtering rules intact. Add a focused regression test proving base `gpt-5.6` and `gpt-5.6-luna` remain available through the OAuth model hook.
- **Verification:** `bun test test/plugin/codex-luna.test.ts` from `packages/opencode/`.
- **When updating:** Check `packages/opencode/src/plugin/openai/codex.ts`. If upstream no longer explicitly rejects `gpt-5.6`, verify equivalent OAuth model coverage and retire this patch rather than replaying it.
- **Historical branch:** `luna-oauth-fix` / `dc629bf7be8831e338e2ecfe80280c8e4319ac19` is the earlier July version of this customization.

### Unreconciled local state

- `bun.lock` is currently modified in the working checkout by dependency-install churn. It is not recorded as an active patch and must be reconciled before an OpenCode upgrade or source patch is prepared.

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
