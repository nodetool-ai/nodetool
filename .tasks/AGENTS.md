# Agent contract for `.tasks/`

You (human or AI agent) are picking up work from this task system.
Read [SCHEMA.md](SCHEMA.md) first; this file describes the workflow.

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
