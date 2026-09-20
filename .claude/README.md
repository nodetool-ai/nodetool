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
| `skills/` | Repository engineering skills, plus a symlink per NodeTool skill into `packages/system-skills/`. The `.agents` symlink exposes the same files to Codex. |
| `skills/<name>/agents/openai.yaml` | Codex's invocation policy, where a skill is typed rather than reached for. |

## Engineering skills

`skills/` also carries the engineering skills from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), vendored at
commit `8b36d4f` (license kept at `skills/LICENSE-mattpocock-skills`). They are adapted to NodeTool's repository rules and sit alongside its authoring skills.

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
| `/implement` | Build from a spec or tickets and verify against acceptance criteria. |
| `/wayfinder` | Map work too big for one session as decision tickets, resolved one at a time. |

The rest are model-invoked — Claude reaches for them when a task matches, and
you can also type them:

| Skill | What it does |
| :--- | :--- |
| `/tdd` | Red-green-refactor loop, one vertical slice at a time. |
| `/diagnosing-bugs` | Diagnosis loop for hard bugs and performance regressions. |
| `/code-review` | Review correctness, standards, and spec coverage, delegating when useful and available. |
| `/codebase-design` | Vocabulary for deep modules — small interfaces, clean seams. |
| `/domain-modeling` | Sharpen domain terms, update `CONTEXT.md` and ADRs. |
| `/prototype` | Throwaway prototype to answer a design question. |
| `/research` | Investigate against primary sources, capture cited findings in the repo. |
| `/resolving-merge-conflicts` | Work an in-progress merge or rebase hunk by hunk. |
| `/wizard` | Generate a bash wizard for steps only a human can perform. |

## NodeTool skills ship with the product

These cover the product surfaces rather than the engineering loop. Each one is
a **system skill**: the document lives in
[`packages/system-skills/<name>/SKILL.md`](../packages/system-skills/README.md),
every install loads it through `load_skill`, and `skills/<name>` here is a
symlink to it so the coding agent reads the same file. Edit the shipped copy.
All are model-invoked and typeable.

| Skill | Surface |
| :--- | :--- |
| `/storyboard-core` | Storyboards, entity casting, rendering, timeline assembly. Routes to `/ugc-video`, `/product-commercial`, `/script-video`, `/short-film`, `/video-clone`, `/launch-kit`, `/video-workflow` |
| `/nodetool-workflow-builder` | Workflow graphs, and the routing table for when a graph is the wrong document |
| `/nodetool-app-builder` | Mini apps: operations, widgets, bindings, variables, resources |
| `/nodetool-video-post` | Repairs on delivered footage, and the candidate review protocol |
| `/nodetool-js-scripting` | Code nodes, JS script documents, sandbox packs, calling nodes from code |
| `/nodetool-sketch` | Sketches (image documents): layers, placed images, briefs |
| `/nodetool-3d-scene` | glTF models: objects, transforms, lights, Blender renders |
| `/godot-game` | A playable Godot game or a complete asset pack |
| `/nodetool-custom-node-developer` | New TypeScript node types and node packages |
| `/nodetool-troubleshooter` | A failing run, on whichever surface it belongs to |
| `/nodetool-api-reference` | REST, tRPC, WebSocket, MCP, OpenAI-compatible chat |
| `/nodetool-rag-indexing` | Ingestion, vector indexing, retrieval |
| `/nodetool-browser-agent` | Browser automation agents |
| `/nodetool-chat-cli` | Chat CLI sessions and Global Chat |
| `/nodetool-model-provider-config` | Providers, credentials, model selection |
| `/nodetool-deployment` | Servers and workers: Docker, SSH, Runpod, cloud |
| `/nodetool-skill-author` | Writing a user skill row or a shipped system skill |

The rest of the shipped set is not symlinked here, because it answers a
question this repository's coding agent does not ask: `motion-graphics` and the
motion craft skills, the board shapes, and the `*-prompting` model-line guides.
Load one with `load_skill` in the product, or read it under
[`packages/system-skills/`](../packages/system-skills/README.md).

Adding one: write `packages/system-skills/<name>/SKILL.md`, symlink it in here
if the coding agent wants it too, and run `npm run check:agents-docs`. A skill
ships as one document, so fold anything that would have been a `references/`
file into a `##` section. `/nodetool-skill-author` has the contract.

`/code-review` is a merge of upstream's skill and the old
`nodetool-code-review`, which it replaces: upstream's Standards and Spec axes
plus a Correctness axis carrying this repo's landmines (cross-package imports,
MsgPack framing, Zustand subscriptions, `ui_primitives`, packaged-Electron
paths, IPC security). It pairs with `unslop` for a full pre-merge pass.

Existing invocation metadata is preserved. Claude-specific frontmatter remains
in place. Review upstream updates against local adaptations instead of
replacing them wholesale.

## Codex reads the same skills

Codex scans `.agents/skills` at the repository root, and `.agents` is a symlink
to `.claude`, so both agents read one tree — including the NodeTool skills,
which are themselves symlinks into `packages/system-skills/`. Codex follows a
symlinked skill folder to its target, so the two hops resolve.

It needs `name` and `description` in the frontmatter and skips a skill missing
either. Everything else Claude Code puts there, Codex ignores — including
`disable-model-invocation: true`, which is why the nine typed-only skills each
carry Codex's own form of that rule:

```yaml
# skills/<name>/agents/openai.yaml
policy:
  allow_implicit_invocation: false
```

Without it Codex reaches for a skill the repository says to type. The two are
kept in step by `npm run check:agents-docs`, which also fails on a `.agents`
that stops pointing at `.claude` and on a skill Codex would silently skip. That
file also carries `interface` (display name, icon, colour) and `dependencies`
(MCP servers a skill needs); this repository sets neither.

## Maintaining skills

Use OpenAI's [prompting guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices)
and [skill authoring guidance](https://developers.openai.com/codex/skills#best-practices)
when updating these instructions.

Lead with the intended result and a precise trigger. Keep task-specific constraints
in the entrypoint and load substantial reference material only for the relevant
operation. Preserve tool contracts, user choices, and existing authorization.
User instructions take precedence over skill guidelines within the host's enforced
permissions. Examples do not add deliverables or checkpoints to another request.

Ask about consequential missing decisions, while continuing independent work.
Prepare a concrete result before requesting any needed approval. If a skill rule
causes a pause, link and quote that rule and explain the unresolved decision or
permission. Keep delegation optional when the host cannot provide it.

For code edits, follow [mandatory verification](../AGENTS.md#mandatory-post-change-verification).
For skill prose, validate frontmatter, reference links, and representative requests.
Test both intended triggers and nearby requests that should use another skill.
Check that a completed request ends with an artifact or evidenced result. Do not
infer improved task success from a smaller prompt alone.

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
