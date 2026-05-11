# NodeTool Tasks

Markdown-native task system. Plans and tasks live as files in this
directory, versioned with the code. Designed so humans and AI agents
can work in parallel without merge conflicts.

- **[SCHEMA.md](SCHEMA.md)** — frontmatter schema and state machines
- **[AGENTS.md](AGENTS.md)** — workflow contract for humans and agents

## Quick start

```bash
# List all tasks
npm run task list

# Filter by state
npm run task list -- --state=todo

# Create a new plan
npm run task new plan --title="Add streaming workflow execution"

# Create a new task under a plan
npm run task new task --plan=P-2026-05-11-streaming --title="Wire up SSE endpoint"

# Move a task forward
npm run task transition T-20260511-0001 in_progress --assignee=claude
npm run task transition T-20260511-0001 review
npm run task transition T-20260511-0001 done

# Validate everything (frontmatter + state machine + structure)
npm run task validate
```

`npm run task validate` runs in CI on every PR touching `.tasks/`.

## Why one file per task?

So that two parallel PRs never touch the same file. Combined with
unique filenames (`T-YYYYMMDD-NNNN-slug.md`), append-only Notes,
and a generated dashboard (no central index), merges become a
non-event.

## Browse the dashboard

The site renders to `<your-pages-url>/tasks/`. Locally:

```bash
cd .tasks
bundle install
bundle exec jekyll serve
# open http://localhost:4000/tasks/
```

If you don't have Ruby installed, the markdown files are still fully
readable on GitHub.
