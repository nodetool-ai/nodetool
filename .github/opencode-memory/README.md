# OpenCode Long-Term Memory

This directory contains persistent knowledge for OpenCode workflows to avoid solving the same problems repeatedly.

## Files

**Primary files** (update these):
- `features.md` - Complete list of existing features (READ FIRST!)
- `common-issues.md` - Known issues and their solutions
- `project-context.md` - Recent changes and core architecture

**Reference files** (rarely updated):
- `build-test-lint.md` - Commands and quality requirements
- `tech-stack.md` - Technologies and versions
- `insights.md` - Architectural insights

## How to Use

### For OpenCode Workflows

1. **Before making changes**: 
   - **READ `features.md` FIRST** to check for existing features
   - Check `common-issues.md` for known solutions
   - Review `project-context.md` for recent changes

2. **After completing work**: 
   - Add ONE line to `features.md` if you added a user-facing feature
   - Add ONE entry to `common-issues.md` if you solved a tricky problem
   - Add ONE entry to `project-context.md` for significant changes

### Update Format

**features.md** - One line per feature:
```markdown
- **Feature Name**: Brief description (max 10 words)
```

**common-issues.md** - Concise problem/solution:
```markdown
### Issue Title
**Problem**: One sentence
**Solution**: One sentence or brief code snippet
```

**project-context.md** - Minimal change log:
```markdown
### Feature/Fix Name (YYYY-MM-DD)
**What**: One sentence
**Files**: Main files changed
```

## Keep It Concise

✅ **DO write:**
- One-line feature descriptions
- Brief problem/solution pairs
- Minimal change summaries

❌ **DON'T write:**
- Long explanations or rationale
- Implementation details
- Code examples (unless critical)
- Duplicate information

## Maintenance

The `scripts/compact-memory.py` script can remove duplicates and old entries:

```bash
python scripts/compact-memory.py --dry-run  # Preview changes
python scripts/compact-memory.py             # Clean up files
```
