# Documentation Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Documentation**

## Build & Preview

```bash
cd docs
bundle install            # Install Ruby dependencies (first time)
bundle exec jekyll serve  # Local preview at http://localhost:4000
bundle exec jekyll build  # Production build (output: _site/)
```

## Writing Rules

- All markdown files must include front matter (`title`, `description`, `layout`).
- Use proper heading hierarchy (h1 → h2 → h3, no skipping).
- Use fenced code blocks with language specifiers (```python, ```typescript, ```bash).
- Provide copy-paste-ready, working code examples with imports.
- Use descriptive link text — never use "click here".
- Provide alt text for all images.

## Structure

- `getting-started.md`, `installation.md` — User onboarding
- `workflows/` — Workflow example documentation
- `developer/` — Developer guides (node examples, patterns, API)
- `api.md`, `api-reference.md` — API documentation
- `_layouts/`, `_includes/` — Jekyll templates

## Adding Documentation

1. Create markdown file in the appropriate directory.
2. Add front matter: `title`, `description`, `layout: default`.
3. Add link to sidebar navigation.
4. Verify code examples work.
5. Check all links are valid.
