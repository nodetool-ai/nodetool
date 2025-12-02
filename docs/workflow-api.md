---
layout: page
title: "Workflow API Guide"
---



NodeTool exposes workflow endpoints in two places:

- The **Editor API** (`nodetool serve`) uses `/api/workflows` for CRUD and query operations backing the local app.  
- The **Worker API** (`nodetool worker`) uses `/workflows` and `/workflows/{id}/run` for deployed workflow execution.

This page collects the basics from the project README. See [API Reference](api-reference.md#unified-endpoint-matrix) for
the canonical endpoint matrix and auth requirements. When `AUTH_PROVIDER` is `static` or `supabase`, include
`Authorization: Bearer <token>`; tokens are optional only in `local`/`none` modes.

## Loading Workflows

```javascript
const response = await fetch("http://localhost:8000/api/workflows/");
const workflows = await response.json();
```

## Running a Workflow

### HTTP API

```bash
curl -X POST "http://localhost:8000/api/workflows/<workflow_id>/run" \
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
  "http://localhost:8000/api/workflows/<workflow_id>/run",
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

const outputs = await response.json();
// outputs is an object with one property for each output node in the workflow
// the value is the output of the node, which can be a string, image, audio, etc.
```

## Streaming API

The streaming API provides real-time job updates. See the WebSocket runner in
[`workflow_runner/js/workflow-runner.js`](../workflow_runner/js/workflow-runner.js) for a complete example used by the
bundled runner UI (`../workflow_runner/index.html`). On deployed workers, use `/workflows/{id}/run/stream` for SSE
streaming; on the Editor API, prefer the WebSocket `/predict` endpoint for long-running jobs.

Updates include:

- `job_update` – overall job status
- `node_update` – status of a specific node
- `node_progress` – progress of a node

```javascript
const response = await fetch(
  "http://localhost:8000/api/workflows/<workflow_id>/run?stream=true",
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

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;

    const message = JSON.parse(line);
    switch (message.type) {
      case "job_update":
        console.log("Job status:", message.status);
        if (message.status === "completed") {
          console.log("Workflow completed:", message.result);
        }
        break;
      case "node_progress":
        console.log(
          "Node progress:",
          message.node_name,
          (message.progress / message.total) * 100
        );
        break;
      case "node_update":
        console.log(
          "Node update:",
          message.node_name,
          message.status,
          message.error
        );
        break;
    }
  }
}
```

## WebSocket API

The WebSocket API uses a binary protocol for efficiency and allows cancelling jobs. See
[`workflow_runner/js/workflow-runner.js`](../workflow_runner/js/workflow-runner.js) for a full client implementation.

```javascript
const socket = new WebSocket("ws://localhost:8000/predict");

const request = {
  type: "run_job_request",
  workflow_id: "YOUR_WORKFLOW_ID",
  params: {
    /* workflow parameters */
  },
};

// Run a workflow
socket.send(
  msgpack.encode({
    command: "run_job",
    data: request,
  })
);

// Handle messages from the server
socket.onmessage = async (event) => {
  const data = msgpack.decode(new Uint8Array(await event.data.arrayBuffer()));
  if (data.type === "job_update" && data.status === "completed") {
    console.log("Workflow completed:", data.result);
  } else if (data.type === "node_update") {
    console.log("Node update:", data.node_name, data.status, data.error);
  } else if (data.type === "node_progress") {
    console.log("Progress:", (data.progress / data.total) * 100);
  }
  // Handle other message types as needed
};

// Cancel a running job
socket.send(msgpack.encode({ command: "cancel_job" }));

// Get the status of the job
socket.send(msgpack.encode({ command: "get_status" }));
```

## API Demo

- Download the [HTML file](../api-demo.html)
- Open it in a browser locally.
- Select the endpoint (local or `api.nodetool.ai` for alpha users).
- Enter an API token from the NodeTool settings dialog.
- Select a workflow and run it.
