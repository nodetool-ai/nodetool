---
layout: page
title: "Workflow Debugging Guide"
description: "Learn how to debug NodeTool workflows, inspect data between nodes, and troubleshoot errors."
---

Debug a workflow by reading node status, adding Preview nodes, checking logs, and isolating the failing node. Prerequisites: a workflow open in the [editor]({{ '/workflow-editor' | relative_url }}).

---

## Quick Debugging Checklist

- [ ] Look for a moving ring (running), a **Completed in** badge, or a **Failed in** badge on each node
- [ ] Read the red error panel on failed nodes
- [ ] Add Preview nodes after suspicious nodes
- [ ] Verify all required inputs are connected
- [ ] Check data types match between connections
- [ ] Review the Logs panel for detailed errors
- [ ] Test problem nodes in isolation with **Run Node**
- [ ] Run `nodetool validate` on the graph

---

## Understanding Node Status

| Sign | Status | Meaning |
|------|--------|---------|
| **Moving colored ring** around the node | Running | Node is currently executing. A progress bar appears when the node reports progress. |
| **Completed in 1.2s** badge above the node | Completed | Node finished successfully |
| **Failed in 1.2s** badge above the node, and a red error panel | Failed | Node encountered an error |
| **Model is booting, taking minutes.** | Booting | A model is starting up. This is not a failure. |

