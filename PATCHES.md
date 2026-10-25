# opencode2 Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode V2.

Each active patch must live on its own persistent branch based directly on the upstream V2 commit/version it modifies. Patched integration branches cherry-pick those independent patch branches. See `README-patched.md` for the lifecycle.

The repository `patches/` directory is OpenCode dependency/package patch machinery and is not this patch ledger.

---

## V2 — branch: `opencode2-v2-patched`

Workspace base: `b2e6e764a88dbcc9231a2ac1f73d011817f80f98` (`upstream/v2` at workspace creation on 2026-09-12).

Current upstream base: `097a93e511` (`upstream/dev` merged 2026-10-25, 213 commits since `adcda1b84f`). Upstream moved its default branch from `v2` to `dev`: `v2` stopped at `4617210822` on 2026-10-10, `dev` is the mainline that releases are cut from (`v2.1.1` differs from `dev` by 114 files), and `beta` is a separate app-rewrite line (1,356 files ahead, including a different session-ui and desktop implementation) that was not merged.

The 2026-10-25 merge applied with four conflicts:

- `packages/core/src/plugin/provider/openai.ts` and its test needed adapting rather than replaying: upstream dropped `codexAllowed` and now gates Codex eligibility on `major > 5 || (major === 5 && minor > 5)`, while still listing base `gpt-5.6` in `codexDisallowed`. The local allowance is now an empty `codexDisallowed` set, and the removed context-limit override assertions were dropped from the test.
- `services/www/openapi.json` and `services/www/public/openapi.json` were deleted upstream (`8521baf8b0`, "stop committing copies of the OpenAPI spec"). Deletions accepted; the copies are now gitignored and generated from `packages/protocol/openapi.json`.

Upstream also raised `packageManager` to `bun@1.4.4` and moved local `typecheck` scripts to the `bun check` builtin, so root `bun run check` requires Bun 1.4.4. Under Bun 1.4.2, `bun check` resolves to the repository's own `check` script and fails in packages without one. This workspace now provides 1.4.4 at `/config/workspace/.tools/bin/bun`, which is ahead of the root-owned `/usr/local/bin/bun` (1.4.2) on `PATH` both here and in the OC2 container; the CI-equivalent `bun run typecheck:tsc` works on either. The lockfile was re-resolved with 1.4.4 and is `--frozen-lockfile` clean. Generated artifacts were regenerated (`packages/protocol`, `packages/client`), root `bun run check` passes 36/36 tasks, `bun run typecheck:tsc` passes 34/34, and the mobile, composer, and layout suites listed per patch below pass.

The merge targets `upstream/dev` HEAD rather than a release tag: `v2.1.4` (`68bc26b7da`, 2026-10-23) is `dev` plus its single release commit, so `dev` is 68 commits ahead of the newest V2 tag. The `1.19.4` release (2026-10-22) is on the separate 1.x line and shares no commits with this tree; its only content is the bundled Bun 1.4.4 bump, which this checkout now requires via `packageManager` rather than carrying as a release patch.

Previous merge `adcda1b84f` (`upstream/dev` merged 2026-10-21, 1,761 commits) applied with one textual conflict in `packages/core/src/config/plugin/provider.ts`, resolved by keeping the local release-time default and adopting upstream's `config.name` truthiness check.

Previous merge `4617210822` (`upstream/v2` merged 2026-10-13, 113 commits, including `chore: upgrade Effect to 4.0.1`) required two adaptations, recorded in the per-patch entries below:

- Effect 4.0.1 renamed the `effect/unstable/httpapi` module to `effect/http-api`; the native tool-control protocol group and server handler were updated to the new path.
- The OpenAI provider test's `catalog.model.get` calls were replaced with the upstream `models.get` service, keeping the local base `gpt-5.6` expectation.

Upstream still does not address any active patch as of `097a93e511`: there is no native tool-control endpoint, base `gpt-5.6` is still rejected under OpenAI OAuth, source-run identity still falls back to `"local"`, unknown routes still throw and have no catch-all, the mobile composer still submits on a bare touch Enter, the web app still sizes the keyboard inset only through `KeyboardInsets` without the `data-keyboard` root height, and config-defined models still have no default release time (`releaseDate` is now opt-in config, but an omitted value still leaves `released: 0`). No patch was retired in the 2026-10-25 merge.

