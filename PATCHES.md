# opencode Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode.

## v1.18.33 - branch: `opencode-1.18.33-patched`

Upstream base: `51ef4be1d3c122f18fefb510dca8d778571f4f18` (release `v1.18.33`).

### OpenAI OAuth: preserve base GPT-5.6 availability

- **Status:** Applied
- **Files:** `packages/opencode/src/plugin/openai/codex.ts`, `packages/opencode/test/plugin/codex.test.ts`
- **Problem:** Upstream OAuth filtering explicitly rejects base `gpt-5.6`.
- **Fix:** Remove only the explicit rejection. The existing version filter admits GPT-6 Luna, which upstream now explicitly allows.
- **Verification:** `bun test test/plugin/codex.test.ts` from `packages/opencode`.
- **When updating:** Check whether upstream still rejects base `gpt-5.6`; verify GPT-6 Luna remains allowed before retiring this patch.

### App model selector: show modes for the latest model

- **Status:** Applied
- **Files:** `packages/app/src/context/models.tsx`
- **Problem:** Catalog-generated fast and ultrafast model entries share their base model's family and release date, so default latest-model visibility hid them from the selector.
- **Fix:** Treat a generated mode as visible by default when its base model is the latest visible model in that family. Explicit user visibility preferences still take precedence.
- **Verification:** `bun typecheck` from `packages/app`; confirm GPT-6 fast and ultrafast entries appear in the refreshed OpenAI catalog.
- **When updating:** Verify generated modes still use the base model API ID and retain the `baseID-mode` ID pattern; check whether upstream latest-model visibility now accounts for them.

### Config: preserve model release_date for custom providers

- **Status:** Applied
- **Files:** `packages/core/src/config/provider.ts`, `packages/core/src/config/plugin/provider.ts`, `packages/core/src/v1/config/migrate.ts`
- **Problem:** The v2 config model schema had no `release_date`, the v2 config provider plugin never mapped one, and the v1→v2 migration dropped it. A custom provider's models therefore always reported `time.released: 0`. The app's latest-only visibility filter then hid every one of those models from the picker, even though the provider and its catalog had loaded.
- **Fix:** Add `release_date` to the v2 `ConfigV2.Model` schema, map it to `model.time.released` in the v2 config provider transform, and carry it through `migrateModel` for v1 configs.
- **Verification:** With a custom provider declaring `release_date` (the WorkBuddy gateway), `GET /api/model` reports the declared timestamp instead of `0`; the model picker lists the provider's models after a reload.
- **When updating:** Check whether upstream adds `release_date` to the v2 config schema and maps it in the provider transform; if so, retire this patch.
