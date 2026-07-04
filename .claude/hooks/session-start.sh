#!/bin/bash
# SessionStart hook: prepare the repo so tests, linters, and dev servers work
# from the first turn of a Claude Code on the web session.
#
# Runs synchronously (the session waits for it) so the agent never races an
# unfinished install. It's a thin wrapper around scripts/agent-setup.sh, which
# is idempotent — the container disk is cached after the first run, so later
# sessions finish in seconds.
#
# To trade the startup wait for faster session boot, switch to async mode: print
# '{"async": true, "asyncTimeout": 600000}' as the first line below. That starts
# the session while setup runs in the background (agents may then hit a brief
# window where deps aren't ready yet).
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment. Local checkouts
# manage their own setup; see scripts/agent-setup.sh / scripts/setup-codex.sh.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
bash scripts/agent-setup.sh
