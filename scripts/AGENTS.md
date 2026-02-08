# Scripts Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Scripts**

## Usage

```bash
# Use Make targets when possible (from repo root)
make build            # Build all packages
make test             # Run all tests
make clean            # Remove build artifacts and dependencies
make clean-build      # Remove build artifacts only
```

## Rules for Build Scripts

- Start bash scripts with `#!/bin/bash` and `set -e` (exit on error).
- Start Python scripts with `#!/usr/bin/env python3`.
- Always validate prerequisites before running (check for required tools).
- Provide meaningful error messages on failure.
- Use `trap` for cleanup in bash scripts.
- Make scripts idempotent — safe to run multiple times.
- Detect CI environment via `$CI` variable and adjust behavior accordingly.
- Use platform detection (`uname -s`) for cross-platform scripts.

## Environment Variables

- `NODE_ENV` — Build environment (`development` / `production`)
- `CI` — CI environment indicator
- `SKIP_TESTS` — Skip test execution
- `VERBOSE` — Enable verbose logging
