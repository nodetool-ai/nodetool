# DB schema & state machines

The DB lives at `.tasks/data.db`. Schema is in
[`.tasks/site/db/schema.ts`](site/db/schema.ts); the initial SQL is
in [`.tasks/site/db/migrations/0000_init.sql`](site/db/migrations/0000_init.sql).
Migrations run automatically the first time the DB is opened.

## Tables

```
plans                    one row per plan
  id          TEXT  PK         e.g. P-2026-05-11-task-system
  title       TEXT  NOT NULL
  state       TEXT  NOT NULL   see plan state machine
  owner       TEXT
  body        TEXT  default ''  free-form markdown
  tags        TEXT  default '[]'  JSON array
  created_at  INTEGER  ms epoch
  updated_at  INTEGER  ms epoch

tasks                    one row per task
  id          TEXT  PK         e.g. T-20260511-0001
  title       TEXT  NOT NULL
  state       TEXT  NOT NULL   see task state machine
  plan_id     TEXT  FK → plans.id ON DELETE CASCADE
  assignee    TEXT
  body        TEXT  default ''  free-form markdown
  estimate    TEXT
  tags        TEXT  default '[]'  JSON array
  created_at, updated_at

task_dependencies        many-to-many
  task_id        TEXT  FK → tasks.id  ON DELETE CASCADE
  depends_on_id  TEXT  FK → tasks.id  ON DELETE CASCADE
  PRIMARY KEY (task_id, depends_on_id)

task_notes               append-only activity log
  id          INTEGER  AUTOINC PK
  task_id     TEXT     FK → tasks.id  ON DELETE CASCADE
  author      TEXT     NOT NULL
  body        TEXT     NOT NULL
  created_at  INTEGER  ms epoch

acceptance_criteria      checkable items per task
  id          INTEGER  AUTOINC PK
  task_id     TEXT     FK → tasks.id  ON DELETE CASCADE
  text        TEXT     NOT NULL
  done        INTEGER  boolean (0/1)
  position    INTEGER  ordering within task
```

## ID format

- **Plans**: `P-YYYY-MM-DD-slug` (slug is auto-derived from the title on create)
- **Tasks**: `T-YYYYMMDD-NNNN` (NNNN is a per-day counter, assigned by the repo)

You can override the ID on creation, but the format is enforced by the
zod validator on the API.

## State machines

### Plans

```
draft ──▶ proposed ──▶ accepted ──▶ done
  │           │             │
  └───────────┴─────────────┴──▶ cancelled
```

A plan is considered "done" when every non-cancelled task is `done`.
The transition is **not** automatic — set it explicitly.

### Tasks

```
todo ──▶ in_progress ──▶ review ──▶ done
  │           │             │
  │           └─▶ blocked ──┘
  │           │
  └───────────┴─▶ cancelled
```

Allowed transitions (enforced by `repo.transitionTask`):

| From          | Allowed `→`                                 |
|---------------|---------------------------------------------|
| `todo`        | `in_progress`, `cancelled`                  |
| `in_progress` | `review`, `done`, `blocked`, `cancelled`    |
| `review`      | `in_progress`, `done`, `cancelled`          |
| `blocked`     | `in_progress`, `cancelled`                  |
| `done`        | (terminal — create a new task to reopen)    |
| `cancelled`   | (terminal)                                  |

Going to `in_progress` requires an `assignee`.
Going to `done` requires all acceptance criteria to be checked.

## REST surface

See [README.md](README.md#rest). Each route is a thin wrapper around a
function in [`lib/repo.ts`](site/lib/repo.ts); the CLI calls the same
functions directly.
