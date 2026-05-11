# NodeTool Tasks

SQLite-backed task system for NodeTool development. The Next.js server
at `.tasks/site/` owns the database; the same code is reused by API
routes, the dashboard pages, and the `npm run task` CLI.

- **[SCHEMA.md](SCHEMA.md)** — DB schema, state machines, REST surface
- **[AGENTS.md](AGENTS.md)** — workflow contract for humans and agents

## Run

```bash
cd .tasks/site
npm install
npm run db:seed    # demo plan + tasks (idempotent)
npm run dev        # http://localhost:3000
```

The SQLite file lives at `.tasks/data.db` (gitignored). Override with
`NODETOOL_TASKS_DB=/path/to/db`.

By default the dev server is open — anyone with network access can
mutate state and start agent runs. To gate it, set
`NODETOOL_TASKS_TOKEN=<secret>`: every HTTP route then requires a
matching `Authorization: Bearer <token>` header (CLI clients) or
session cookie (web users sign in at `/login`). The CLI talks to the
DB directly, so the gate doesn't apply there.

## CLI

`npm run task -- <cmd>` from the repo root:

```bash
npm run task -- list                                          # all tasks
npm run task -- list --state=todo
npm run task -- plans                                         # list plans
npm run task -- show T-20260511-0001                          # task detail
npm run task -- show P-2026-05-11-task-system                 # plan detail

npm run task -- new plan --title="Streaming exec"             # → P-2026-MM-DD-streaming-exec
npm run task -- new task --plan=P-... --title="Wire up SSE" \
    --assignee=claude --tags=backend,ssr \
    --criteria="endpoint returns 200,sse frames flush"

npm run task -- transition T-... in_progress --assignee=claude
npm run task -- transition T-... review
npm run task -- transition T-... done                         # gated by open criteria

npm run task -- note T-... --body="implementation choice X" --author=alice
npm run task -- crit add T-... --text="latency p95 < 50ms"
npm run task -- crit done <criterion-id>
```

The CLI imports `lib/repo.ts` directly — no HTTP server required.

## REST

Same operations are exposed for external clients (e.g. agents):

```
GET    /api/plans
POST   /api/plans
GET    /api/plans/:id              # → plan + tasks + progress
PATCH  /api/plans/:id
DELETE /api/plans/:id

GET    /api/tasks?state=todo&plan=P-...
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/transition   # { state, assignee?, note? }
POST   /api/tasks/:id/notes        # { author, body }
POST   /api/tasks/:id/criteria     # { text }
PATCH  /api/tasks/:id/criteria/:cid  # { done?, text? }
DELETE /api/tasks/:id/criteria/:cid

POST   /api/tasks/:id/sessions     # { model?, baseBranch? } — start agent
GET    /api/sessions[?active=true]
GET    /api/sessions/:id           # → session + full event log
GET    /api/sessions/:id/events    # SSE, ?since=<eventId> to resume
POST   /api/sessions/:id/cancel
```

## Agent sessions

Trigger an autonomous Claude Agent SDK run on any task — from the web
("Run agent" button on the task detail page), from REST, or from the CLI:

```bash
npm run task -- agent T-20260511-0001 [--model=claude-sonnet-4-5]
npm run task -- agent list
npm run task -- agent cancel <session-id>
```

Each session:

1. Creates a fresh git worktree at `.tasks/.worktrees/<sessionId>/` on a
   new branch `claude/agent-<sessionId>`
2. Transitions the task to `in_progress` (assignee `claude-agent`)
3. Runs the SDK with `permissionMode: "bypassPermissions"`, the task
   body and acceptance criteria as the prompt, and the worktree as cwd
4. Pushes the branch and opens a PR via `gh pr create`
5. Transitions the task to `review` (or `blocked` on failure) and adds
   a note linking the PR

Multiple sessions run in parallel. Live event stream is available at
`GET /api/sessions/[id]/events` (SSE) and rendered on
`/sessions/[id]`. Cancel via `POST /api/sessions/[id]/cancel`.

Requires:
- `ANTHROPIC_API_KEY` in env
- `gh` CLI installed and authenticated for PR creation
- A `main` branch on `origin` (override per-session via `baseBranch`)

## Tests

`npm test` from `.tasks/site` runs the Vitest suite against an
in-memory SQLite DB. Coverage focuses on `lib/repo.ts`: state
machine transitions, criteria gating, dependency validation,
sequential task-ID minting, plan progress.

## Tech

- **Next.js 15** (App Router, dynamic SSR)
- **Drizzle ORM** + **better-sqlite3** (WAL mode, FK enforcement)
- **Zod** request validation
- **Claude Agent SDK** for autonomous task execution
- **Vitest** for the repo-layer test suite
- **shadcn-style** UI (no Radix dep) + Tailwind v3 + Linear-style status glyphs