### Active local source patches

#### Native tool control HTTP boundary

- **Status:** Applied
- **Patch branch:** `feat/native-tool-control-v2`
- **Upstream base:** `upstream/v2` / `b2e6e764a88dbcc9231a2ac1f73d011817f80f98`
- **Patch commit:** `388cc88b42f75fbf2efe38a0d8dff1a44e743429`
- **Files:** `packages/protocol/src/api.ts`, `packages/protocol/src/groups/tool-control.ts`, `packages/server/src/handlers.ts`, `packages/server/src/handlers/tool-control.ts`
- **Problem:** OpenCode has a model-independent `Tool.Snapshot.execute` boundary but no authenticated external API for direct native-tool control.
- **Fix:** Expose location-scoped tool discovery and session-scoped native tool execution through the existing HTTP API, preserving OpenCode tool schemas, permissions, hooks, and execution semantics without invoking a model.
- **Verification:** Server typecheck passes; live `/api/tool` discovery exposes native tools including `read`; Taskbridge E2E executes native `read` successfully without calling the prompt/model path. Re-verified after the 2026-10-13 upstream merge with `packages/protocol` and `packages/server` typecheck and a regenerated client. Re-verified after the 2026-10-21 `upstream/dev` merge: `packages/protocol`, `packages/server`, and `packages/client` typecheck, and regenerated clients still expose `toolControl.list` / `toolControl.execute`. Re-verified on the 2026-10-25 `upstream/dev` merge: `bun run check` and `bun run typecheck:tsc` pass, and the regenerated clients still expose both calls; upstream added Usage and Voice groups and reworked the MCP group in `api.ts` / `handlers.ts`, which merged cleanly beside the tool-control group.
- **When updating:** Check for an upstream native tool-control endpoint. Retire this patch if upstream exposes equivalent discovery and direct execution semantics. Import HTTP API primitives from `effect/http-api`; `effect/unstable/httpapi` no longer exists as of Effect 4.0.1.


#### OpenAI OAuth: preserve base GPT-5.6 / Luna model availability

- **Status:** Applied
- **Patch branch:** `fix/luna-oauth-model-filtering-v2`
- **Upstream base:** `upstream/v2` / `b2e6e764a88dbcc9231a2ac1f73d011817f80f98`
- **Patch commit:** `254dd84db8b9c4c8213597b99965016ce590cd8b`
- **Files:** `packages/core/src/plugin/provider/openai.ts`, `packages/core/test/plugin/provider-openai.test.ts`
- **Problem:** V2 explicitly places base `gpt-5.6` in `codexDisallowed`, hiding the local ChatGPT/Luna model path under OpenAI OAuth.
- **Fix:** Remove only base `gpt-5.6` from `codexDisallowed`; retain the generic Codex eligibility filter and the explicit `gpt-5.5-pro` rejection.
- **Verification:** From `packages/core`, `bun test test/plugin/provider-openai.test.ts` passes 5/5 (re-verified after the 2026-10-13 upstream merge, using the upstream `models.get` service) and explicitly expects base `gpt-5.6` enabled under ChatGPT OAuth. Re-verified on the 2026-10-21 `upstream/dev` merge: the OpenAI and designer plugin tests pass 10/10 together. Adapted on the 2026-10-25 merge: upstream removed `codexAllowed` and now gates eligibility on `major > 5 || (major === 5 && minor > 5)`, still listing base `gpt-5.6` in `codexDisallowed`; the local set is now empty, `gpt-5.5-pro` remains excluded by the version gate, and `bun test test/plugin/provider-openai.test.ts test/plugin/designer.test.ts` passes 10/10.
- **When updating:** Check `packages/core/src/plugin/provider/openai.ts` first. If upstream no longer explicitly rejects base `gpt-5.6` or otherwise supports the required model path, verify behavior and retire this patch instead of replaying it.

