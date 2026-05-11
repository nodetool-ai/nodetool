-- 0000_init: initial schema for tasks DB
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  owner TEXT,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX plans_state_idx ON plans(state);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'todo',
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  assignee TEXT,
  body TEXT NOT NULL DEFAULT '',
  estimate TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX tasks_plan_idx ON tasks(plan_id);
CREATE INDEX tasks_state_idx ON tasks(state);
CREATE INDEX tasks_assignee_idx ON tasks(assignee);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id)
);
CREATE INDEX task_deps_depends_idx ON task_dependencies(depends_on_id);

CREATE TABLE task_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX task_notes_task_idx ON task_notes(task_id);

CREATE TABLE acceptance_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE INDEX ac_task_idx ON acceptance_criteria(task_id);
