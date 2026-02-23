# PR Acceptance Patterns

**Analysis**: 27 merged, 36 closed-unmerged, 23 open — as of 2026-02-23

## ✅ What Gets Merged

| Type | Pattern | Examples |
|------|---------|---------|
| `fix` | Replace TypeScript `any` with explicit types (one module) | #1752, #1764, #1774, #1782 |
| `fix` | Single code quality fix (strict equality, curly braces, unused vars) | #1759, #1761, #1771 |
| `fix` | Security attribute (window.open, CSP) | #1794 |
| `perf` | Specific measured bottleneck (Zustand object selector, specific inline handler) | #1773, #1777, #1781 |
| `test` | Tests for one specific component/hook | #1791 |
| `feat` | Well-scoped, unique feature not already in features.md | #1826, #1769 |

**Key traits of merged PRs**:
- Narrow scope (1-5 files)
- Clear problem and solution
- Does NOT duplicate open/recent PRs
- Passes all quality checks

## ❌ What Gets Rejected

### 1. Duplicate Features (most common rejection reason)
These feature types have been created 3+ times and never merged:
- **Keyboard shortcuts panel/dialog/help** → 6+ attempts — all rejected/unreviewed
- **Workflow notes/documentation/comments panel** → 4+ attempts — all rejected/unreviewed
- **Workflow statistics panel** → 2+ attempts — all rejected
- **Node templates/snippets system** → 2+ attempts — unreviewed
- **Viewport/workflow bookmarks** → 2+ attempts — unreviewed
- **Canvas pan controls** → 1 attempt, unreviewed
- **Smart alignment guides** → 1 attempt, unreviewed

### 2. Bulk React.memo / React optimization (14 rejected)
- Adding React.memo to many components without profiling data
- These get rejected because they are premature/speculative optimization
- Only targeted perf PRs with clear evidence get merged

### 3. Multi-issue fix PRs
- Combining TypeScript fixes + lint fixes + test fixes in one PR gets rejected
- Keep PRs focused on a single type of fix

### 4. Features already covered by open PRs
- If a PR for the feature is already open, creating another one clogs the queue

### 5. "Audit report" / doc-only PRs
- A PR that just adds a performance/audit report markdown file (#1789) — not useful

## 🔑 Pre-PR Checklist (MANDATORY)

Before creating a PR, ALWAYS run:
```bash
gh pr list --state open --author "@me" --limit 50
gh pr list --state closed --author "@me" --limit 20
```

**If a similar PR is already open or was recently closed, DO NOT create a new one.**

## 💡 High-Acceptance Strategies

1. **TypeScript `any` → specific type**: Find remaining `any` usages, fix one file/module at a time
2. **Targeted perf**: Fix only the specific Zustand selector or inline handler that's provably wrong
3. **Security**: `window.open` rel/target attributes, sanitization
4. **Small focused tests**: Tests for one component, based on coverage report
5. **Unique features**: Check features.md AND open PRs — if it's already there, skip it
