# Scripts Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Scripts**

## Usage

```bash
# From the repo root
npm run build            # Build all packages
npm run test             # Run the web, electron, and mobile tests
npm run test:packages    # Run the backend package tests
npm run test:affected    # Run only the suites that depend on changed code
                         # (scripts/test-affected.mjs; rules pinned by
                         #  scripts/__tests__/test-affected.test.mjs)
node scripts/ci-plan.mjs plan --base <sha>
                         # Which CI quality-gate legs a diff needs (same
                         # mapping; rules pinned by scripts/__tests__/ci-plan.test.mjs)
npm run crap -- --base origin/main --run-coverage --threshold 30
                         # CRAP scores for changed TypeScript functions
                         # (scripts/crap-score.mjs; rules pinned by
                         #  scripts/__tests__/crap-score.test.mjs)
npm run clean            # Remove build artifacts and dependencies
npm run clean:build      # Remove build artifacts only
./scripts/setup-agent-env.sh  # Prepare a fresh agent container (see Root AGENTS.md)
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
