# OpenCode Memory System - Implementation Guide

This document explains the OpenCode memory system implemented for NodeTool's GitHub workflows.

## Overview

OpenCode workflows run on scheduled intervals and work autonomously. The memory system prevents redundant problem-solving by maintaining a persistent knowledge base.

## Memory Location

All memory files are stored in `.github/opencode-memory/`:

```
.github/opencode-memory/
├── README.md                    # Memory system documentation
├── features.md                  # Complete feature list
├── project-context.md           # Architecture and patterns
├── build-test-lint.md           # Quality requirements
├── tech-stack.md                # Technologies and versions
│
├── issues/                      # Known issues organized by topic
│   ├── README.md                # How to add new issues
│   ├── typescript/              # TypeScript type errors
│   ├── build/                   # Build and bundling issues
│   ├── testing/                 # Test failures and configs
│   ├── linting/                 # ESLint and type check issues
│   ├── state-management/        # Zustand and React state
│   ├── ui-styling/              # MUI, ReactFlow, styling
│   ├── api-backend/             # WebSocket, CORS, API
│   ├── dependencies/            # npm and package issues
│   ├── git-ci/                  # Git, CI/CD, workflows
│   └── electron/                # Electron-specific issues
│
├── insights/                    # Best practices by topic
│   ├── README.md                # How to add new insights
│   ├── architecture/            # Architectural patterns
│   ├── performance/             # Performance optimizations
│   ├── testing/                 # Testing strategies
│   ├── code-quality/            # Code quality practices
│   ├── ui-ux/                   # UI/UX patterns
│   ├── api-backend/             # API integration patterns
│   ├── build-system/            # Build tooling
│   ├── deployment/              # Deployment and distribution
│   └── future/                  # Future considerations
│
└── (legacy flat files)
    ├── common-issues.md         # Deprecated - use issues/
    └── insights.md              # Deprecated - use insights/
```

## Memory Files Purpose

### 1. README.md
- **Purpose**: Explains the memory system itself
- **For**: OpenCode workflows to understand how to use memory
- **Updates**: Rarely (only system changes)

### 2. project-context.md
- **Purpose**: Core project information
  - What NodeTool is and does
  - Architecture overview
  - Key directories
  - Design principles
  - Important patterns
  - Data flow
  - Critical files
- **For**: Understanding the project at a high level
- **Updates**: When architecture changes or new patterns emerge

### 3. build-test-lint.md
- **Purpose**: Code quality requirements
  - Mandatory commands (make typecheck/lint/test)
  - Individual package commands
  - Testing requirements
  - Linting rules
  - Common errors and fixes
- **For**: Ensuring all PRs meet quality standards
- **Updates**: When quality requirements change

### 4. tech-stack.md
- **Purpose**: Technology information
  - Frontend technologies and versions
  - Testing frameworks
  - Development tools
  - CI/CD setup
  - Version constraints
  - Known version issues
- **For**: Understanding what's available and constraints
- **Updates**: When dependencies are updated

### 5. issues/ folder (replaces common-issues.md)
- **Purpose**: Known problems and solutions organized by topic
  - Each topic has its own subfolder
  - Each issue is a separate markdown file
  - Files have descriptive names (e.g., `jest-module-not-found.md`)
- **For**: Avoiding redundant debugging
- **Updates**: Create new files when issues are solved

### 6. insights/ folder (replaces insights.md)
- **Purpose**: Important discoveries organized by topic
  - Each topic has its own subfolder
  - Each insight is a separate markdown file
  - Files have descriptive names (e.g., `zustand-selective-subscriptions.md`)
- **For**: Learning from past experiences
- **Updates**: Create new files when significant learnings occur

## How Workflows Use Memory

### Before Making Changes

Each workflow prompt instructs the agent to:

1. **Read memory files and folders first** (in priority order):
   - `build-test-lint.md` (for test/quality workflows)
   - `issues/<topic>/` (list folders, check if issue already solved)
   - `project-context.md` (understand architecture)
   - `tech-stack.md` (know available tools)
   - `insights/<topic>/` (learn from past experiences)

2. **Check for previous work**:
   - Has this issue been solved before?
   - Are there known solutions?
   - What patterns should be followed?

### After Completing Work

Workflows are instructed to:

1. **Create new files in appropriate folders**:
   - `issues/<topic>/your-issue.md`: Add new solutions
   - `insights/<topic>/your-insight.md`: Document important learnings
   - `project-context.md`: Add to "Recent Changes"

2. **Use this format for issue files**:
   ```markdown
   # Issue Title

   **Problem**: Description
   **Solution**: Details
   **Files**: List
   **Date**: YYYY-MM-DD
   ```

## Workflow-Specific Memory Usage

### opencode.yml (Manual Trigger)
- **Reads**: All memory files for context
- **Updates**: Rarely (manual requests are varied)
- **Focus**: Helping with specific user requests

### opencode-features.yaml (Scheduled)
- **Reads**: All memory files, especially insights.md
- **Updates**: Frequently (each feature adds learnings)
- **Focus**: Feature development

### opencode-hourly-improve.yaml (Scheduled)
- **Reads**: issues/, insights/
- **Updates**: Very frequently (each fix documents solution)
- **Focus**: Code quality improvements

