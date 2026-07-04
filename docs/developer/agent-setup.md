---
layout: page
title: "Fast Setup for Agents & Dev Containers"
description: "Get NodeTool ready to build, test, and develop in one command — optimized for coding agents, Claude Code on the web, Codex, and fresh containers."
---

Get a fresh checkout ready to typecheck, lint, test, and run the dev servers —
in one command, optimized to skip work on a warm container.

This page is for **coding agents and ephemeral dev containers** (Claude Code on
the web, Codex, CI sandboxes). If you're a human installing the desktop app, see
[Install](../installation.md) instead.

---

## TL;DR

```bash
bash scripts/agent-setup.sh
```

That installs dependencies and builds the backend packages. After it finishes:

```bash
npm run check      # typecheck + lint + tests (the full gate)
npm run dev        # backend + web dev servers
```

On Claude Code on the web this runs automatically — see [Automatic setup](#automatic-setup-on-the-web).

---

## What "ready" means here

Two steps stand between a fresh clone and a working tree:

1. **`npm install`** — installs the root workspaces (`packages`, `web`,
   `electron`). `mobile/` is a separate npm project and is installed on its own.
2. **`npm run build:packages`** — **required**, not optional. `base-nodes`,
   `node-sdk`, `fal-nodes`, `replicate-nodes`, and `elevenlabs-nodes` use
   decorators and load from `dist/`. Until they're built, `npm run dev` and the
   package test suites fail with confusing import errors.

`scripts/agent-setup.sh` does both. It assumes Node.js is already present (it is,
in every target environment) and does **not** install a system toolchain — for
that heavier path see [Full bootstrap](#full-bootstrap-setup-codexsh).

---

## Fast by design

The script is idempotent and optimized so re-runs cost seconds, not minutes:

- **Skips `npm install` when the tree is warm.** If `node_modules` already
  matches `package-lock.json`, it skips the install entirely. Reinstalling on a
  warm tree re-triggers native rebuilds (`better-sqlite3`, `keytar`) that are
  slow and can fail on a flaky network — so skipping is both faster and safer.
- **Turbo-cached build.** `build:packages` is a cache hit when nothing changed,
  so a warm re-run finishes in ~1–2 s.
- **No network flakiness.** It skips optional GPU/CUDA, Electron, and Playwright
  browser downloads (Chromium is pre-provisioned in the web env; the e2e suite
  installs its own).

| Environment | First run | Warm re-run |
|---|---|---|
| Cold clone (install + build) | a few minutes | — |
| Warm container (nothing changed) | — | ~1–2 s |

### Options

```bash
FORCE_INSTALL=1 bash scripts/agent-setup.sh   # reinstall even if warm
SKIP_BUILD=1    bash scripts/agent-setup.sh   # install deps only
SKIP_MOBILE=1   bash scripts/agent-setup.sh   # skip the mobile npm project
VERBOSE=1       bash scripts/agent-setup.sh   # stream full npm/turbo output
```

---

## Automatic setup on the web

Claude Code on the web runs `.claude/hooks/session-start.sh` before your first
turn. The hook calls `scripts/agent-setup.sh`, so a fresh session starts with
dependencies installed and packages built — no manual step.

It runs **synchronously** (the session waits for it) so an agent never races an
unfinished install. Because the container disk is cached after the hook
completes, later sessions hit the warm path and start almost instantly.

To trade the first-run wait for a faster boot, switch the hook to async mode —
see the comment at the top of `.claude/hooks/session-start.sh`. Settings live in
`.claude/settings.json`. The hook is a no-op outside the remote environment (it
checks `CLAUDE_CODE_REMOTE`), so local checkouts are unaffected.

---

## The three gates

After setup, these are the checks CI enforces. Run them before committing:

```bash
npm run typecheck   # type check web, electron, mobile
npm run lint        # oxlint across packages/web/electron/mobile + design lint
npm run test        # web (Jest) + electron (Jest) + mobile tests
npm run check       # dependency checks + build + all three above
```

Narrow the loop while iterating:

```bash
npm run test --workspace=packages/<name>   # one backend package (Vitest)
cd web && npx jest path/to/file.test.ts    # one web test (Jest)
npm run dev:nodetool -- affected           # map changed files -> workspaces to rebuild/test
```

---

## Troubleshooting

**`turbo: not found` / `Cannot find module 'typescript'`** — `NODE_ENV=production`
makes npm omit devDependencies. `unset NODE_ENV` and reinstall. `npm run
preflight` catches this before a build.

**`Package 'libsecret-1' not found` during `keytar` build** — `keytar` (used by
`packages/security`) builds from source when no prebuilt binary is fetched, and
that build needs `libsecret-1-dev`. `agent-setup.sh` installs it automatically
when `apt-get` is available; otherwise install it yourself
(`apt-get install -y libsecret-1-dev`).

**`NODE_MODULE_VERSION` mismatch** — a native module was built against the wrong
Node. Rebuild with `npm run rebuild:native`. Use the Node major pinned in
`.nvmrc` (`nvm use`) for parity with the packaged app.

**A decorator node isn't found / stale** — rebuild the backend packages:
`npm run build:packages`.

See [Troubleshooting](../troubleshooting.md) for runtime and workflow issues.

---

## Full bootstrap (`setup-codex.sh`)

When Node.js, system libraries, or a Python worker env are **not** already
present (a bare Linux container), use the heavier bootstrap instead:

```bash
bash scripts/setup-codex.sh
```

It installs apt build dependencies, ensures Node via nvm, installs all npm
dependencies, optionally prepares the Python worker env, and compiles every
workspace. It's idempotent but slow — reach for `agent-setup.sh` when the base
tools are already there (the usual case for agents).
