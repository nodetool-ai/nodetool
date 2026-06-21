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
