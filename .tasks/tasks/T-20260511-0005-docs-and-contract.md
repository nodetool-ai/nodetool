---
id: T-20260511-0005
title: "Write SCHEMA, AGENTS, and README for the task system"
state: done
plan: P-2026-05-11-task-system
assignee: claude
dependencies: [T-20260511-0001]
created: 2026-05-11T12:00:00Z
updated: 2026-05-11T13:15:00Z
estimate: 1h
tags: [docs]
---
# Description

Document the schema (so the linter has a spec to match), the agent
contract (so humans and AI agents pick up tasks the same way), and
a top-level README so someone landing in `.tasks/` understands the
system in 30 seconds.

# Acceptance criteria

- [x] `SCHEMA.md` with frontmatter fields, state machines, transition table
- [x] `AGENTS.md` with picking-up, doing, finishing, getting-stuck flow
- [x] `README.md` with quick-start commands and rationale

# Notes

## 2026-05-11 — claude

Kept SCHEMA prescriptive (it's enforced by the linter) and AGENTS
descriptive (a contract, not an algorithm). The README links to both.