#### Source-run client version metadata for Zen free models

- **Status:** Applied
- **Patch branch:** `zen-version-v2`
- **Patch commit:** `af373e84d4`
- **Upstream base:** `upstream/v2` / `a90ad8566d`
- **Files:** `packages/cli/src/version.ts`; runtime settings in `/config/workspace/stacks/opencode2/compose.yaml` (deployment file, outside this repository)
- **Problem:** The OC2 stack runs the CLI directly from source. Without build-time constants, its server identified itself as `opencode/local/local/cli-node`; Zen free-model requests were rejected with `FreeTierError` even though the Console account was connected.
- **Fix:** When compile-time metadata is absent, allow `OPENCODE_VERSION` and `OPENCODE_CHANNEL` environment variables to supply the runtime identity. The current stack sets these to the source package version (`2.0.24`) and channel (`beta`), so the server reports `opencode/beta/2.0.24/cli-node` rather than a `local` version.
- **Verification:** With those environment values, `opencode2 run --standalone --model opencode/nemotron-3.5-lightning-free` used the existing authenticated Console credential and returned `OK`; the user subsequently confirmed Muse Spark worked in the running OC2 app. Re-verified on the 2026-10-21 `upstream/dev` merge: the env fallback merged cleanly into upstream's rewritten `packages/cli/src/version.ts` and still applies to both `version` and `channel`; root `bun run check` passes. Re-verified on the 2026-10-25 merge: upstream `version.ts` still falls back to the literal `"local"` with no environment path, the local fallback is untouched, and root `bun run check` passes 36/36.
- **When updating:** Keep the advertised version aligned with the actual source package and channel; do not hard-code a different release identity. Check whether upstream has changed source-run metadata defaults or the Zen free-tier client check, and retest a real free-model request before carrying this patch forward.

#### Designer orchestration agent

- **Status:** Applied
- **Patch branch:** `feat/designer-agent`
- **Upstream base:** `upstream/v2` / `4617210822`
- **Patch commit:** `6e8dea91f72646f285d10952336a51ef4dbead98`
- **Files:** `packages/core/src/plugin/designer.ts`, `packages/core/src/plugin/internal.ts`, `packages/core/test/plugin/designer.test.ts`
- **Problem:** No built-in conversational design/orchestration agent. A config-defined agent can only replace the base system prompt via `system`, which also suppresses provider-specific prompt selection; it cannot append to the shared harness prompt, so this cannot be achieved through project configuration alone.
- **Fix:** Register a primary `designer` agent and inject its instructions as an extra `SystemPart` on the `context` hook, only when the selected agent is `designer`, so the shared harness and provider system prompts stay intact. Permissions remain permissive; the "delegate source changes" restriction lives in the prompt rather than in the permission set.
- **Verification:** From `packages/core`, `bun test test/plugin/designer.test.ts` passes 5/5 and `bun typecheck` passes. A server run from this tree lists `designer` as a primary, non-hidden agent via `GET /api/agent`. Re-verified on the 2026-10-21 `upstream/dev` merge: registration in `packages/core/src/plugin/internal.ts` survived and the plugin tests pass. Re-verified on the 2026-10-25 merge: `internal.ts` is still unchanged upstream (the upstream `agent.ts` changes are prompt text only), the `DesignerPlugin` import and `pre` registration are intact, and the designer tests pass alongside the provider suite 10/10.
- **When updating:** Check whether upstream ships a built-in design/orchestration agent, or a supported way for an agent to append to (rather than replace) the base system prompt. If so, retire this patch.

#### Mobile composer: return key inserts a newline

