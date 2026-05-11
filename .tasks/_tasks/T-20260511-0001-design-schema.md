---
id: T-20260511-0001
title: "Design plan/task frontmatter schema and state machines"
state: done
plan: P-2026-05-11-task-system
assignee: claude
dependencies: []
created: 2026-05-11T10:00:00Z
updated: 2026-05-11T11:30:00Z
estimate: 1h
tags: [design]
---
# Description

Specify the on-disk format: required and optional frontmatter fields,
ID conventions, file naming, body sections, and the task and plan
state machines (with allowed transitions).

# Acceptance criteria

- [x] Frontmatter schema documented in `.tasks/SCHEMA.md`
- [x] Task state machine defined (todo, in_progress, review, blocked, done, cancelled)
- [x] Plan state machine defined (draft, proposed, accepted, done, cancelled)
- [x] Conflict-avoidance invariants enumerated

# Notes

## 2026-05-11 — claude

Picked simple, append-only design. The hard constraint was "no merge
conflicts ever"; that drove the one-file-per-task rule and the no-
central-index rule.
