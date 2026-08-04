---
layout: page
title: "Workflow API Guide"
description: "Create, query, and run NodeTool workflows over the Editor and Server REST APIs."
---



NodeTool exposes workflow REST endpoints under `/api/workflows` from a single server (`nodetool serve`):
`/api/workflows` for CRUD and query operations, and `POST /api/workflows/{id}/run` to run a workflow.

This page collects the basics from the project README. See [API Reference](api-reference.md) for
the canonical endpoint list and auth requirements. When `AUTH_PROVIDER` is `static` or `supabase`, include
`Authorization: Bearer <token>`; tokens are optional only in `local`/`none` modes.

## Loading Workflows

```javascript
const response = await fetch("http://localhost:7777/api/workflows/");
const workflows = await response.json();
```

## Running a Workflow

### HTTP API

```bash
curl -X POST "http://localhost:7777/api/workflows/<workflow_id>/run" \
-H "Authorization: Bearer YOUR_TOKEN" \
-H "Content-Type: application/json" \
-d '{
    "params": {
        "param_name": "param_value"
    }
}'
```

```javascript
const response = await fetch(
  "http://localhost:7777/api/workflows/<workflow_id>/run",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_TOKEN",
    },
    body: JSON.stringify({
      params: params,
    }),
  }
);

const body = await response.json();
// body has the shape:
// {
//   "job_id": "<uuid>",
//   "workflow_id": "<uuid>",
//   "status": "completed" | "cancelled" | "failed",
//   "outputs": { /* one property per output node, keyed by node name */ },
//   "error": null,
//   "message_count": 42,
//   "background": false
// }
// outputs values can be a string, image, audio, etc.
```

`POST /api/workflows/{id}/run` runs the workflow to completion and returns a
single JSON response — it does not stream. For real-time progress (job and node
updates, incremental output), run the workflow over the WebSocket endpoint
instead.

## Listing Names and Tools

Two lightweight `GET` routes answer "what workflows exist?" without paying for
full graphs. Both read the caller's own library, so both stay behind auth.

`GET /api/workflows/names` returns an id → name object for up to 1000 of the
caller's workflows. Use it to label a workflow id you already hold — a job
record, a saved reference — without fetching the workflow.

```bash
curl "http://localhost:7777/api/workflows/names" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{ "21fddc0c2c46458493287b151b790cc4": "Greeting" }
```

`GET /api/workflows/tools` returns only the workflows saved with
`run_mode: "tool"` — the ones an agent may call as a tool — reduced to what a
tool picker needs. `limit` defaults to 100 and is capped at 500.

```bash
curl "http://localhost:7777/api/workflows/tools?limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "workflows": [
    {
      "name": "Summarize",
      "tool_name": "summarize",
      "description": "Summarize a block of text"
    }
  ],
  "next": null
}
```

A workflow with a `tool_name` but no `run_mode: "tool"` does not appear here.

## Exporting a Workflow as DSL

`GET /api/workflows/{id}/dsl-export` returns the workflow's graph as TypeScript
DSL source with `content-type: text/plain; charset=utf-8` — the same source
`nodetool workflows export-dsl` writes. Use it to put a workflow under version
control, or to hand an agent an editable form of the graph.

```bash
curl "http://localhost:7777/api/workflows/<workflow_id>/dsl-export" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o workflow.ts
```

```typescript
import { constant, workflow } from "@nodetool-ai/dsl";

// 1 — nodetool.constant.String
const string = constant.string({
  value: "hi"
});

export const greetingWorkflow = workflow(string);
```

The route answers `404` unless the workflow is yours or marked
`access: "public"`, and `400` when the workflow has no graph or the graph
cannot be expressed as DSL.

## Public Workflows

A workflow saved with `access: "public"` is readable without a token. These two
routes and the example routes below are the only `/api/workflows` paths exempt
from auth — every other one serves the caller's private library, graph
included, so it stays behind a token.

```bash
# Every public workflow (limit defaults to 100, caps at 500)
curl "http://localhost:7777/api/workflows/public"

# One public workflow, full graph included
curl "http://localhost:7777/api/workflows/public/<workflow_id>"
```

Both return the normal workflow shape (`id`, `name`, `description`, `graph`,
`access`, …). Asking for a workflow that exists but is not public gets the same
`404` as one that does not exist:

```json
{ "detail": "Workflow not found" }
```

## Example Templates

The example workflows NodeTool ships are served from disk rather than the
database, so they need no token and exist on a fresh install.

```bash
curl "http://localhost:7777/api/workflows/examples"
curl "http://localhost:7777/api/workflows/examples/search?query=chat"
```

`search` filters the same list on `query` against each example's name,
description, and tags, case-insensitively; omitting `query` returns everything.
Both responses carry metadata only — `graph` comes back empty:

```json
{
  "workflows": [
    {
      "id": "A Boolean Constant.json",
      "name": "A Boolean Constant",
      "description": "The smallest possible graph, and a real one: …",
      "tags": ["example"],
      "package_name": "nodetool-base",
      "thumbnail": "A Boolean Constant.jpg",
      "thumbnail_url": "/api/workflows/examples/thumbnails/A%20Boolean%20Constant.jpg?v=a6dce6b4",
      "graph": { "nodes": [], "edges": [] }
    }
  ],
  "next": null
}
```

Fetch the image at the `thumbnail_url` the list hands back:

```bash
curl "http://localhost:7777/api/workflows/examples/thumbnails/A%20Boolean%20Constant.jpg" \
  -o thumb.jpg
```

Only `.jpg` and `.png` are served — any other extension is a `400` — and the
filename is reduced to its basename, so it cannot escape the examples assets
directory.

## WebSocket API

For real-time streaming and job control over WebSocket, see the dedicated
[WebSocket API](websocket-api.md) page. The reference client in
[`examples/workflow_runner/js/workflow-runner.js`](https://github.com/nodetool-ai/nodetool/blob/main/examples/workflow_runner/js/workflow-runner.js)
shows how to consume `job_update`, `node_update`, and `node_progress` messages.

## API Demo

- Grab the [example runner](https://github.com/nodetool-ai/nodetool/tree/main/examples/workflow_runner) (`examples/workflow_runner`).
- Open `index.html` in a browser locally.
- Select the endpoint (local or `api.nodetool.ai` for alpha users).
- Enter an API token from the NodeTool settings dialog.
- Select a workflow and run it.
