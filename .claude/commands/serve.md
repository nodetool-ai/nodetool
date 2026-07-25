---
description: Start the NodeTool API server on :7777 in the background and verify it is up
allowed-tools: Bash, Read
---

Start the NodeTool backend and confirm it is actually serving.

1. Run `./start.sh` with `run_in_background: true`. First run installs
   dependencies and builds packages, which takes several minutes — that is
   expected, not a hang.
2. Poll `curl -s http://localhost:7777/health` until it responds (the server is
   ready when it returns without a connection error). Do not use `sleep` loops
   longer than needed.
3. Report the URL and whether node types registered. If startup fails, read the
   background output and diagnose — the usual causes are a missing
   `packages/base-nodes/dist` (run `npm run build:packages`) or a
   `NODE_MODULE_VERSION` mismatch (run `npm run rebuild:native`).

Leave the server running in the background when done.

$ARGUMENTS