### opencode-hourly-test.yaml (Scheduled)
- **Reads**: build-test-lint.md, issues/testing/
- **Updates**: Frequently (documents test failures)
- **Focus**: Quality assurance

## Memory Update Guidelines

### What to Remember

✅ **DO document**:
- Solutions to non-obvious problems
- Architectural decisions and rationale
- Patterns that work well in this codebase
- Common mistakes to avoid
- Build/test/lint issues and fixes
- Performance optimizations
- Security considerations

❌ **DON'T document**:
- Obvious changes
- One-time fixes with no recurrence risk
- Personal preferences (unless project-wide)
- Temporary workarounds (fix properly instead)
- Information already in main docs

### Entry Format

```markdown
### [Clear Title] (2026-01-10)

**Issue/Insight**: What was the problem or learning?

**Solution/Why**: How was it solved or why does it matter?

**Impact**: What's the benefit? (optional)

**Files Affected**: path/to/file.ts, path/to/other.ts
```

### Example Entry

```markdown
### ReactFlow Node Type Assertions (2026-01-10)

**Issue**: TypeScript errors when using ReactFlow nodes with custom NodeData.

**Solution**: Use explicit type assertions:
```typescript
const nodes = reactFlowNodes as Node<NodeData>[];
```

**Why**: ReactFlow's generic types don't know about our custom interface.

**Files Affected**: web/src/stores/NodeStore.ts, web/src/hooks/useProcessedEdges.ts
```

## Memory Maintenance

### Regular Cleanup

Memory files should be reviewed periodically (every ~50 workflow runs):

1. **Remove outdated information**:
   - Solved issues that can't recur
   - Deprecated patterns
   - Old version-specific workarounds

2. **Consolidate similar entries**:
   - Merge related issues
   - Group common patterns
   - Reduce duplication

3. **Update with new findings**:
   - Better solutions discovered
   - More efficient patterns
   - Improved understanding

4. **Keep files manageable**:
   - Target: Under 500 lines per file
   - Split if getting too large
   - Archive very old entries

### When to Clean Up

- Memory files getting unwieldy (>500 lines)
- Major version upgrades (React, TypeScript, etc.)
- Architectural refactors
- Every 2-3 months
- When workflows repeatedly reference outdated info

## Integration with Existing Documentation

### Memory vs Main Docs

**Main Documentation** (`AGENTS.md`, `README.md`, etc.):
- Canonical project information
- Setup and installation
- Architecture overview
- Contribution guidelines
- **Updated manually by humans**

**Memory Files** (`.github/opencode-memory/`):
- Operational knowledge
- Problem solutions
- Discovered patterns
- Lessons learned
- **Updated by OpenCode workflows**

### Relationship

```
Main Docs (Canonical)
    ↓
Memory Files (Operational)
    ↓
Workflow Actions (Execution)
```

Memory files **complement** main docs, they don't replace them.

## Benefits

### For Workflows

1. **Avoid Redundancy**: Don't re-solve the same problems
2. **Learn from History**: Build on previous successes
3. **Follow Patterns**: Maintain consistency
4. **Faster Execution**: Less exploration needed
5. **Better Quality**: Apply known best practices

### For the Project

1. **Institutional Knowledge**: Accumulated wisdom over time
2. **Consistent Quality**: Patterns applied uniformly
3. **Reduced Errors**: Known pitfalls avoided
4. **Documentation**: Self-documenting operational knowledge
5. **Onboarding**: New contributors learn from memory

## Success Metrics

The memory system is working well if:

- ✅ Workflows reference memory in PR descriptions
- ✅ Similar issues are solved faster over time
- ✅ Patterns are consistently applied
- ✅ Memory files are actively updated
- ✅ Fewer redundant PRs for same issues

## Future Enhancements

Potential improvements:

1. **Automated Memory Cleanup**: Script to remove outdated entries
2. **Memory Search Tool**: Quick lookup for workflows
3. **Memory Analytics**: Track what's most useful
4. **Cross-Workflow Learning**: Share insights between workflows
5. **Memory Validation**: Ensure entries stay relevant

## Troubleshooting

### Workflow Not Reading Memory

**Symptoms**: Workflow re-solves known issues

**Solution**: Check if memory files exist and are readable. Verify workflow prompt includes memory reading instructions.

### Memory Files Growing Too Large

**Symptoms**: Files >500 lines, hard to navigate

**Solution**: Run manual cleanup. Archive old entries. Consider splitting into sub-files.

### Outdated Memory Entries

**Symptoms**: Workflows following obsolete patterns

**Solution**: Review and update memory files. Remove deprecated information.

### Memory Conflicts with Main Docs

**Symptoms**: Memory contradicts AGENTS.md or README.md

**Solution**: Main docs are canonical. Update memory to align. If main docs are wrong, update them first.

## Summary

The OpenCode memory system provides persistent, operational knowledge that helps autonomous workflows:

1. **Learn from the past**: Read memory before making changes
2. **Avoid redundancy**: Check if problems were already solved
3. **Share knowledge**: Update memory with new learnings
4. **Maintain quality**: Follow documented patterns and standards
5. **Accumulate wisdom**: Build institutional knowledge over time

This creates a feedback loop where each workflow run makes the system smarter and more efficient.

---

**Created**: 2026-01-10
**Last Updated**: 2026-01-10
**Maintained By**: OpenCode workflows + manual reviews
