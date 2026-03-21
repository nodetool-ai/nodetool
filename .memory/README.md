# Agent Memory

Persistent knowledge for CI workflow agents. Organized by topic to avoid merge conflicts.

## Structure

```
.memory/
├── features.md        # Existing features (check before adding new ones)
├── project-context.md # Architecture, patterns, recent changes
├── build-test-lint.md # Quality commands and requirements
├── tech-stack.md      # Technologies and versions
├── issues/            # Known issues by topic (typescript/, testing/, etc.)
└── insights/          # Best practices by topic (performance/, architecture/, etc.)
```

## Usage

**Before working**: Read `features.md` and `project-context.md`. Check relevant `issues/` and `insights/` folders.

**After working**: Add one line to `features.md` for new features. Create a file in `issues/<topic>/` or `insights/<topic>/` only for significant learnings.

## File Format

Keep files short. Use kebab-case names (e.g., `issues/testing/jest-e2e-exclusion.md`).

```markdown
# Title
**Problem**: One sentence
**Solution**: One sentence or code snippet
**Date**: YYYY-MM-DD
```
