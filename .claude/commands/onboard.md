---
description: Orient yourself in this repo — layout, entry points, and where the thing you are about to change lives
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Give a working orientation for someone about to change: **$ARGUMENTS**
(if that is empty, orient on the repo generally).

Read `CLAUDE.md` first — it is the source of truth for commands, architecture,
and pitfalls. Then find and report:

- **Which workspace owns this.** 55 packages under `packages/`, plus `web/`,
  `electron/`, `mobile/`. Name the specific one and its dependencies.
- **The entry point.** Where execution actually starts for this area —
  `packages/websocket/src/server.ts` for the API, `web/src/` for UI, a
  `BaseNode` subclass for node behavior.
- **The nearest existing example.** The closest analogous code already in the
  repo, so the change matches surrounding conventions instead of inventing new
  ones.
- **What to run to see it work.** The specific command — `./start.sh`, a
  targeted test file, `npm run dev:nodetool -- node run <type>`.
- **The pitfalls that apply here.** From `CLAUDE.md § Common Pitfalls`: the
  `dist/` decorator packages, MsgPack framing on the WebSocket, `ui_primitives`
  and design tokens for anything in `web/`, ESM `.js` import extensions.

Be concrete — cite `file:line`. Skip anything that does not bear on the change.
