---
layout: page
title: "Workflow API Guide"
description: "Create, query, and run NodeTool workflows over the Editor and Server REST APIs."
---



NodeTool exposes workflow REST endpoints under `/api/workflows` from a single server (`nodetool serve`):
`/api/workflows` for CRUD and query operations, and `POST /api/workflows/{id}/run` to run a workflow.

This page collects the basics from the project README. See [API Reference](api-reference.md) for
the canonical endpoint list and auth requirements. Send `Authorization: Bearer <token>` on every
request except the public routes noted below. A server in Local mode trusts loopback callers without a
token, and a server in Supabase mode requires one for everything else. See [Authentication](authentication.md).

## Loading Workflows

```javascript
const response = await fetch("http://localhost:7777/api/workflows/");
const { workflows, next } = await response.json();
```

`GET /api/workflows` lists the caller's workflows, full graphs included. Query
parameters:

| Parameter | Effect |
|---|---|
| `limit` | Page size. Defaults to 100 and caps at 500 |
| `cursor` | The `next` value from the previous page |
| `run_mode` | Only workflows saved with this run mode |
| `project_id` | Only workflows in this project |

`GET /api/workflows/{id}` returns one workflow. The caller must own it, hold a
collaborator grant, or find it marked `access: "public"`. Anything else is a `404`
with `{ "detail": "Workflow not found" }`.

## Creating, Updating, and Deleting

`POST /api/workflows` creates a workflow and returns it. `name` and a `graph` with
`nodes` and `edges` arrays are required, and a missing one is a `400`.

```bash
curl -X POST "http://localhost:7777/api/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Greeting",
    "description": "Says hi",
    "graph": { "nodes": [], "edges": [] },
    "access": "private"
  }'
```

Optional body fields are `description`, `tags`, `tool_name`, `package_name`,
`path`, `thumbnail`, `thumbnail_url`, `access` (`"public"` or anything else for
private), `settings`, `run_mode` (default `"workflow"`), `workspace_id`,
`project_id` (default `"default"`), `html_app`, and `app_doc`. A `project_id` the
caller does not own is refused.

To start from a shipped example, add `?from_example_name=<name>` and optionally
`&from_example_package=<package>` (default `nodetool-base`). When the body carries
no graph nodes, the example's graph and app UI are copied in.

`PUT /api/workflows/{id}` replaces the workflow's name, description, tags,
`tool_name`, `package_name`, and graph. It takes the same body, and `name` and `graph` are required again. Other
fields change only when the body includes them. The call creates the workflow under
that `id` when none exists. An owner or an editor collaborator may update, and only
the owner changes `access` and `project_id`. Saves are optimistic. Send
`expected_updated_at` with the `updated_at` you last read, and a stale value is a
`409`. An `expected_updated_at` for a workflow that does not exist is a `404`.

`DELETE /api/workflows/{id}` removes a workflow the caller owns, along with its
collaborator and share rows, and answers `204` with no body. It is a `404` for a
workflow the caller does not own.

Workflow responses carry the stored fields plus an `etag`.

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

The body is optional. Its fields:

| Field | Effect |
|---|---|
| `params` | Input values keyed by input node name |
| `background` | Return a receipt at once and keep running. The response has `status: "running"`, `background: true`, `job_id`, `id`, and a `poll` hint. Read the settled job and its outputs through the `jobs` tRPC procedures |
| `interactive` | Park on a failed node and hand the decision to the caller. See [Interactive Runs](api-reference.md#interactive-runs-answering-a-failed-node) |
| `max_decisions`, `max_retries_per_node`, `decision_timeout_ms` | Bounds for an interactive run |
| `project_id` | Must match the workflow's project, or the call is a `400` |
| `node_ids` | Run only these nodes and what they need upstream. See [Running Part of a Workflow](#running-part-of-a-workflow) |
| `reuse_results` | With `node_ids`: `false` runs every upstream node again instead of reusing saved generations. Default `true` |

`POST /api/workflows/{id}/debug` takes the same body. It returns a debug report
instead of the run summary: `job_id`, `workflow_id`, `status`, `outputs`, `error`,
a per-node `summary` (status, errors, logs, edges, LLM calls), and a `verdict`
with a `headline`. Use it when a caller needs to know what happened inside the run.

Failures before the run starts:

| Status | Meaning |
|---|---|
| `404` | The caller has no workflow with that id |
| `400` | The workflow's `run_mode` is not `"workflow"`, a provider the graph needs has no key (the detail names the secret), `project_id` names another project, `node_ids` is not a non-empty list of strings or names a node the graph does not have, or `reuse_results` is not a boolean |
| `429` | An interactive run was refused because the caller already holds the maximum of 8 live debug sessions |

### Running Part of a Workflow

`node_ids` is the API form of the editor's **Run Node** and **Run selected**.
The run executes the named nodes and the upstream nodes they need. Unrelated
branches and downstream nodes do not run and are not billed.

An upstream node that saves its generations, such as an image, video, audio or
LLM generator, does not run again when the workflow already has a generation of
it. Its saved output is fed to the node that consumes it. The node's pinned
generation (`selected_generation`) is used when the editor set one, otherwise
the newest. The named nodes themselves always run. Runs from the editor and
from this endpoint save these generations as assets.

The response carries `partial_run`:

```json
{
  "node_ids": ["caption"],
  "ran": ["caption"],
  "reused": [
    { "node_id": "image", "job_id": "<job that made it>", "asset_ids": ["<asset>"] }
  ]
}
```

Agents pass the same `node_ids` and `reuse_results` to the `run_workflow`,
`debug_workflow` and `start_background_job` tools.

A node that fails during the run does not change the HTTP status. The response
is `200` with `status: "failed"` and an `error` string.

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
