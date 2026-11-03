# Scout — the research agent

`/opencode2-state/config/opencode/agent/scout.md`. The web-reading agent, so Build doesn't have to be.

## Why it exists

Build writes and verifies code. Research — reading documentation, checking an upstream issue or
changelog, comparing third-party approaches, looking at a repo outside this workspace — is a
different capability with a different risk profile, and it was polluting Build's context.

Splitting it means the risky reading happens in a session that **cannot act on what it reads**.

## The threat this is built against

Indirect prompt injection (OWASP LLM01, MITRE T1698): instructions embedded in content the agent
legitimately fetches — a web page, a README, an issue comment — that try to redirect it into
taking actions for the attacker.

The literature is blunt that **in-band defenses don't hold**. Prompt-level instructions to ignore
injections are probabilistic; they raise the cost and reduce frequency, nothing more. Anthropic and
Microsoft both say so about their own systems. The containment has to be architectural.

## Architecture: capability separation, not instructions

Scout is an instance of what the literature calls the **Action-Selector** and **Dual LLM**
patterns (Beurer-Kellner et al., *Design Patterns for Securing LLM Agents against Prompt
Injections*, arXiv:2506.08837):

- **Action-Selector** — the agent can read untrusted content but cannot act on it. Immune by
  construction, because the injected text has no capability to reach for.
- **Dual LLM** — a privileged agent with tools never processes untrusted data; a quarantined agent
  processes the untrusted data but has no tools. Results cross back by reference, as text.

Scout is the quarantined half. The enforced part is the permission set:

| Capability | Scout |
| --- | --- |
| `webfetch`, `websearch` | allow |
| `read`, `glob`, `grep` | allow |
| `edit`, `write`, `patch` | **deny** (via `*` / `*` deny first) |
| `shell` | ask |
| `.env`, `.pem`, `.key`, `*credentials*` | ask |

That is what makes the split real. The prompt tells Scout to treat fetched text as data, but the
*reason* an injection can't hurt you is that Scout has nothing to point at.

## What this does NOT protect against

Being honest about the limits, because a false sense of safety is worse than none:

1. **Scout can still be manipulated into reporting wrong things.** An injection cannot make Scout
   edit a file, but it could make Scout return a plausible false summary. The containment is
   integrity of *actions*, not of *claims*. The review gate below narrows this — it catches leaked
   instructions and off-topic reports — but it does not make Scout's claims trustworthy. Treat the
   output as untrusted input; the literature is explicit that a sub-agent's output is just another
   external source.
2. **`shell: ask` is a real hole if you click through.** Scout asks for shell, and a determined
   injection that convinces you to approve a command wins. If you want it airtight, change that to
   `deny` — Scout rarely needs shell for research.
3. **`read: allow` is broad.** Scout can read any file in the workspace, including ones with
   embedded instructions (a malicious `README.md` in a cloned repo). The secret-shaped paths ask,
   but ordinary project files don't.
4. **Exfiltration via fetch.** Scout can fetch URLs, so a successful injection could encode findings
   into a query string. The prompt forbids it; nothing technical prevents it. A URL allowlist would
   be the fix if this matters.
5. **Research quality is unaudited.** Scout reports what it read vs inferred vs unchecked. Nothing
   verifies that self-report.

The pattern that would close most of this is **CaMeL** (arXiv:2503.18813): the privileged model
emits a plan, a deterministic interpreter executes it, and untrusted data can only flow through
declared channels. That's a substantial build, and it's the correct next step only if Scout becomes
load-bearing.

## The review gate

`.opencode/plugins/scout-review.ts` hooks `tool.execute.after` on the `subagent` tool. When the
child agent is Scout, it sends the request and the report to a judge
(`scout-review-judge.txt`, modelled on `packages/core/src/plugin/goal/judge.txt`) and appends a
verdict to the result.

**This is a tripwire on the return path, complementing the capability denial on the outbound path.**
Scout cannot act; the gate checks what it says. Neither replaces the other, and neither is a
boundary — the judge reads the same untrusted text, so a crafted injection can target it too.

