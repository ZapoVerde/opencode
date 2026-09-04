# opencode Patched — Local Fork

This checkout is the live patched OpenCode source used by the local OpenCode stack.

## Patch model

There are two distinct branch roles:

1. **Patch branches** contain one independent local change and are based directly on the upstream version they modify.
2. **Patched integration branches** combine that upstream version with every still-active local patch.

A patch branch must not be created from the patched integration branch. Keeping each patch based on upstream prevents one local patch from depending accidentally on another and makes upgrades reproducible.

Conceptually:

```text
upstream version
  |-- fix/patch-a
  |-- feat/patch-b
  `-- fix/patch-c

upstream version + patch-a + patch-b + patch-c
  -> opencode-X.XX.X-patched
```

`PATCHES.md` is the authoritative ledger of local source patches. OpenCode's repository-level `patches/` directory contains dependency/package patches from upstream and is unrelated to this local patch workflow.

## Git remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `upstream` | `https://github.com/anomalyco/opencode.git` | Fetch OpenCode source and releases |
| `origin` | `https://github.com/ZapoVerde/opencode.git` | Back up persistent patch branches and patched integration branches |

## Applying a new patch

Start from the exact upstream base used by the current patched release, not from `opencode-X.XX.X-patched`.

1. Fetch the upstream base and create the patch branch:

   ```bash
   git fetch upstream
   git switch --detach <upstream-release-or-commit>
   git switch -c fix/description-of-fix
   ```

   Use `feat/...` instead of `fix/...` for a local feature.

2. Make and verify the change, then commit it:

   ```bash
   git add <files>
   git commit -m "patch: description of fix"
   ```

3. Push the independent patch branch:

   ```bash
   git push -u origin fix/description-of-fix
   ```

4. Integrate it into the current patched branch:

   ```bash
   git switch opencode-X.XX.X-patched
   git cherry-pick fix/description-of-fix
   ```

5. Add the patch to `PATCHES.md`, including its purpose, files, patch branch, and what to check on the next upstream update.

6. Push the patched integration branch:

   ```bash
   git push origin opencode-X.XX.X-patched
   ```

7. Restart the `opencode` stack so the running server picks up the changed bind-mounted source.

## Updating OpenCode

Upgrades create a new patched integration branch from the new upstream version and then deliberately re-apply only the patches that are still needed.

1. Fetch the new upstream source and identify the exact release/tag/commit to run:

   ```bash
   git fetch upstream
   git switch --detach <new-upstream-release-or-commit>
   git switch -c opencode-X.XX.X-patched
   ```

2. Review every active entry in `PATCHES.md` against the new upstream source.

   For each patch:
   - if upstream now provides the behavior, verify it and mark the patch retired;
   - if the patch is still required, cherry-pick its independent patch branch;
   - if it conflicts, resolve the conflict in the integration branch and verify behavior before continuing.

   ```bash
   git cherry-pick fix/some-patch-branch
   ```

3. Install dependencies and run the relevant verification for the new version.

4. Update the version section in `PATCHES.md` so it records exactly which local patches are active on the new branch.

5. Push the new integration branch:

   ```bash
   git push -u origin opencode-X.XX.X-patched
   ```

6. Update any deployment configuration that pins the old branch/version, then restart the `opencode` stack.

## Retiring a patch

Do not delete the patch branch merely because upstream absorbed it. Mark the patch retired in `PATCHES.md` with the upstream version or commit that made it unnecessary. The branch remains useful historical evidence and can be deleted later only if there is no value in retaining it.

A retired patch is simply omitted when constructing the next patched integration branch.

## Live deployment

The OpenCode stack runs source from `/config/workspace/opencode`. Its compose configuration is under `/config/workspace/stacks/opencode`.

The container provides the runtime while the bind-mounted checkout provides the application source. Source changes therefore require a stack/container restart, not an image rebuild, unless the runtime image itself also changes.

## Development environment

This is a Bun/TypeScript monorepo. From `packages/opencode/`:

- `bun run dev` — run the CLI from source
- `bun run build` — build a distributable binary through `script/build.ts`
- `bun run typecheck` — TypeScript verification
- `bun test` — test suite

## Gotchas

- Keep patch branches independent: always branch from the relevant upstream base, never from the patched integration branch.
- `PATCHES.md` tracks our local source patches. The repository `patches/` directory is upstream dependency/package patch machinery and is a different thing.
- The clone may be shallow. Before creating or replaying a patch against an older base, fetch enough history or the exact required tag/commit first.
- `bun install` can modify `bun.lock`. Treat lockfile changes as source changes: inspect them and commit them only when they are intentionally part of the patch or upgrade. Do not fold incidental install churn into an unrelated patch.
- The core agent loop (`runLoop`) lives in `packages/opencode/src/session/prompt.ts`, not in a file named `loop`.
