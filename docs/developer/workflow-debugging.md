---
layout: page
title: "Debugging Workflows from Code"
description: "Inspect workflow JSON, read server logs, and use the validate, debug, and node run commands to debug a workflow outside the editor."
---

This page covers debugging with files and the command line. For debugging in the editor, see [Workflow Debugging](../workflow-debugging.md).

---

## Inspecting Workflow JSON

### Export the JSON

Open the **⋮** menu in the document bar and choose **Download JSON**. The command menu (`Ctrl/⌘ + K`) has **Download Workflow as JSON** and **Copy Workflow as JSON**.

### Structure

The file is the workflow with its graph under `graph`. Download JSON blanks the `id`. This trimmed example leaves out several fields, such as `access`, `tags`, and `settings`:

```json
{
  "id": "",
  "name": "My Workflow",
  "description": "...",
  "graph": {
    "nodes": [
      {
        "id": "node_1",
        "type": "nodetool.input.StringInput",
        "data": { "name": "text", "value": "Hello world" },
        "ui_properties": { "position": { "x": 100, "y": 100 }, "width": 280 }
      },
      {
        "id": "node_2",
        "type": "nodetool.agents.Agent",
        "data": { "prompt": "..." },
        "ui_properties": { "position": { "x": 400, "y": 100 }, "width": 280 }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "sourceHandle": "output",
        "target": "node_2",
        "targetHandle": "prompt",
        "edge_type": "data"
      }
    ]
  }
}
```

Properties fed by a connection are left out of a node's `data`, because the edge supplies the value. `ui_properties` also holds the title, color, size, and a `bypassed` flag for disabled nodes.

### What to look for

- Missing connections: check that `edges` connect outputs to inputs.
- Incorrect values: check `data` for each node. A node with `"bypassed": true` in `ui_properties` is disabled.
- Wrong `type`, which happens in programmatic workflows.
- Overlapping or off-canvas nodes: check `ui_properties.position`.

### Compare two versions

Export both versions as JSON, then diff them:

```bash
diff working_workflow.json broken_workflow.json
```

---

## Server logs

When you run NodeTool from the command line, `nodetool serve` accepts only `--host` and `--port`. The log level comes from the environment: `NODETOOL_LOG_LEVEL`, then `LOG_LEVEL`, with `info` as the default. Valid levels are `debug`, `info`, `warn`, and `error`. Logs go to stderr unless `NODETOOL_LOG_FILE` names a file.

```bash
# Debug logging
NODETOOL_LOG_LEVEL=debug nodetool serve

# Write the log to a file instead of stderr
NODETOOL_LOG_FILE=/tmp/nodetool.log nodetool serve
```

To record timing, token use, and cost for each step of a run, add `--trace-file <path>` (JSONL) or `--trace-stdout` (`pretty` or `json`) to a CLI command. See [CLI](../cli.md).

For GPU problems with image generation, run `nvidia-smi` to check that the GPU is visible and has free memory.

---

## Command-line debugging

Three `nodetool` commands debug without the editor. See the [CLI reference](../cli.md) for all options.

| Command | Use |
|---------|-----|
| `nodetool validate <workflow_id_or_file>` | Static check in under a second: unknown node types, missing required properties, dangling or mis-typed edges, bad model references. Run it before an expensive run. |
| `nodetool debug <workflow_id_or_file>` | Run the workflow and write a bundle with every message, log line, node input and output, and error, plus a verdict. Add `--trace` for timing and cost, `--watch` to re-run a file on save. |
| `nodetool node run <node_type> --props '{...}'` | Run one node in isolation with no workflow. |

To deliver one event to a trigger node without arming it, use `nodetool workflows run` with `--trigger-event`.
