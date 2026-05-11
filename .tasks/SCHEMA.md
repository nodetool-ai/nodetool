# Task & Plan Schema

This document is the source of truth for the markdown task system. The
linter (`scripts/tasks.mjs`) enforces it.

## File layout

```
.tasks/
├── plans/                              # Data: one markdown file per plan
│   └── 2026-05-11-feature-slug.md
├── tasks/                              # Data: one markdown file per task
│   └── T-20260511-0001-task-slug.md
├── site/                               # Next.js + shadcn dashboard (Linear-style)
├── SCHEMA.md                           # This file
├── AGENTS.md                           # Agent workflow contract
└── README.md
```

One file = one plan or task. Never edit two task files in the same commit.

## File naming

- **Plan**: `plans/YYYY-MM-DD-slug.md`. Slug is lowercase kebab-case.
- **Task**: `tasks/T-YYYYMMDD-NNNN-slug.md`. `NNNN` is a per-day counter,
  zero-padded to 4 digits. The CLI auto-assigns the next free counter.

## Plan frontmatter

```yaml
---
id: P-2026-05-11-task-system    # P-<created-date>-<slug>
title: "Markdown Task System"   # required, 1 line
state: accepted                 # required: draft|proposed|accepted|done|cancelled
owner: alice                    # optional, free-text handle
created: 2026-05-11             # required, YYYY-MM-DD
updated: 2026-05-11             # optional, YYYY-MM-DD
tags: [tooling, agents]         # optional list of strings
---
```

### Plan state machine

```
draft  ──▶ proposed ──▶ accepted ──▶ done
  │           │             │
  └───────────┴─────────────┴──▶ cancelled
```

A plan is `done` when every task it owns is `done` or `cancelled`.

## Task frontmatter

```yaml
---
id: T-20260511-0001                      # T-<YYYYMMDD>-<NNNN>
title: "Design task file format"         # required, 1 line
state: in_progress                       # required: see state machine below
plan: P-2026-05-11-task-system           # required, must match an existing plan id
assignee: claude                         # required for non-todo states; free-text handle
dependencies: []                         # optional list of task ids that must be `done` first
created: 2026-05-11T10:00:00Z            # required, ISO 8601
updated: 2026-05-11T11:30:00Z            # required, ISO 8601 — bump on every edit
estimate: 2h                             # optional, free-text
tags: [design]                           # optional list of strings
---
```

### Task state machine

```
todo ──▶ in_progress ──▶ review ──▶ done
  │           │             │
  │           └─▶ blocked ──┘
  │           │
  └───────────┴─▶ cancelled
```

Allowed transitions (linter enforces):

| From          | Allowed `→`                                 |
|---------------|---------------------------------------------|
| `todo`        | `in_progress`, `cancelled`                  |
| `in_progress` | `review`, `done`, `blocked`, `cancelled`    |
| `review`      | `in_progress`, `done`, `cancelled`          |
| `blocked`     | `in_progress`, `cancelled`                  |
| `done`        | (terminal — reopen by creating a new task)  |
| `cancelled`   | (terminal)                                  |

Going to `in_progress` requires:
- `assignee` is set
- All `dependencies` are `done`

Going to `done` requires:
- All `- [ ]` checkboxes in the body are checked

## Task body structure

Required sections, in this order:

```markdown
# Description
What needs to happen, in plain prose.

# Acceptance criteria
- [ ] Concrete, testable statement
- [ ] Another one

# Notes
## YYYY-MM-DD — handle
Append-only log. New entries go at the bottom under a new date heading.
Never edit prior entries.
```

The linter checks that `# Description`, `# Acceptance criteria`, and `# Notes`
all exist as level-1 headings.

## Conflict-avoidance invariants

These are the rules that make merges trivial:

1. **One task per file**, one file per task.
2. **Filenames are globally unique** via the ID.
3. **No central index file.** The dashboard is generated from frontmatter.
4. **Append-only notes.** Date-stamped headings, never rewrite.
5. **Exclusive ownership.** Only `assignee` edits a task in-flight.
6. **Atomic commits.** A commit touches one task file (plus any code it owns).

If two PRs touch the same task file, the conflict is real and intentional —
two agents claimed the same work. The merger picks a winner; the loser
re-bases or picks a different task.
