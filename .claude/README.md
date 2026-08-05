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
| `skills/` | 18 NodeTool skills (workflow building, custom nodes, API reference, deployment, troubleshooting) plus 18 general engineering skills — see below. Claude loads these on its own when a task matches. |

## Engineering skills

`skills/` also carries the engineering skills from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), vendored at
commit `8b36d4f` (license kept at `skills/LICENSE-mattpocock-skills`). They are
language- and repo-agnostic, so they sit alongside the NodeTool-specific ones
rather than replacing them.

Type these to invoke them (`disable-model-invocation: true` — Claude never
reaches for them on its own):

| Skill | What it does |
| :--- | :--- |
| `/ask-matt` | Router over the other user-invoked skills — asks which one fits. |
| `/setup-matt-pocock-skills` | One-time per-repo setup: issue tracker, triage labels, domain doc layout. |
| `/grill-with-docs` | Interview that sharpens a plan and writes `CONTEXT.md` and ADRs as it goes. |
| `/improve-codebase-architecture` | Scan for deepening opportunities, report them as HTML, grill through one. |
| `/triage` | Move issues through a state machine of triage roles. |
| `/to-spec` | Turn the conversation into a spec on the issue tracker. |
| `/to-tickets` | Break a plan into tracer-bullet tickets with blocking edges. |
| `/implement` | Build from a spec or tickets, driving `/tdd` and closing with `/code-review`. |
| `/wayfinder` | Map work too big for one session as decision tickets, resolved one at a time. |

The rest are model-invoked — Claude reaches for them when a task matches, and
you can also type them:

| Skill | What it does |
| :--- | :--- |
| `/tdd` | Red-green-refactor loop, one vertical slice at a time. |
| `/diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions. |
| `/code-review` | Three-axis review of a diff — correctness, standards, spec — as parallel sub-agents. |
| `/codebase-design` | Vocabulary for deep modules — small interfaces, clean seams. |
| `/domain-modeling` | Sharpen domain terms, update `CONTEXT.md` and ADRs. |
| `/prototype` | Throwaway prototype to answer a design question. |
| `/research` | Investigate against primary sources, capture cited findings in the repo. |
| `/resolving-merge-conflicts` | Work an in-progress merge or rebase hunk by hunk. |
| `/wizard` | Generate a bash wizard for steps only a human can perform. |

`/code-review` is a merge of upstream's skill and the old
`nodetool-code-review`, which it replaces: upstream's Standards and Spec axes
plus a Correctness axis carrying this repo's landmines (cross-package imports,
MsgPack framing, Zustand subscriptions, `ui_primitives`, packaged-Electron
paths, IPC security). It pairs with `unslop` for a full pre-merge pass.

The upstream skills also ship a Codex `agents/` directory per skill; those were
dropped on the way in, since this repo drives them through Claude Code. To
refresh them, re-copy from `skills/engineering/` upstream.

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
