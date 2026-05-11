-- 0001_agent_sessions: agent runs against tasks

CREATE TABLE IF NOT EXISTS agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  model TEXT,
  branch TEXT,
  worktree_path TEXT,
  pr_url TEXT,
  error TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS agent_sessions_task_idx ON agent_sessions(task_id);
CREATE INDEX IF NOT EXISTS agent_sessions_status_idx ON agent_sessions(status);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX IF NOT EXISTS agent_events_session_idx ON agent_events(session_id);
CREATE INDEX IF NOT EXISTS agent_events_created_idx ON agent_events(created_at);
