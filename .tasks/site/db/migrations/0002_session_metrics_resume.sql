-- 0002_session_metrics_resume:
--  - token + cost columns on agent_sessions
--  - sdk_session_id for resumption
--  - resume_of points at the prior session this one continues from

ALTER TABLE agent_sessions ADD COLUMN total_cost_usd REAL;
ALTER TABLE agent_sessions ADD COLUMN input_tokens INTEGER;
ALTER TABLE agent_sessions ADD COLUMN output_tokens INTEGER;
ALTER TABLE agent_sessions ADD COLUMN sdk_session_id TEXT;
ALTER TABLE agent_sessions ADD COLUMN resume_of INTEGER REFERENCES agent_sessions(id);
