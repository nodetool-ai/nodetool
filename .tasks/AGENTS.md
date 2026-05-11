# Agent contract for `.tasks/`

You (human or AI agent) are picking up work from this task system.
Read [SCHEMA.md](SCHEMA.md) first; this file describes the workflow.

## Picking up a task

1. Run `npm run task list -- --state=todo` (or open the dashboard).
2. Pick a task whose `dependencies` are all `done` and that no one else
   is working on (`assignee` empty, or coordinate with the listed
   assignee).
3. Set `state: in_progress` and `assignee: <your handle>`.
   Append a Notes entry. Use the CLI:
   ```bash
   npm run task transition T-20260511-0001 in_progress --assignee=claude
   ```
4. Commit just the task file. Suggested message:
   `tasks(T-20260511-0001): start — <title>`

## Doing the work

- Edit code as needed.
- Tick off `- [ ]` boxes in the **Acceptance criteria** section as
  you complete them.
- Add a Notes entry whenever you make a meaningful decision or discover
  something the next person should know.
- Never edit another task's file. If you discover new work, create a
  new task with `npm run task new`.

## Finishing

When all acceptance criteria are checked:

```bash
npm run task transition T-20260511-0001 review
# or, if you're skipping review:
npm run task transition T-20260511-0001 done
```

Open a PR. PR title format: `[T-20260511-0001] <task title>`.
The PR should include both the code changes **and** the task file
update in the same commit (or at least the same PR).

## If you get stuck

Set `state: blocked`, append a Notes entry explaining why and what's
needed to unblock. Drop your assignment unless you're actively
unblocking.

```bash
npm run task transition T-20260511-0001 blocked --note="Waiting on API spec from @alice"
```

## Don'ts

- Don't edit another task's file. Open a new task instead.
- Don't rewrite or delete prior Notes entries. Append only.
- Don't bundle multiple unrelated task updates in one commit.
- Don't change `id`, `created`, or `plan` after creation. If you need
  to re-home a task, cancel it and create a new one.
- Don't push state forward without earning it. `done` means the
  acceptance criteria genuinely pass.

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
