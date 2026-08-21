# opencode Patched — Local Fork

## Git Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `upstream` | `https://github.com/anomalyco/opencode.git` | Fetch new opencode releases |
| `origin` | `https://github.com/ZapoVerde/opencode.git` | Push patched branches for backup |

Each patch lives on its own local branch (e.g. `fix/some-bug`, `feat/loop-step`). These are cherry-picked into the main patched branch (`opencode-X.XX.X-patched`) and pushed to `origin`. See `PATCHES.md` for all active patches.

## Applying a Patch

1. Create a fix branch from the current patched branch:
   ```bash
   git checkout -b feat/description-of-change
   ```

2. Make your changes and commit:
   ```bash
   git add <file>
   git commit -m "patch: description of change"
   ```

3. Cherry-pick into the patched branch:
   ```bash
   git checkout opencode-X.XX.X-patched
   git cherry-pick feat/description-of-change
   ```

4. Push both branches to origin:
   ```bash
   git push origin feat/description-of-change
   git push origin opencode-X.XX.X-patched
   ```

5. Document it in `PATCHES.md`.

6. Restart the `opencode` container in Dockge to pick up the change (bind-mounted source, no rebuild needed — see `stacks/opencode/README.md`).

## Updating opencode to a New Version

1. Fetch the new tag/commit from upstream:
   ```bash
   cd /config/workspace/opencode
   git fetch upstream dev
   git checkout upstream/dev
   git switch -c opencode-X.XX.X-patched
   ```

2. Re-apply active patches from `PATCHES.md`. For each patch:
   - Check if upstream already fixed it — if so, mark it retired in `PATCHES.md`
   - If still needed, cherry-pick from the fix branch:
     ```bash
     git cherry-pick fix/some-patch-branch
     ```
   - Resolve any conflicts, then `git cherry-pick --continue`

3. Push the new patched branch to origin:
   ```bash
   git push -u origin opencode-X.XX.X-patched
   ```

4. Update the branch name in `stacks/opencode/compose.yaml`/deploy config if it's pinned.

5. Redeploy in Dockge.

## Dev Environment

This is a Bun/TypeScript monorepo. From `packages/opencode/`:
- `bun run dev` — runs the CLI straight from source (no build step)
- `bun run build` — compiles a distributable binary via `script/build.ts`
- `bun run typecheck` — `tsgo --noEmit`
- `bun test` — test suite

## Gotchas

- The clone is shallow (`--depth 1` off `upstream`'s default branch, `dev`). Cherry-picking commits that predate the clone point won't work — only patches created as branches within this fork.
- The core agent loop (`runLoop`) lives in `packages/opencode/src/session/prompt.ts`, not in a file named "loop" — see `PATCHES.md`/session notes if grepping for it later.
