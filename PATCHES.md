# opencode Patch Changelog

Authoritative ledger of local source patches carried on top of upstream OpenCode.

Each active patch must live on its own persistent branch based directly on the upstream version it modifies. Patched integration branches cherry-pick those independent patch branches. See `README-patched.md` for the lifecycle.

The repository `patches/` directory is OpenCode's dependency/package patch machinery and is not this patch ledger.

---

## v1.18.19 — branch: `opencode-1.18.19-patched`

No local source patches are currently recorded for this version.

The branch contains only the local patched-fork documentation on top of its upstream base.

### Unreconciled local state

- `bun.lock` is currently modified in the working checkout by dependency-install churn. It is not recorded as an active patch and must be reconciled before an OpenCode upgrade or source patch is prepared.
- A previously remembered change involving chat modes is not present in the current local branches, remote fork branches, or recorded patch history. Do not claim it as an active patch unless its source change is recovered and verified.

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
