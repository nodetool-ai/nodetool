---
layout: page
title: "Templates Gallery"
description: "Browse ready-to-run example workflows and use them as starting points."
---

The **Templates Gallery** is a curated library of example workflows you can run and customize without starting from scratch. Open it from the **Templates** button in the app header or by navigating to `/templates`.

![Templates Grid](assets/screenshots/templates-grid.png)

---

## What's in the Gallery

Every template is a real, runnable workflow exported from the editor. Templates ship with NodeTool and cover:

| Category | Examples |
|----------|----------|
| **Image generation** | Movie Posters, Character Sheets, Product Shots |
| **Image editing** | Background Removal, Upscaling, Style Transfer |
| **Agents** | Research agents, RAG Q&A, multi-step tool runners |
| **Document intelligence** | Chat-with-Docs, PDF extraction, data enrichment |
| **Audio & video** | Transcription, summarization, text-to-speech |
| **Data pipelines** | CSV ingestion, chart generation, scheduled reports |
| **Realtime** | Voice agents, streaming transcription |

Browse the full list on the [Workflow Examples]({{ '/workflows/' | relative_url }}) page.

---

## Opening a Template

1. Click a template tile to preview its graph.
2. Hit **Open** (or double-click) to load it into the editor as a new workflow.
3. Save a copy with `Ctrl/⌘ + S` — edits never modify the original template.

![Template Preview](assets/screenshots/screenshot-placeholder.svg)

---

## Filtering and Searching

The gallery supports:

- **Tag filter** — click any tag (e.g., "agent", "image") to narrow the list.
- **Search bar** — match by title, tags, or node names used inside the workflow.
- **Sort** — recently added, most popular, shortest.

![Template Filters](assets/screenshots/screenshot-placeholder.svg)

---

## Anatomy of a Template Card

Each tile shows:

- **Thumbnail** — a static render of the graph.
- **Title and description** — a one-line summary.
- **Input badges** — the required inputs (e.g., "Text", "Image").
- **Output badges** — what the workflow produces.
- **Required models** — any models you need downloaded first.

If a template requires a model you don't have, opening it shows the **Recommended Models** dialog so you can install them in one click.

![Recommended Models from Template](assets/screenshots/screenshot-placeholder.svg)

---

## Submitting Your Own Template

Community templates ship through the `examples/` directory of the NodeTool repo:

1. Save your workflow, then use `nodetool workflows export-dsl <id>` to export it as a TypeScript DSL file.
2. Add it to `examples/<category>/<slug>.ts` in a PR.
3. Include a short README — 1 paragraph, 1 screenshot of the graph.

See the [Developer Guide]({{ '/developer/' | relative_url }}) for full contribution guidelines.

---

## Related Docs

- [Workflow Examples]({{ '/workflows/' | relative_url }}) — in-depth walkthroughs of individual templates
- [Cookbook]({{ '/cookbook' | relative_url }}) — reusable workflow patterns
- [Getting Started]({{ '/getting-started' | relative_url }}) — runs a template as your first workflow
