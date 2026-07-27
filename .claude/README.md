# Claude starter kit

Everything here exists so a fresh session can build, run, and verify NodeTool
without being told how.

## What's in it

| Path | What it does |
| :--- | :--- |
| `hooks/session-start.sh` | Installs dependencies when a Claude Code **web** session starts, using the flags that survive sandboxed/proxied containers. No-ops locally and on repeat runs. |
| `settings.json` | Registers the hook. |
| `commands/serve.md` | `/serve` — start the API on :7777 in the background and poll until it answers. |
| `commands/verify.md` | `/verify` — typecheck, lint, test, and fix what breaks. |
| `commands/onboard.md` | `/onboard <area>` — locate the owning workspace, entry point, nearest example, and the pitfalls that apply. |
| `skills/` | 18 NodeTool skills (workflow building, custom nodes, API reference, deployment, troubleshooting, code review). Claude loads these on its own when a task matches. |

## Running things

```bash
./start.sh          # API on :7777 — installs and builds on first run
./start.sh full     # API + web UI on :3000
./start.sh check    # typecheck + lint + test
./start.sh doctor   # what's set up, what isn't
```

`./start.sh` is the same path the hook prepares, so the first command in a
session works whether or not the hook ran.

## Why the hook is web-only

It guards on `CLAUDE_CODE_REMOTE=true`. Web sessions get a fresh container each
time and would otherwise start with no `node_modules`; your local checkout
already has one and shouldn't pay an install check on every session.

To make it run locally too, drop the guard at the top of `session-start.sh`.

## Changing it

The hook runs synchronously — the session waits for the install to finish, so
Claude never starts a test run against a half-installed tree. For a faster
session start at the cost of that guarantee, emit
`{"async": true, "asyncTimeout": 600000}` as the script's first line of stdout.
