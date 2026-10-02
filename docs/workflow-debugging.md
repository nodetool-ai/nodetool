---
layout: page
title: "Workflow Debugging Guide"
description: "Learn how to debug NodeTool workflows, inspect data between nodes, and troubleshoot errors."
---

This guide teaches you how to debug NodeTool workflows when they don't work as expected. You'll learn to inspect intermediate data, read error logs, and systematically isolate problems.

---

## Quick Debugging Checklist

When a workflow isn't working:

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

Nodes show their execution status on the canvas:

| Sign | Status | Meaning |
|------|--------|---------|
| **Moving colored ring** around the node | Running | Node is currently executing. A progress bar appears when the node reports progress. |
| **Completed in 1.2s** badge above the node | Completed | Node finished successfully |
| **Failed in 1.2s** badge above the node, and a red error panel | Failed | Node encountered an error |
| **Model is booting, taking minutes.** | Booting | A model is starting up. This is not a failure. |

When a node fails, the error text appears on the node. The panel has **View logs** (opens the [Logs panel]({{ '/editor-panels' | relative_url }}#logs) filtered to that node and run), **Report** (starts a bug report), and a copy button. Select the node and open the Inspector (`i`) to see validation issues for its properties before you run.

---

## Using Preview Nodes

Preview nodes are your primary debugging tool. They show exactly what data is flowing through your workflow at any point.

### Adding Preview Nodes

1. Press **Space** to open the node search
2. Type "Preview" and select the Preview node
3. Connect the output you want to inspect to the Preview node
4. Run the workflow

A faster route: drop a connection on empty canvas, or right-click an output port, and choose **Preview** in the menu. It creates a Preview node already connected.

### Preview Node Strategies

**After every major transformation:**
```
Input → Process → Preview(1) → Transform → Preview(2) → LLM → Preview(3) → Output
```

**Before and after suspicious nodes:**
```
... → Preview(before) → SuspiciousNode → Preview(after) → ...
```

**At branch points:**
```
        → Preview(A) → ProcessA
Input →
        → Preview(B) → ProcessB
```

### What Preview Shows

Preview nodes render the value by type:

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

Every NodeTool workflow is stored as JSON. Inspecting this JSON can help debug complex issues.

### Exporting Workflow JSON

1. Open your workflow in the editor
2. Open the composer's **⋮** menu and choose **Download JSON**. The command menu (`Ctrl/⌘ + K`) has **Download Workflow as JSON** and **Copy Workflow as JSON**.
3. Save the `.json` file
4. Open in any text editor or JSON viewer

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

**Missing connections:** Check that `edges` correctly connect outputs to inputs

**Incorrect values:** Look at `data` for each node to verify settings. A node with `"bypassed": true` in `ui_properties` is disabled.

**Node types:** Ensure `type` matches expected node (typos happen in programmatic workflows)

**Position issues:** If nodes overlap or are off-canvas, check `ui_properties.position`

---

## Reading Error Logs

### In the Editor

Open the [Logs panel]({{ '/editor-panels' | relative_url }}#logs) with `l`. It lists log lines for the open workflow, newest first. Filter by **Info**, **Warn**, or **Error**. The [Trace panel]({{ '/editor-panels' | relative_url }}#trace) (`Ctrl/⌘ + Shift + T`) shows per-node timing for a run.

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

Messages you are likely to meet:

```
Select a model
```
→ An Agent node has no model chosen. Pick one in the Inspector.

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

## Debugging Specific Issues

### LLM Not Responding

1. **Check model availability**
   - Open **More → Model Manager** on the left rail
   - Verify model is installed (local) or API key is set (cloud)

2. **Test with Preview**
   - Add Preview after the Agent/LLM node
   - Run and check if any output appears

3. **Check prompt**
   - Is the prompt template valid?
   - Are all template variables being filled?

4. **Verify connectivity**
   - For cloud models: check internet connection
   - For local models: check if Ollama/llama.cpp is running

### Image Generation Fails

1. **Check model installation**
   - Open **More → Model Manager**
   - Ensure Flux/Qwen Image/etc. is downloaded

2. **Verify VRAM**
   - Check GPU memory with `nvidia-smi`
   - Close other GPU apps if memory is low

3. **Inspect parameters**
   - Valid dimensions? (usually multiples of 8 or 64)
   - Reasonable step count? (20-50 typical)
   - Valid CFG scale? (5-15 typical)

4. **Add Preview before generation**
   - Confirm prompt text is correct
   - Check that conditioning inputs are valid

### RAG/Search Returns Nothing

1. **Verify collection exists**
   - Check that index workflow was run first
   - Collection name matches between index and search

2. **Check embedding model**
   - Same embedding model for index and search?
   - Model available and running?

3. **Test query**
   - Try a simpler query
   - Increase `top_k` to retrieve more documents
   - Check if documents were chunked appropriately

4. **Inspect indexed content**
   - Use Preview to see what was indexed
   - Check chunk sizes aren't too small/large

### Workflow Runs Forever

1. **Check for loops**
   - The validator rejects cycles except one closing on a Loop node's `next` or `condition` input, but a Loop with a condition that never ends still runs forever
   - Look for conditional nodes that might never exit

2. **Monitor node status**
   - Which node still shows the moving running ring?
   - That node is the bottleneck

3. **Check network calls**
   - API timeouts can appear as hangs
   - Add timeout parameters where available

4. **Resource constraints**
   - Is the system running out of memory?
   - Is disk full (for large file operations)?

---

## Isolating Problems

### Binary Search Debugging

When you have a complex workflow and something's wrong:

1. **Disable half the workflow**
   - Select the downstream nodes and press `B` (or right-click → **Disable All**)
   - A disabled node and its connections are left out of the run, so only the first half executes

2. **Check results**
   - Working? Problem is in second half
   - Broken? Problem is in first half

3. **Repeat**
   - Continue halving until you find the problem node

### Testing Nodes in Isolation

Create a minimal test workflow:

1. **Right-click the node → Run Node.** It runs as its own job using previous results as inputs. **Run Selected** does the same for a selection.
2. Or make a **new workflow** with just the suspicious node, add input nodes with known good test data, add Preview/Output, and run it
3. Or, from a terminal, `nodetool node run <node_type> --props '{...}'` runs one node with no workflow

If the node works in isolation, the problem is with the data it receives in the full workflow.

### Comparing Working vs Broken

If a workflow used to work:

1. **Export both versions** (working and broken) as JSON, or compare two entries in the **Versions** panel
2. **Diff the files** to see what changed
3. **Focus on changed nodes/edges**

```bash
diff working_workflow.json broken_workflow.json
```

---

## Command-Line Debugging

Three `nodetool` commands cover the same ground without the editor. See the [CLI reference]({{ '/cli' | relative_url }}) for all options.

| Command | Use |
|---------|-----|
| `nodetool validate <workflow_id_or_file>` | Static check in under a second: unknown node types, missing required properties, dangling or mis-typed edges, bad model references. Run it before an expensive run. |
| `nodetool debug <workflow_id_or_file>` | Run the workflow and write a bundle with every message, log line, node input and output, and error, plus a verdict. Add `--trace` for timing and cost, `--watch` to re-run a file on save. |
| `nodetool node run <node_type> --props '{...}'` | Run one node in isolation. |

---

## Debugging Tools Summary

| Tool | When to Use | How to Access |
|------|-------------|---------------|
| **Preview nodes** | See intermediate data | Space → search "Preview" |
| **Node error panel** | See error messages | On the failed node |
| **Logs panel** | Run log lines by severity | `l` |
| **Trace panel** | Per-node timing | `Ctrl/⌘ + Shift + T` |
| **Run Node / Run Selected** | Test part of a graph | Right-click a node or selection |
| **Disable Node** | Exclude part of a graph from a run | `B` |
| **Versions panel** | Compare or restore earlier saves | Bottom panel → Versions |
| **JSON export** | Inspect workflow structure | ⋮ menu → Download JSON |
| **Log Viewer** | Backend log (desktop) | Tools → Log Viewer |
| **Debug logging** | CLI debugging | `NODETOOL_LOG_LEVEL=debug nodetool serve` |
| **`nodetool validate` / `debug`** | Headless checks | Terminal |

---

## Common Fixes

| Problem | Solution |
|---------|----------|
| Wire will not connect | Types are incompatible. Add a conversion node between them |
| "Select a model" | Choose a model on the Agent node, or set a default in Settings → Default Models |
| "... is not configured" | Add the named key in Settings → Models & Providers |
| Model not available | Install it in More → Model Manager or configure its API key |
| Empty output | Add Preview to find where data is lost |
| Wrong format | Use the **Format Text** node or a conversion node |
| Large run warning | Review the cost, or change **Large-Run Threshold** in Settings → General → Execution |

---

## Getting More Help

If you're still stuck after debugging:

1. **Click Report on the failed node.** The bug-report form collects the error,
   the node's settings, the workflow and the logs for you, then saves a zip you
   drag into a pre-filled GitHub issue. See
   [Report a Bug from inside NodeTool](troubleshooting.md#report-a-bug-from-inside-nodetool).
2. **Ask on [Discord](https://discord.gg/WmQTWZRcYE)** if you would rather talk
   it through first. Bring the workflow JSON, a screenshot, and your OS and
   NodeTool version.

---

## Related Documentation

- [Troubleshooting Guide](troubleshooting.md) – Broader troubleshooting for common issues
- [Key Concepts](key-concepts.md) – Understanding nodes, edges, and data flow
- [Workflow Editor](workflow-editor.md) – Using the visual editor effectively
- [Cookbook](cookbook.md) – Working workflow patterns to learn from
