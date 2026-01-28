# Scripts

Utility scripts used during development and release.

- `changelog.py` – generates the CHANGELOG from git history
- `release.py` – bumps version numbers and builds release artifacts
- `release/` – helper scripts invoked by CI during publishing
- `compact-memory.py` – compacts OpenCode memory files to prevent context bloat

These scripts are typically executed manually by maintainers.

## compact-memory.py

Compacts the OpenCode memory files in `.github/opencode-memory/` to keep them manageable and prevent context window bloating.

**Usage:**

```bash
# Dry run (see what would be changed)
python scripts/compact-memory.py --dry-run

# Compact memory files
python scripts/compact-memory.py

# Compact with custom age limit (remove entries older than 90 days)
python scripts/compact-memory.py --max-age-days 90

# Help
python scripts/compact-memory.py --help
```

**What it does:**

1. Removes duplicate entries (same content in different locations)
2. Filters out old entries (older than specified days, default 180)
3. Cleans up excessive whitespace
4. Maintains proper formatting

**When to run:**

- After updating memory files following OpenCode workflow completion
- Manually when memory files grow too large (>15KB)
- As part of scheduled maintenance

**OpenCode workflows automatically prompt to run this after updating memory files.**