When a node fails, the error text appears on the node. The panel has **View logs** (opens the [Logs panel]({{ '/editor-panels' | relative_url }}#logs) filtered to that node and run), **Report** (starts a bug report), and a copy button. Select the node and open the Inspector (`i`) to see validation issues for its properties before you run.

---

## Using Preview Nodes

Preview nodes show the value on any wire. Press **Space**, search "Preview", and connect the output to inspect. Faster: drop a connection on empty canvas, or right-click an output port, and choose **Preview**. It creates a Preview node already connected.

Put a Preview before and after each suspect node:

```
Input → Process → Preview(1) → Transform → Preview(2) → LLM → Preview(3) → Output
```

### What Preview Shows

| Data Type | Preview Display |
|-----------|-----------------|
| **Text/String** | Text content, scrollable |
| **Image** | Rendered image |
| **Audio** | Playable audio widget |
| **Video** | Video player |
| **List** | The items, rendered per type |
| **Object/Dict** | Formatted JSON |
| **DataFrame** | Table |
| **Number, Boolean** | The value |
| **HTML, 3D model, sketch, timeline, chart** | A rendered view of each |

---

## Inspecting Workflow JSON

### Exporting Workflow JSON

Open the **⋮** menu in the document bar and choose **Download JSON**. The command menu (`Ctrl/⌘ + K`) has **Download Workflow as JSON** and **Copy Workflow as JSON**.

### Workflow JSON Structure

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

### What to Look For

- Missing connections: check that `edges` connect outputs to inputs.
- Incorrect values: check `data` for each node. A node with `"bypassed": true` in `ui_properties` is disabled.
- Wrong `type`, which happens in programmatic workflows.
- Overlapping or off-canvas nodes: check `ui_properties.position`.

---

## Reading Error Logs

### In the Editor

Open the [Logs panel]({{ '/editor-panels' | relative_url }}#logs) with `l`. It lists log lines for the open workflow, newest first. Filter by **Info**, **Warn**, or **Error**. The [Trace panel]({{ '/editor-panels' | relative_url }}#trace) (`Ctrl/⌘ + Shift + T`) shows per-node timing for a run.

The Trace panel also has an **Ask the agent** button. It opens a chat tab titled "Inspect run" with the run id attached, and the span id too when a span is selected, and drafts "Help me diagnose the selected run." (or "Help me diagnose this span in the selected run.") for you to send.

### Desktop App Logs

Open **Tools → Log Viewer** to read the backend log in its own window. The desktop app writes the log file here:

- Windows: `%LOCALAPPDATA%\nodetool\logs\nodetool.log`
- macOS and Linux: `~/.local/share/nodetool/logs/nodetool.log`

For renderer errors, open the developer tools from the **View** menu.

### CLI/Server Logs

When running NodeTool from the command line, `serve` accepts only `--host` and
`--port`. The log level comes from the environment (`NODETOOL_LOG_LEVEL`,
falling back to `LOG_LEVEL`, default `info`). Valid levels are `debug`, `info`,
`warn`, and `error`:

```bash
# Debug logging
NODETOOL_LOG_LEVEL=debug nodetool serve

# Write the log to a file instead of stderr
NODETOOL_LOG_FILE=/tmp/nodetool.log nodetool serve
```

### Understanding Error Messages

```
Select a model
```
→ An Agent node has no model chosen. Pick one in the Inspector, or set a default in **Settings → Default Models**.

```
COHERE_API_KEY is not configured
```
→ A provider key is missing. The name in the message is the key to set. Add it in **Settings → Models & Providers**.

```
Missing required workflow input "prompt"
```
→ Give the input node a value, or pass the input when you run the workflow.

```
Cycle detected in graph; a cycle may only close on the "next" or "condition" input of a Loop node.
```
→ Remove the connection that loops back. Only a Loop node's `next` and `condition` inputs may close a cycle.

```
Python node "<type>" cannot execute: Python worker is not connected.
```
→ The node needs the Python bridge. Check that Python is installed and the worker started. See [Troubleshooting]({{ '/troubleshooting' | relative_url }}).

The editor refuses a connection between incompatible types, so a type mismatch shows up as a wire that will not connect, not as a run error. Add a conversion node between the two.

---

## Common symptoms

| Symptom | Check |
|---|---|
| LLM does not respond | **More → Model Manager**: model installed (local) or API key set (cloud). Local runtime (Ollama, llama.cpp) running. Template variables filled. A Preview after the Agent node shows whether any output arrives. |
| Image generation fails | Model downloaded in **More → Model Manager**. GPU memory free (`nvidia-smi`). Valid dimensions, step count, and CFG scale. A Preview before the generation node confirms the prompt and conditioning inputs. |
| RAG or search returns nothing | The index workflow ran first. Collection name and embedding model match between index and search. Try a simpler query or a larger `top_k`. Preview the indexed chunks. |
| Run never ends | The validator rejects cycles except one closing on a Loop node's `next` or `condition` input, but a Loop whose condition never ends still runs forever. The node still showing the moving ring is the stuck one. Check for API timeouts, memory, and disk space. |

---

## Isolating Problems

### Binary Search Debugging

Select the downstream half and press `B` (or right-click → **Disable All**). Disabled nodes and their connections are left out of the run, so only the first half executes. If it works, the problem is in the second half. Repeat until you find the node.

### Testing Nodes in Isolation

1. Right-click the node → **Run Node**. It runs as its own job using previous results as inputs. **Run Selected** does the same for a selection.
2. Or make a new workflow with just the suspect node, known-good input nodes, and a Preview.
3. Or, from a terminal, `nodetool node run <node_type> --props '{...}'` runs one node with no workflow.

If the node works in isolation, the problem is with the data it receives in the full workflow.

### Comparing Working vs Broken

Export both versions as JSON, or compare two entries in the **Versions** panel, then diff the changed nodes and edges.

```bash
diff working_workflow.json broken_workflow.json
```

---

## Command-Line Debugging

Three `nodetool` commands debug without the editor. See the [CLI reference]({{ '/cli' | relative_url }}) for all options.

| Command | Use |
|---------|-----|
| `nodetool validate <workflow_id_or_file>` | Static check in under a second: unknown node types, missing required properties, dangling or mis-typed edges, bad model references. Run it before an expensive run. |
| `nodetool debug <workflow_id_or_file>` | Run the workflow and write a bundle with every message, log line, node input and output, and error, plus a verdict. Add `--trace` for timing and cost, `--watch` to re-run a file on save. |
| `nodetool node run <node_type> --props '{...}'` | Run one node in isolation. |

---

## Common Fixes

| Problem | Solution |
|---------|----------|
| Model not available | Install it in More → Model Manager or configure its API key |
| Empty output | Add Preview to find where data is lost |
| Wrong format | Use the **Format Text** node or a conversion node |
| Large run warning | Review the cost, or change **Large-Run Threshold** in Settings → General → Execution |

---

## Getting More Help

1. **Click Report on the failed node.** The form collects the error, the node's settings, the workflow and the logs. The hosted app sends it to the NodeTool team. A local install saves a zip you drag into a pre-filled GitHub issue. See [Report a Bug from inside NodeTool](troubleshooting.md#report-a-bug-from-inside-nodetool).
2. **Ask on [Discord](https://discord.gg/WmQTWZRcYE)** with the workflow JSON, a screenshot, and your OS and NodeTool version.

Related: [Troubleshooting](troubleshooting.md), [Key Concepts](key-concepts.md), [Workflow Editor](workflow-editor.md), [Cookbook](cookbook.md).
