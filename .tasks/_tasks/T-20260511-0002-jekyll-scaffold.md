---
id: T-20260511-0002
title: "Scaffold Jekyll site (config, layouts, dashboard, styles)"
state: done
plan: P-2026-05-11-task-system
assignee: claude
dependencies: [T-20260511-0001]
created: 2026-05-11T11:00:00Z
updated: 2026-05-11T12:30:00Z
estimate: 2h
tags: [frontend]
---
# Description

Build the Jekyll site that renders plans and tasks. Includes a Kanban
dashboard at `/`, individual pages for each plan and task, and a dark
theme matching NodeTool's aesthetic.

# Acceptance criteria

- [x] `_config.yml` defines `plans` and `tasks` collections
- [x] `_layouts/default.html`, `plan.html`, `task.html`
- [x] `index.md` renders Kanban + active plans
- [x] `_includes/task-card.html` partial
- [x] `assets/style.css` with dark theme
- [x] `Gemfile` with Jekyll 4.3
- [x] `.gitignore` for `_site/`, `vendor/`, `Gemfile.lock`

# Notes

## 2026-05-11 — claude

Used Jekyll's underscore-prefix convention (`_plans/`, `_tasks/`) for
collections. Considered overriding to non-underscore but the upstream
plugin support is messy and the convention is fine.
