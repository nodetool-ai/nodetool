# OpenCode Long-Term Memory

This directory contains persistent knowledge for OpenCode workflows to avoid solving the same problems repeatedly. Content is organized into **folders by topic**, with **individual files for each issue/insight** to prevent merge conflicts and keep context focused.

## Directory Structure

```
opencode-memory/
├── README.md              # This file - overview and usage
├── features.md            # Complete list of existing features
├── project-context.md     # Core architecture and recent changes
├── build-test-lint.md     # Quality requirements and commands
├── tech-stack.md          # Technologies and versions
│
├── issues/                # Known issues organized by topic
│   ├── README.md          # How to add new issues
│   ├── typescript/        # TypeScript type errors
│   ├── build/             # Build and bundling issues
│   ├── testing/           # Test failures and configs
│   ├── linting/           # ESLint and type check issues
│   ├── state-management/  # Zustand and React state
│   ├── ui-styling/        # MUI, ReactFlow, styling
│   ├── api-backend/       # WebSocket, CORS, API
│   ├── dependencies/      # npm and package issues
│   ├── git-ci/            # Git, CI/CD, workflows
│   └── electron/          # Electron-specific issues
│
└── insights/              # Best practices organized by topic
    ├── README.md          # How to add new insights
    ├── architecture/      # Architectural patterns
    ├── performance/       # Performance optimizations
    ├── testing/           # Testing strategies
    ├── code-quality/      # Code quality practices
    ├── ui-ux/             # UI/UX patterns
    ├── api-backend/       # API integration patterns
    ├── build-system/      # Build tooling
    ├── deployment/        # Deployment and distribution
    └── future/            # Future considerations
```

## How to Use

### Before Making Changes

1. **Check `features.md`** - Ensure your feature doesn't already exist
2. **List `issues/<topic>/`** - Check if your problem is already solved
3. **List `insights/<topic>/`** - Learn from existing best practices
4. **Read `project-context.md`** - Understand recent changes

### After Completing Work

1. **New feature?** → Add ONE line to `features.md`
2. **Solved a tricky problem?** → Create a file in `issues/<topic>/`
3. **Discovered a best practice?** → Create a file in `insights/<topic>/`
4. **Significant change?** → Add entry to `project-context.md`

## File Naming Convention

Use **descriptive, kebab-case names** that summarize the content:
- `issues/typescript/reactflow-node-type-mismatches.md`
- `issues/testing/jest-e2e-test-exclusion.md`
- `insights/performance/zustand-selective-subscriptions.md`

**Why?** Agents can list a folder to get an overview of topics, then read specific files for details.

## File Format

### Issue Files (`issues/<topic>/*.md`)

```markdown
# Issue Title

**Problem**: One sentence describing the issue

**Solution**: One sentence or brief code snippet

**Why**: Brief explanation (optional)

**Files**: Related files (optional)

**Date**: YYYY-MM-DD
```

### Insight Files (`insights/<topic>/*.md`)

```markdown
# Insight Title

**Insight**: What was learned or discovered

**Rationale**: Why it matters

**Example**: Code example (if applicable)

**Impact**: Measurable benefit (if known)

**Files**: Related files (optional)

**Date**: YYYY-MM-DD
```

## Benefits of File-Based Structure

✅ **Fewer merge conflicts** - Each issue/insight is a separate file
✅ **Focused context** - Agents read only what they need
✅ **Better discoverability** - List folders to see topics at a glance
✅ **Easy to update** - Add/remove files without editing large documents
✅ **Version control friendly** - Git diffs are cleaner

## Maintenance

The `scripts/compact-memory.py` script handles cleanup for legacy flat files.

For the folder-based structure:
- Remove outdated files when issues are no longer relevant
- Consolidate similar files if they overlap
- Use `git log` to see when files were last updated
