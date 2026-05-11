# Agent contract for `.tasks/`

You (human or AI agent) are picking up work from this task system.
Read [SCHEMA.md](SCHEMA.md) first; this file describes the workflow.

## Two ways to do a task

1. **Yourself.** Claim it, code it, transition it. The flow below.
2. **Delegate to a Claude Agent SDK session.** Hit the "Run agent"
   button on the task page or `npm run task -- agent <T-...>`. The
   orchestrator opens a worktree, runs the agent, pushes the branch,
   opens a PR, and moves the task to `review`. Skip the rest of this
   doc unless you need to babysit a failed session.

## Picking up a task

1. `npm run task -- list --state=todo`
2. Pick a task whose dependencies are all `done`.
3. Claim it:
   ```bash
   npm run task -- transition T-20260511-0001 in_progress --assignee=<you>
   ```

## Doing the work

- Edit code as needed.
- As you complete acceptance criteria, tick them off (web UI is the
  easiest — single click), or:
  ```bash
  npm run task -- crit done <criterion-id>
  ```
- Add notes whenever you make a meaningful decision:
  ```bash
  npm run task -- note T-20260511-0001 --body="picked WAL mode for concurrent reads"
  ```
- Discover new work? Create a new task:
  ```bash
  npm run task -- new task --plan=P-... --title="..."
  ```

## Finishing

```bash
npm run task -- transition T-20260511-0001 review    # if reviewed by someone
npm run task -- transition T-20260511-0001 done      # gated by open criteria
```

`done` will be rejected if any acceptance criterion is still open —
finish those first.

## If you get stuck

```bash
npm run task -- transition T-20260511-0001 blocked \
  --note="Waiting on API spec from @alice"
```

Then pick a different task.

## Delegating to a Claude Agent session

Each session runs in an isolated git worktree on a fresh branch,
opens a PR via `gh pr create` when finished, and transitions the
task to `review` (or `blocked` on failure). Multiple sessions can
run in parallel against different tasks.

```bash
npm run task -- agent T-20260511-0001                 # start + tail
npm run task -- agent T-20260511-0001 --no-follow     # detach
npm run task -- agent T-20260511-0001 --model=claude-opus-4-7
npm run task -- agent list                            # all runs
npm run task -- agent cancel <session-id>             # abort
```

REST: `POST /api/tasks/:id/sessions`. SSE log:
`GET /api/sessions/:id/events`. Web: "Run agent" button on the
task detail page → live log at `/sessions/:id`.

A task can only have one active session at a time — start another
after cancelling or letting the current one finish. To pick up
where a failed run left off, use the Resume button (or `agent
resume <id>`): the new session passes the prior SDK session id to
`query()` so the model has its prior conversation in context.

Requires `ANTHROPIC_API_KEY` and an authed `gh` CLI.

While running, the agent can call back into the task system via
five MCP tools — see [README.md](README.md) for the list. Use them
as you work; don't batch.

## Don'ts

- Don't bypass the state machine. The server enforces transitions; the
  CLI just relays calls.
- Don't delete notes. Notes are append-only by convention (no delete
  endpoint).
- Don't change `id`, `created_at`, or `plan_id`. If you need to re-home
  a task, cancel it and create a new one.
- Don't mark `done` without genuinely meeting the criteria.

## State cheat sheet

```
todo ──▶ in_progress ──▶ review ──▶ done
  │           │             │
  │           └─▶ blocked ──┘
  │           │
  └───────────┴─▶ cancelled
```

See [SCHEMA.md](SCHEMA.md) for the full transition table and field
requirements.