- **Status:** Applied
- **Patch branch:** `fix/mobile-enter-newline-v2`
- **Upstream base:** `upstream/v2` / `4617210822`
- **Patch commit:** `339f3ee16d`
- **Files:** `packages/app/src/composer/editor/editor.tsx`
- **Problem:** The composer's bare Enter submits the prompt on every device. A touch soft keyboard has no usable Shift+Enter, so a phone or tablet user cannot write a multi-line prompt before sending.
- **Fix:** Read `(pointer: coarse)` in `ComposerEditor`. When the primary pointer is coarse and the composer is in normal mode, a bare Enter is left to the browser so it inserts a newline; the composer's send button submits, and `Mod+Enter` still queues. Shell mode and fine-pointer devices are unchanged, so a physical keyboard attached to a touch device keeps Enter-to-send.
- **Verification:** From `packages/app`, `bun typecheck` passes and the composer unit tests pass (75 across 12 files) on both the patch branch and the integration branch. Re-verified on the 2026-10-21 `upstream/dev` merge: `packages/app` typecheck passes and the composer plus unknown-route suites pass 88/88 across 13 files. Re-verified on the 2026-10-25 merge: upstream did not change `packages/app/src/composer/editor/editor.tsx` (it refactored `composer/state.ts` and the session composer region instead), the coarse-pointer branch is intact, the unit suites still pass 88/88 across 13 files, and `mobile-composer-submit-focus.spec.ts` passes in the 13/13 mobile e2e run.
- **When updating:** Check upstream composer key handling in `packages/app/src/composer/editor/editor.tsx` (the `onKeyDown` Enter branch) and whether upstream adds its own touch/keyboard mode. Retire this patch if upstream stops submitting on a bare Enter for coarse-pointer devices.

#### Mobile web: keep the composer above the keyboard and enlarge navigation targets

- **Status:** Applied
- **Patch branch:** `feat/mobile-web-polish-v2`
- **Upstream base:** `upstream/dev` / `adcda1b84f`
- **Patch commit:** `8ba9c599e1`
- **Files:** `packages/app/src/runtime/platform/keyboard.ts`, `packages/app/src/index.css`, `packages/app/src/runtime/extension/mobile.tsx`, `packages/app/src/shell/titlebar/titlebar.tsx`, `packages/app/e2e/regression/mobile-composer-submit-focus.spec.ts`, `packages/app/e2e/regression/mobile-session.spec.ts`
- **Problem:** Browsers that resize only the visual viewport when the software keyboard opens, including Android Firefox, leave the layout at its full `dvh` height, so the composer and bottom titlebar sit under the keyboard. The mobile view switcher is 36px high and the tab drawer's New session, Home, Settings, and Help rows are 28px high, below a comfortable touch target.
- **Fix:** `KeyboardInsets` publishes `data-keyboard` and `--visual-viewport-height` from `visualViewport.height` while an editable element is focused and the visible area shrinks by more than a browser-chrome-sized inset, ignoring pinch zoom. `index.css` sizes `#root` to that height only while the attribute is present. The mobile view switcher and the four drawer actions grow to 44px.
- **Verification:** From `packages/app`, `bun typecheck` passes and `bun typecheck:e2e` reports only the pre-existing `timeline-stream.spec.ts` errors. `mobile-composer-submit-focus.spec.ts` and `mobile-session.spec.ts` pass 13/13, including a visual-viewport-only keyboard emulation and the 44px touch-target assertions. Root `bun run check` passes 34/34. Re-verified after cherry-picking onto `opencode2-v2-patched`. Re-verified on the 2026-10-25 merge: `keyboard.ts`, `index.css`, `mobile.tsx`, and `titlebar.tsx` are unchanged upstream, and `mobile-composer-submit-focus.spec.ts` plus `mobile-session.spec.ts` pass 13/13 against the refactored composer.
- **When updating:** Check whether upstream sizes the web app against `visualViewport` when the keyboard opens and whether the mobile view switcher and drawer actions already meet a 44px target. Retire this patch if both are handled upstream.

#### Unknown routes fall back to Home

