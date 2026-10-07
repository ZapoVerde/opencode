# opencode2 Patched — Local V2 Checkout

This checkout is the isolated OpenCode V2 source tree used to evaluate and, if appropriate, run Router2. It is deliberately separate from `/workspace/opencode`, which remains the working OC1 patched checkout.

## Isolation rule

OC1 and OC2 may share the parent workspace but not the source checkout or runtime state.

- OC1 source: `/workspace/opencode`
- OC2 source: `/workspace/opencode2`
- OC1 runtime/data: existing OC1 locations
- OC2 runtime/data: must use separate locations when the service is created
- OC1 service remains untouched while OC2 is evaluated

Do not point OC2 at OC1's data/database/config state merely because the binaries can coexist.

## Patch model

Patch branches contain one independent local source change and are based directly on the exact upstream V2 base they modify. The patched integration branch combines the upstream V2 base with every still-active local patch.

Current integration branch: `opencode2-v2-patched`.

`PATCHES.md` is the authoritative ledger. The upstream repository's `patches/` directory is unrelated dependency/package patch machinery.

### Adding a patch

1. Fetch upstream and identify the exact V2 base commit.
2. Create a version/base-qualified `fix/...` or `feat/...` branch directly from that upstream commit, never from `opencode2-v2-patched`.
3. Implement and verify exactly one local deviation.
4. Commit and push the independent patch branch to `origin`.
5. Cherry-pick it into `opencode2-v2-patched`.
6. Record it in `PATCHES.md`.
7. Re-run the relevant verification against the integrated branch.

### Updating V2

V2 is moving quickly. Treat an update as a fresh upstream base, not as permission to carry patches forward mechanically. Review each active ledger entry against new upstream behavior. Retire patches that upstream has absorbed; recreate or replay only patches still required.

## Remotes

- `origin`: `https://github.com/ZapoVerde/opencode.git` — persistent local patch/integration branches
- `upstream`: `https://github.com/anomalyco/opencode.git` — authoritative OpenCode source

## Source-run identity

The OC2 stack runs `packages/cli/src/index.ts` directly, rather than a release-built CLI. In that mode the compile-time version constants are absent, so `packages/cli/src/version.ts` falls back to `local`. The OpenCode Console uses the server's User-Agent to identify the client; a `local` version can therefore fail the Zen free-model client check even when the account is connected.

For the current source checkout, `/config/workspace/stacks/opencode2/compose.yaml` sets `OPENCODE_VERSION=2.0.24` and `OPENCODE_CHANNEL=beta`. Keep these values aligned with the actual source package/channel. The source fallback to these environment variables is a tracked local patch in `PATCHES.md`; recreate the OC2 service after changing its environment.

## Router2 direction

Router2 should prefer OpenCode's external server/API boundary. Avoid modifying OpenCode source unless a concrete missing capability is demonstrated. Any required Router2 source change must be treated as an explicit patch under the lifecycle above.
