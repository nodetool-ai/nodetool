---
id: P-2026-05-11-task-system
title: "Markdown Task System for NodeTool"
state: accepted
owner: claude
created: 2026-05-11
updated: 2026-05-11
tags: [tooling, agents, meta]
---
# Goal

Give humans and AI agents a shared, conflict-free way to plan and execute
NodeTool development. Plans and tasks live as markdown files in this repo
so they version with the code, render to a static site, and never produce
merge conflicts when many agents work in parallel.

# Approach

- One file per plan (`.tasks/_plans/`), one file per task (`.tasks/_tasks/`).
- YAML frontmatter carries state, IDs, dependencies, ownership.
- Append-only Notes section per task, with date-stamped headings.
- A small CLI (`npm run task`) creates, transitions, and validates tasks.
- A Jekyll site renders the dashboard for humans (deployed to GitHub Pages).
- A CI workflow runs the validator on every PR touching `.tasks/`.

# Out of scope

- Real-time collaboration (use the dashboard + git, not a database).
- Replacing GitHub Issues for external bug reports.
- Cross-repo task tracking (this is for this repo).
- Time tracking / billing.