- **Status:** Applied
- **Patch branch:** `fix/unknown-route-fallback-v2`
- **Upstream base:** `upstream/v2` / `4617210822`
- **Patch commit:** `267b93be44`
- **Files:** `packages/app/src/shell/state/layout.tsx`, `packages/app/src/shell/routes/routes.tsx`, `packages/app/src/shell/state/layout.test.ts`
- **Problem:** `currentRoute` threw `Unrecognised route!` for any path outside its whitelist, and it runs during provider init in the Solid Router root, so any URL the SPA shell is served on that is not a known route (for example the Cloudflare Access callback `/cdn-cgi/access/authorized`, or any stale or unknown path) crashed the whole app with the "Something went wrong" error page before it could render anything.
- **Fix:** `currentRoute` returns the `home` route type instead of throwing, and `AppRoutes` gains a `path="*"` catch-all that renders `Home`, so unknown paths fall back to the Home screen and keep the URL unchanged.
- **Verification:** From `packages/app`, `bun typecheck` passes and `bun test --conditions=solid ./src/shell/state/layout.test.ts` passes 11/11, including the new fallback case which fails against the unpatched code. `bun run build` succeeds and `bun run check` from the repository root passes. Re-verified after cherry-picking onto `opencode2-v2-patched`. Re-verified on the 2026-10-21 `upstream/dev` merge: `currentRoute` still returns Home for unknown paths, the `*` catch-all is still registered, and the layout suite passes 11/11. Re-verified on the 2026-10-25 merge: upstream `packages/app/src/shell/state/layout.tsx` still throws `Unrecognised route!` and `routes.tsx` still has no catch-all, so both halves of the patch remain necessary; the layout suite still passes 11/11.
- **When updating:** Check whether upstream stops throwing in `currentRoute` or adds its own catch-all or 404 route in `packages/app/src/shell/routes/routes.tsx`. Retire this patch if upstream handles unknown paths without crashing.

#### Config-defined models keep their place in the picker

- **Status:** Applied
- **Patch branch:** `fix/custom-model-release-time-v2`
- **Upstream base:** `upstream/v2` / `4617210822`
- **Patch commit:** `b5dea8e1ea`
- **Files:** `packages/core/src/config/plugin/provider.ts`
- **Problem:** The V2 config schema has no release date, so models from a config-defined provider keep `time.released: 0`. The app's latest-only visibility filter reads that as 1970 and hides every model from the picker, even though the provider and its catalog loaded.
- **Fix:** When a config-defined model has no catalog release time, default `model.time.released` to `Date.now()`. Catalog providers keep their real dates.
- **Verification:** From `packages/core`, `bun run typecheck` passes; a custom provider (the WorkBuddy gateway) appears in `GET /api/model` with a current release time and its 22 models remain visible in the picker after a reload. Re-verified on the 2026-10-21 `upstream/dev` merge: this was the only merge conflict; the local default was kept alongside upstream's new `releaseDate` handling and `config.name` truthiness check, and `packages/core` typecheck passes. Re-verified on the 2026-10-25 merge: upstream still only sets `released` when `config.releaseDate` is present, and the new provider-wide baseURL deletion loop upstream added in the same file merged cleanly beside the local default.
- **When updating:** Check whether upstream adds a release-date field to the V2 provider config or stops hiding models without one. Upstream added an opt-in `releaseDate` on 2026-10-20, but an omitted value still leaves `released: 0`, and the app's six-month "latest" filter still hides those models, so this default remains necessary. Retire the patch if upstream defaults missing release times or stops filtering on them.

#### Central screenshot capture workspace

