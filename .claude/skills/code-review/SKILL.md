---
name: code-review
description: "Review a diff, branch, or PR for correctness, repository standards, and spec coverage. Report evidence-backed findings."
---

# Code Review

Three-axis review of the diff between `HEAD` and a fixed point:

- **Correctness** — does the change work, and does it step on a NodeTool landmine?
- **Standards** — does it follow this repo's documented rules?
- **Spec** — does it faithfully implement the originating issue or spec?

Review all applicable axes. Use independent subagents when available, permitted,
and useful for the diff. For a small diff or a host without delegation, review
the axes locally. Keep review read-only unless the user also requested fixes.

Division of labor with the sibling skill: [`unslop`](../unslop/SKILL.md) asks whether the change is free of AI-generated filler. Use it when cleanup is requested or a concrete issue needs that guidance.

The rules the Correctness and Standards axes cite live in [`AGENTS.md`](../../../AGENTS.md), [`docs/DEVELOPMENT_STANDARDS.md`](../../../docs/DEVELOPMENT_STANDARDS.md), and the area `AGENTS.md` files.

## Process

### 1. Pin the fixed point

Whatever the user named is the fixed point — a commit SHA, branch, tag, `main`, `HEAD~5`. If they named none, infer from what they asked for:

- Working tree: `git diff` + `git diff --cached`, plus untracked files via `git status`.
- Branch or PR: `git diff $(git merge-base main HEAD)...HEAD` — never `git diff main`, which picks up drift on main. For a PR, fetch the branch first.

Capture the diff command once, and the commit list via `git log <fixed-point>..HEAD --oneline`. Confirm the ref resolves (`git rev-parse`) and the diff is non-empty before going further — a bad ref should fail here, not inside three sub-agents.

### 2. Map the blast radius

`npm run dev:nodetool -- affected --base main --json` lists the workspaces to typecheck and test, and says whether a decorator package (loads from `dist/`) forces `npm run build:packages`. Don't guess.

### 3. Find the spec

In order:

1. Issue references in the commit messages (`#123`, `Closes #45`).
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch or feature.
4. Use acceptance criteria already provided in the conversation. If no spec exists,
   report that limitation and continue Correctness and Standards review. Ask only
   when a particular behavior cannot be assessed without a missing requirement.

### 4. Find the standards sources

`AGENTS.md`, `docs/DEVELOPMENT_STANDARDS.md`, the `AGENTS.md` for each area the diff touches, and anything else the repo documents about how code should be written.

On top of those, the Standards axis always carries the [smell baseline](references/review-checklists.md#smell-baseline) below, which applies even where a repo documents nothing. Two rules bind it: a documented repo standard always wins, and every smell is a labelled heuristic ("possible Feature Envy"), never a hard violation.

### 5. Review the applicable axes

For a substantial diff, delegate independent axes with the host's available agent
tools. Give each reviewer the diff scope, relevant source paths, requirements,
and a read-only task. Do not depend on a particular tool name or agent subtype.

- Correctness: read changed functions and their callers. Identify an input or
  state that triggers each claimed failure. Enumerate consumers of shared types.
- Standards: cite the applicable repository rule. Treat the smell baseline as
  a heuristic requiring a concrete consequence, not an automatic violation.
- Spec: identify missing, incorrect, or unrequested behavior against the supplied
  acceptance criteria. Do not invent a spec when one is unavailable.

### 6. Verify

Use existing check results when they apply to the reviewed state. Run targeted
checks for unresolved correctness questions. After making code fixes, complete
[mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification).
Do not substitute a full suite or aggregate check merely because the diff is wide.
Report actual results and any limits of verification.

### 7. Report

Verify delegated findings against the source, combine duplicates, and lead with
concrete failures ordered by severity. Label each finding's axis and give the
location, trigger or cited rule, consequence, and suggested correction. Match
length to the findings. If no findings are supported, say so and describe what
was checked and what remains unverified.

Read [review-checklists.md](references/review-checklists.md) for the areas the
diff touches and for the optional smell baseline.

## Severity

| Tier | Meaning | Bar |
|------|---------|-----|
| **Blocker** | Wrong behavior, crash, data loss, security hole, broken build | You can name the input or state that triggers it |
| **Should-fix** | Violates a written repo rule | Cite the rule |
| **Nit** | Everything else worth a sentence | Only if you found nothing bigger in that file; never pad |

A finding without a failure scenario or a citable rule is not a finding. When unsure whether something is a bug, say so instead of inflating the severity.

## What not to flag

- Anything `npm run lint` or `npm run typecheck` already rejects — report their output instead of duplicating it as prose findings.
- Style preferences with no backing in the repo docs. "I'd have written it differently" is not a finding.
- Pre-existing problems outside the diff. Mention once at the end if serious; don't mix them into the findings.
- Slop — comments, dead abstractions, prose filler. One pointer to `unslop`, not itemized findings.

## Output format

Order supported findings by severity and label their axis. For example:

```
[BLOCKER] packages/kernel/src/actor.ts:142 — `pending` is never cleared on error
When a node throws, `handleError` returns early before `this.pending.delete(id)`,
so the runner waits forever on the next `sync_mode: on_any` join.
Fix: move the delete into a `finally`.
```

One line of location and claim, the failure scenario, the fix. Close with what you actually ran:

```
Verified: npm run build --workspace=packages/kernel ✓, npm run test --workspace=packages/kernel ✓ (34 passed)
```

If nothing is wrong, say so plainly and list what you checked — a clean review is a valid result, not a failure to find something.
