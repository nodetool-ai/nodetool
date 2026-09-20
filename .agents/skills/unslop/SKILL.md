---
name: unslop
description: "Remove unnecessary abstractions, defensive code, comments, or prose from a requested diff or files. Preserve behavior and repository rules."
---

# Unslop

A pre-commit pass that removes patterns LLMs add reflexively but humans wouldn't write. Apply it to the requested diff or files. The goal isn't to shorten the diff — it's to delete code whose absence would not be missed.

This skill complements (does not replace) [`AGENTS.md`](../../../AGENTS.md) and [`web/src/components/ui_primitives/STRATEGY.md`](../../../web/src/components/ui_primitives/STRATEGY.md). Those define the rules. This skill defines the patterns to actively hunt and remove.

Unslop is a quality pass, not a bug hunt. For correctness review of a diff, branch, or PR — including the NodeTool-specific landmines — use [`code-review`](../code-review/SKILL.md); a full pre-merge pass runs both.

## How to use

1. After making changes, run `git diff` and read every added line through the lenses below.
2. For each "slop" you find, delete or rewrite it. Don't leave a `// removed X` comment behind.
3. Complete [mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification) for code edits. For prose-only edits, check affected links and formatting. Reuse valid results for unchanged files.
4. When deleting an abstraction, remove unused types and exports. Preserve behavior coverage by moving useful tests to the surviving public interface.

## Pattern reference

Read [patterns.md](references/patterns.md) for the languages and frameworks in
the diff. Repository rules take precedence over these cleanup heuristics.

## Self-review checklist

Use the relevant questions to inspect the requested diff. Verify each concern
against the repository rules before changing code.

- [ ] Did I add a comment that restates the code, names the PR, or describes a removed feature?
- [ ] Did I add a `try/catch` whose error path can't actually trigger here?
- [ ] Did I write `any`, `as any`, or `as unknown as` to silence the compiler?
- [ ] Did I add `useEffect` to compute a value from props/state I already have?
- [ ] Did I `useCallback`/`useMemo`/`React.memo` without a memoized consumer or measurable cost?
- [ ] Did I subscribe to a whole Zustand store (`const s = useFooStore()`) or skip `useShallow` on a multi-key selector?
- [ ] Did I import a raw MUI component into a non-primitive file, or hardcode a color, spacing, radius, font size, or transition?
- [ ] Did I write a `useEffect`+`fetch` instead of `useQuery`?
- [ ] Does any new test assert implementation rather than user-visible behavior?
- [ ] Are there `// TODO`, `// removed`, `// added by`, or "useful elsewhere" leftovers?
- [ ] Could three near-identical lines have been left as-is instead of becoming a helper?
- [ ] Does my prose contain any banned openers or filler ("delve", "robust", "seamlessly", "Here's the thing")?
- [ ] Have I left any required verification incomplete?

Report the concrete removals and verification results. A checklist alone does
not establish correctness.

## Sources

Patterns synthesized from these community skills, adapted to NodeTool's stack:

- [theclaymethod/unslop](https://github.com/theclaymethod/unslop) — humanizing AI-generated prose
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) — banned phrases and structural red flags
- [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) — banned-word and banned-pattern catalog
- [anthropics/skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — anti-generic-aesthetic principles
- [vercel-labs/agent-skills/composition-patterns](https://github.com/vercel-labs/agent-skills) — composition over boolean-prop proliferation
- [vercel-labs/agent-skills/react-best-practices](https://github.com/vercel-labs/agent-skills) — React/Next performance rules
- [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill) — React 19 / TypeScript review patterns
- NodeTool's own [`AGENTS.md`](../../../AGENTS.md) and [`STRATEGY.md`](../../../web/src/components/ui_primitives/STRATEGY.md)