- **Status:** Applied
- **Patch branch:** `feat/screenshots-harness-v2`
- **Upstream base:** `upstream/dev` / `adcda1b84f`
- **Patch commit:** `39eaa29a80`
- **Files:** `packages/app-harness/**` (new), `packages/screenshots/**` (new), `packages/app/e2e/utils/*` (23 harness files moved out), `packages/app/e2e/**` (import rewrites), `packages/app/test-browser/prompt-motion.test.ts`, `packages/app/package.json`, `packages/storybook/package.json`, `.oxlintrc.json`, `script/lint-changed.ts`, `bun.lock`, `packages/app/e2e/AGENTS.md`, `.opencode/skills/app-e2e-tests/SKILL.md`
- **Problem:** The Playwright mock harness is owned by `packages/app/e2e/utils`, so screenshot tooling would be app-owned and buried in test code. There is no central way to capture the real UI before a production build.
- **Fix:** Extract the reusable harness into `@opencode/app-harness`; add `@opencode/screenshots` with `bun run shots` and `bun run shots:story`. Scenes render the real app on the Vite dev server against the in-memory mock backend, and story capture mounts Storybook.
- **Verification:** 100% renames for the moved harness. On the patch branch and the integration branch, root `bun run typecheck` passes 36/36 and `bun run lint` reports 0 errors. `bun run shots` captures `session-dark`, `session-mobile`, `home`, and `settings-light`; `SHOTS_STORY_ID=current-session-error-card--provider-errors bun run shots:story` captures a story. `packages/app` `typecheck:e2e` still reports only its pre-existing 9 errors. Re-verified on the 2026-10-25 merge: upstream changed no file under `packages/app/e2e/utils`, so the move holds; the five e2e specs upstream edited (`review`, `session-header`, `side-panels`, `tabs`, the timeline probe) merged with their `@opencode/app-harness` imports intact, no stale `../utils/` imports remain, `typecheck:e2e` still reports only the same 9 pre-existing upstream errors, and root `bun run check` passes 36/36 with both new packages in scope.
- **When updating:** After an upstream merge, check for new or changed files under `packages/app/e2e/utils` and rerun the harness import rewrite. Retire this deviation if upstream moves the harness out of the app package or ships equivalent central screenshot tooling.

#### Home screen Usage link

- **Status:** Applied
- **Patch branch:** `feat/home-usage-link`
- **Upstream base:** `upstream/dev` / `097a93e511`
- **Patch commit:** `9fecf9197d`
- **Files:** `packages/app/src/home/projects/view.tsx`, `packages/app/src/home/projects/controller.tsx`, `packages/app/src/home/projects/region.tsx`, `packages/app/src/home/route.tsx`, `packages/app/src/shell/titlebar/titlebar.tsx`, `packages/app/src/runtime/i18n/*.ts` (63 dictionaries)
- **Problem:** The local usage dashboard (out-of-tree at `/config/workspace/opencode2-usage`, served at `/usage/` through `opencode2-ui`) has no entry point in the app. The Home screen has no extension slot, so the built-in GUI extension SDK cannot contribute one. The phone drawer footer is a separate component in `shell/titlebar/titlebar.tsx`, so the Home-nav action alone is invisible on mobile.
- **Fix:** Render a Usage action in both places, between Settings and Help: the `HomeUtilityNav` column on wide screens and the `mobile-tabs-*` footer inside the tabs drawer on phones. Both use the `window-analytics` icon and open `<origin>/usage/` through `platform.openExternal`, and both render only when `platform.platform === "web"`, because the Electron build has no origin that serves the dashboard. `sidebar.usage` is added to every dictionary with the literal English `"Usage"`; no translations were invented, and key parity across locales is preserved. The mobile button uses the 44px target from the mobile-web-polish patch; on a branch without that patch it would be taller than its neighbours.
- **Verification:** From `packages/app`, `bun typecheck` passes; the Home suite passes 25/25 with the package preloads, and the i18n suite 20/20; `bun run build` succeeds and the emitted bundles contain the handler, `mobile-tabs-usage`, and the button. Against the running stack, the cached Chromium in the container rendered both surfaces: on desktop the Home column showed Settings, Usage, Help; at a Pixel 7 viewport the tabs drawer showed Settings, Usage, Help in that order, clicking Usage opened `/usage/`, and the dashboard rendered live data. `GET /usage` returns 301 to `/usage/`, `/usage/api/*` proxies to the `usage` sidecar, and `/` plus `/api` are unchanged.
- **Deployment (outside this repository):** `/config/workspace/stacks/opencode2/compose.yaml` gains a read-only `usage` service running `web/server.ts` from `opencode2-usage`, and `/config/workspace/stacks/opencode2/ui.conf` gains the `/usage` redirect and `/usage/` proxy. Only `opencode2-ui` and `opencode2-usage` are recreated when these change; the main server is untouched.
- **When updating:** Check whether upstream adds a Home-screen extension slot, a built-in usage view, or its own dashboard entry point. Retire this patch if any of those appear. If `HomeUtilityNav` is restructured, replay only the third action and keep the web-only guard.

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