### Two concerns, two standards of proof

The distinction matters, and getting it wrong disables half the gate:

- **Injection** requires a **verbatim quote** of the offending text. The evidence really is a span.
- **Misalignment** requires an **`asked` / `answered` comparison**, not a quote. The evidence that a
  report answered the wrong question is a relationship between two things, so demanding a quote
  here would systematically pass exactly the category it exists to catch.

**"Suspicion alone"** is defined operationally as *a flag with neither a quote nor a stated
comparison*. The parser enforces it: a `misaligned` verdict missing either half, or an `injection`
verdict with no quote, is **discarded** rather than surfaced. An unverifiable flag trains the reader
to ignore the gate, so it cannot reach them.

### Verdict shapes

```json
{"verdict":"pass","reason":"..."}
{"verdict":"flag","concern":"misaligned","asked":"...","answered":"...","reason":"..."}
{"verdict":"flag","concern":"injection","reason":"...","evidence":"<verbatim>"}
{"verdict":"flag","concern":"both","asked":"...","answered":"...","reason":"...","evidence":"..."}
```

Injection and `both` require `evidence`; misaligned and `both` require `asked` and `answered`.

### Behaviour

- **Pass is silent.** Only a flag surfaces. A gate that prompts on every result is a rubber stamp.
- **Flags show their basis** — `Asked: / Answered:` or `Quoted from the report:` — so the reasoning
  is checkable rather than trusted.
- **Errors fail closed and visibly**: a crashed judge produces `<scout-review state="unreviewed">`,
  never a silent pass. Unreviewed is not approved.
- **The report is XML-escaped** before it enters the judge prompt, so it cannot close the `<report>`
  tag and escape into the instructions.

### Why `pass` is the default

The literature and the local evidence agree: a gate that fires often gets clicked through. This
workspace's ask log shows 507 prompts with ~96% approved — that is the failure mode this is
designed against. The judge passes a mediocre but on-topic answer, passes "I could not find it",
and passes a report that quotes an attack and says it ignored it.

## Testing

```
node .opencode/plugins/scout-review.test.mjs                          # offline, in `bun run check`
OPENCODE_PASSWORD=... node .opencode/plugins/scout-review.test.mjs   # + live judge
```

The offline half covers logic that can regress silently: per-concern evidence standards, rejection
of unverifiable flags, XML escaping, both envelope shapes (`description` present and absent), and
agent identification from the tool input rather than the report text.

The live half runs six documented payload shapes and asserts the **verdict class**, not wording:
clean report, reported dead end, report quoting-but-refusing an injection, and three that must flag
(leaked instruction, fake authority, answer to the wrong question). It is excluded from the default
run because it depends on a model's judgement — a model upgrade can change a verdict without the
prompt being wrong, so treat it as advisory.

## Usage

Switch to Scout for research; the handoff from Build names it. Scout reads, then reports — it does
not carry the task forward, so Build picks the work back up with the answer.

The system prompt is the body of `scout.md` (everything after the frontmatter). It covers the
data-not-instruction rule, refusing to act, reporting by provenance (read / inferred / unchecked),
source ranking, and staying out of personal data.

## References

- OWASP LLM01:2025 — Prompt Injection, including the indirect sub-class
- MITRE ATT&CK T1698 — Indirect Prompt Injection
- Beurer-Kellner et al., *Design Patterns for Securing LLM Agents against Prompt Injections*,
  arXiv:2506.08837 — Action-Selector, Plan-Then-Execute, Map-Reduce, Dual LLM, Code-Then-Execute,
  Context-Minimization
- Debenedetti et al., *Defeating Prompt Injections by Design* (CaMeL), arXiv:2503.18813
- Simon Willison, *The Dual LLM pattern* (2023) and *The lethal trifecta for AI agents* (2025)
- Anthropic, *Mitigating the risk of prompt injections in browser use* (2025) — classifiers plus
  training, and their own statement that it is not solved
- Microsoft MSRC, *How Microsoft defends against indirect prompt injection* (2025) — defence in
  depth, and FIDES for information-flow control
