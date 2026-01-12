# Memory Compaction Guide

This document explains the memory compaction system for OpenCode workflows.

## Why Compaction?

OpenCode workflows read memory files to learn from past experiences. Without compaction, these files can:
- Grow too large, consuming context window space
- Contain duplicate entries
- Include outdated information
- Become harder to read and maintain

## The Compaction Script

Location: `scripts/compact-memory.py`

The script automatically:
1. **Removes duplicates** - Identifies and removes duplicate sections based on content similarity
2. **Filters old entries** - Removes entries older than a configurable age (default: 180 days)
3. **Cleans whitespace** - Removes excessive blank lines and formatting inconsistencies
4. **Maintains structure** - Preserves headers, sections, and proper markdown formatting

## Usage

### Basic Usage

```bash
# Preview changes without modifying files
python scripts/compact-memory.py --dry-run

# Compact memory files
python scripts/compact-memory.py
```

### Advanced Options

```bash
# Keep all entries regardless of age
python scripts/compact-memory.py --max-age-days 0

# Remove entries older than 90 days (more aggressive)
python scripts/compact-memory.py --max-age-days 90

# Custom memory directory
python scripts/compact-memory.py --memory-dir /path/to/memory

# Get help
python scripts/compact-memory.py --help
```

## When to Run

### Automatic (via OpenCode workflows)

All OpenCode workflows now instruct the AI to:
1. Update memory files after completing work
2. Run `python scripts/compact-memory.py` to compact them
3. Commit the compacted files along with other changes

### Manual

Run compaction manually when:
- Memory files exceed 15KB in size
- You notice duplicate entries
- After major refactoring or reorganization
- Every 2-3 months as routine maintenance

## Files Compacted

The script processes these files:
- `features.md` - Feature list (no age filtering, only duplicates)
- `common-issues.md` - Known issues with solutions (age filtered)
- `insights.md` - Important learnings (age filtered)
- `project-context.md` - Project architecture and patterns (age filtered)

It does **not** modify:
- `README.md` - System documentation
- `IMPLEMENTATION.md` - Implementation guide
- `build-test-lint.md` - Quality standards (rarely changes)
- `tech-stack.md` - Technology list (rarely changes)

## How It Works

### Duplicate Detection

The script:
1. Splits files into sections based on markdown headers
2. Normalizes content (removes dates, normalizes whitespace)
3. Generates content hashes
4. Keeps only the first occurrence of each unique content
5. Only considers substantial content (>50 characters) for deduplication

### Age Filtering

For files with dated entries:
1. Extracts dates from headers or content (format: YYYY-MM-DD)
2. Compares against cutoff date (now - max_age_days)
3. Removes entries older than cutoff
4. Preserves entries without dates (considered timeless)

### Whitespace Cleanup

- Removes excessive blank lines (3+ consecutive)
- Ensures consistent spacing between sections
- Guarantees single newline at end of file

## Safety Features

- **Dry-run mode** - Preview changes before applying
- **Conservative deduplication** - Only removes clear duplicates
- **Date preservation** - Keeps undated entries
- **Backup friendly** - Git tracks all changes
- **Validation** - Maintains proper markdown structure

## Example Output

```
OpenCode Memory Compactor
============================================================
Memory directory: /path/to/.github/opencode-memory
Max age: 180 days
Mode: LIVE

Processing features.md...
  No changes needed

Processing common-issues.md...
  Removed duplicate: TypeScript Type Assertions...
  Removed old entry (2025-06-15): React 17 Migration...
  Reduced size: 15243 → 12891 bytes (2352 bytes saved)
  ✓ Saved common-issues.md

Processing insights.md...
  Removed duplicate: Zustand Performance Tips...
  Reduced size: 13890 → 12456 bytes (1434 bytes saved)
  ✓ Saved insights.md

Processing project-context.md...
  No changes needed

============================================================
COMPACTION SUMMARY
============================================================
Files processed:      4
Duplicates removed:   2
Old entries removed:  1
Total bytes saved:    3,786

✓ Memory files compacted successfully
```

## Troubleshooting

### Script fails with "ModuleNotFoundError"

Make sure you're running from the repository root:
```bash
cd /path/to/nodetool
python scripts/compact-memory.py
```

### Too aggressive deduplication

The script is conservative by default. If you see false positives:
1. Review the dry-run output
2. Check if entries truly duplicate
3. Consider if content should be consolidated differently
4. Manually restore if needed (git revert)

### Old entries incorrectly removed

Check date format in entries. The script expects: `(YYYY-MM-DD)` format.

Example:
```markdown
### Feature Name (2026-01-12)
```

If dates are in other formats, they won't be filtered by age.

## Integration with OpenCode Workflows

All OpenCode workflows include these instructions:

```markdown
**After updating memory files, COMPACT THEM**:
```bash
python scripts/compact-memory.py
```
This removes duplicates and keeps memory files manageable. Commit the compacted files.
```

This ensures memory stays clean and efficient across all workflow runs.

## Best Practices

1. **Always use dry-run first** when running manually
2. **Review changes** before committing compacted files
3. **Commit compaction separately** if making other changes
4. **Run regularly** to prevent excessive growth
5. **Check git diff** to see what was removed
6. **Document major cleanups** in commit messages

## Future Enhancements

Potential improvements:
- Detect semantic duplicates (not just exact matches)
- Machine learning to identify outdated patterns
- Automatic triggering based on file size
- Summary reports of what was learned
- Integration with GitHub Actions

---

**Created**: 2026-01-12
**Last Updated**: 2026-01-12
