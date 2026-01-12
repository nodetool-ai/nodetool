# OpenCode Long-Term Memory

This directory contains persistent knowledge and insights for OpenCode workflows to avoid solving the same problems repeatedly.

## Purpose

OpenCode workflows run on a schedule and work autonomously. This memory system helps them:

1. **Remember Solutions**: Store solutions to recurring problems
2. **Track Patterns**: Document code patterns and conventions discovered
3. **Avoid Redundancy**: Check memory before attempting similar changes
4. **Build Institutional Knowledge**: Accumulate wisdom over time

## Files

- `project-context.md` - Core project information and architecture
- `build-test-lint.md` - Commands and requirements for code quality
- `tech-stack.md` - Technologies, versions, and key dependencies
- `common-issues.md` - Known issues and their solutions
- `insights.md` - Important discoveries and learnings
- `features.md` - Comprehensive list of all existing features (READ FIRST!)

## How to Use

### For OpenCode Workflows

1. **Before making changes**: 
   - **READ `features.md` FIRST** to check for existing features
   - Read relevant memory files to understand context
2. **While working**: Consider if you're solving a problem that might recur
3. **After completing work**: 
   - Update `features.md` if adding new features
   - Update other memory files with new insights

### What to Remember

✅ **DO remember:**
- **New features added** to the codebase (update features.md)
- Solutions to tricky bugs that might recur
- Important architectural decisions and their rationale
- Code patterns that work well in this codebase
- Common mistakes to avoid
- Build/test/lint configurations and requirements
- Dependencies that are critical or problematic

❌ **DON'T remember:**
- Routine changes that are obvious
- Personal preferences without project-wide impact
- Temporary workarounds that should be fixed properly
- Information that's already in the main documentation

## Memory Update Guidelines

When updating memory files:

1. **Be Concise**: Keep entries brief and actionable
2. **Add Context**: Include "why" not just "what"
3. **Date Entries**: Add timestamps for time-sensitive information
4. **Stay Relevant**: Remove outdated information
5. **Be Specific**: Provide examples or references when helpful

## Example Entry

```markdown
### TypeScript Strict Mode (2026-01-10)

**Issue**: TypeScript strict mode causes issues with ReactFlow node types.

**Solution**: Use type assertions for ReactFlow nodes:
```typescript
const nodes = reactFlowNodes as Node<NodeData>[];
```

**Why**: ReactFlow's internal types don't align with our NodeData interface.

**Files Affected**: `web/src/stores/NodeStore.ts`, `web/src/components/node/*`
```

## Maintenance

Memory files should be reviewed and cleaned up periodically (every ~50 workflow runs) to:
- Remove outdated information
- Consolidate similar entries
- Update with new findings
- Keep files under 500 lines

### Automatic Compaction

Use the memory compaction script to automatically remove duplicates and old entries:

```bash
# See what would be compacted
python scripts/compact-memory.py --dry-run

# Compact the memory files
python scripts/compact-memory.py

# Compact with custom age limit (e.g., 90 days instead of default 180)
python scripts/compact-memory.py --max-age-days 90
```

**OpenCode workflows are instructed to run this script after updating memory files.**

The script:
- Removes duplicate entries (same content)
- Filters old entries (older than specified days)
- Cleans excessive whitespace
- Maintains proper formatting

### Manual Review

Periodically (every 2-3 months) manually review memory files to:
- Update information after major dependency upgrades
- Reorganize sections if needed
- Archive very old but still relevant information
- Verify accuracy of documented solutions
