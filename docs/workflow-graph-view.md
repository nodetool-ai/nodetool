---
layout: page
title: "Workflow Graph View"
description: "Read-only visualization of a NodeTool workflow."
---

The **Workflow Graph View** is a read-only rendering of a saved workflow. It's useful for sharing a visual snapshot, embedding workflow diagrams in documentation, and giving stakeholders a look without handing them the editor.

![Workflow Graph View](assets/screenshots/screenshot-placeholder.svg)

---

## Opening the View

The graph view lives at `/graph/:workflowId`. You can link directly to it from the workflow's **Share** menu, or paste the URL into a Markdown file — Jekyll will render the image when the page is exported statically.

Unlike the [Workflow Editor]({{ '/workflow-editor' | relative_url }}), the graph view:

- Does **not** load the Node Menu, Inspector, or the panel drawers.
- Does **not** allow editing — nodes can't be added, moved, or deleted.
- Does **not** require authentication on localhost deployments.

This makes it lightweight (~5× smaller bundle) and safe to expose behind a read-only proxy.

---

## Interactions

The graph view supports the read-only subset of the editor:

| Action | How |
|--------|-----|
| Pan | Click-and-drag the canvas |
| Zoom | `Ctrl/⌘` + scroll |
| Fit view | Press `F` |
| Hover a node | See its name and status |
| Click a node | Open its read-only property panel |
| Copy share link | Use the browser URL |

Running the workflow is not possible from this view — users must open it in the editor first.

---

## Embedding in Docs

You can embed the graph view inside another page with an iframe:

```html
<iframe
  src="https://your-nodetool-host/graph/WORKFLOW_ID"
  width="100%"
  height="540"
  loading="lazy"
  referrerpolicy="no-referrer">
</iframe>
```

For stored Markdown docs, take a screenshot instead so the graph is captured even when the server is offline.

---

## Exporting a Graph Image

From the read-only view, press `Shift+E` to download a PNG of the current viewport, or use the **Export** button in the header. The image includes the workflow title, so it's ready for blog posts and slides.

---

## Access Control

The graph view inherits the workflow's own visibility:

- **Private** — requires the user to be signed in with access to the workflow.
- **Shared** — accessible to anyone with the link.
- **Public** — indexed and crawlable.

For localhost deployments, all workflows are effectively local and the view is open to anyone who can reach your server.

---

## Next Steps

- [Workflow Editor]({{ '/workflow-editor' | relative_url }}) — the full editor where you author workflows
- [Chain Editor]({{ '/chain-editor' | relative_url }}) — the linear alternative
- [Authentication]({{ '/authentication' | relative_url }}) — how access is enforced
