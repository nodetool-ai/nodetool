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

Preview nodes show the value on any connection. Press **Space**, search "Preview", and connect the output to inspect. Faster: drop a connection on empty canvas, or right-click an output port, and choose **Preview**. It creates a Preview node already connected.

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
| **Object/Dict** | Formatted key and value pairs |
| **DataFrame** | Table |
| **Number, Boolean** | The value |
| **HTML, 3D model, sketch, timeline, chart** | A rendered view of each |

---

## Reading Error Logs

### In the Editor

Open the [Logs panel]({{ '/editor-panels' | relative_url }}#logs) with `l`. It lists log lines for the open workflow, newest first. Filter by **Info**, **Warn**, or **Error**. The [Trace panel]({{ '/editor-panels' | relative_url }}#trace) (`Ctrl/⌘ + Shift + T`) shows per-node timing for a run.

The Trace panel also has an **Ask the agent** button. It opens a chat tab titled "Inspect run" with the run attached, and the selected step when there is one, and drafts "Help me diagnose the selected run." (or "Help me diagnose this span in the selected run.") for you to send.

### Desktop App Logs

Open **Tools → Log Viewer** to read the backend log in its own window. The desktop app writes the log file here:

- Windows: `%LOCALAPPDATA%\nodetool\logs\nodetool.log`
- macOS and Linux: `~/.local/share/nodetool/logs/nodetool.log`

For renderer errors, open the developer tools from the **View** menu.

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
→ Remove the connection that loops back. Only a Loop node's **next** and **condition** inputs may close a cycle.

```
Python node "<type>" cannot execute: Python worker is not connected.
```
→ The node needs the Python bridge. Check that Python is installed and the worker started. See [Troubleshooting]({{ '/troubleshooting' | relative_url }}).

The editor refuses a connection between incompatible types, so a type mismatch shows up as a connection that will not attach, not as a run error. Add a conversion node between the two.

---

## Common symptoms

| Symptom | Check |
|---|---|
| LLM does not respond | **More → Model Manager**: model installed (local) or API key set (cloud). Local runtime (Ollama, llama.cpp) running. Template variables filled. A Preview after the Agent node shows whether any output arrives. |
| Image generation fails | Model downloaded in **More → Model Manager**. Enough free GPU memory. Image size and step count within what the model supports. A Preview before the generation node confirms the prompt and conditioning inputs. |
| RAG or search returns nothing | The index workflow ran first. Collection name and embedding model match between index and search. Try a simpler query or ask for more results. Preview the indexed chunks. |
| Run never ends | The validator rejects cycles except one closing on a Loop node's **next** or **condition** input, but a Loop whose condition never ends still runs forever. The node still showing the moving ring is the stuck one. Check for API timeouts, memory, and disk space. |

---

## Isolating Problems

### Binary Search Debugging

Select the downstream half and press `B` (or right-click → **Disable All**). Disabled nodes and their connections are left out of the run, so only the first half executes. If it works, the problem is in the second half. Repeat until you find the node.

### Testing Nodes in Isolation

1. Right-click the node → **Run Node**. It runs as its own job using previous results as inputs. **Run Selected** does the same for a selection.
2. Or make a new workflow with just the suspect node, known-good input nodes, and a Preview.

If the node works in isolation, the problem is with the data it receives in the full workflow.

### Comparing Working vs Broken

Compare two entries in the **Versions** panel and look at the nodes and connections that changed.

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
2. **Ask on [Discord](https://discord.gg/WmQTWZRcYE)** with an exported copy of the workflow, a screenshot, and your OS and NodeTool version.

To debug from code, with workflow JSON, server logs, and the command line, see [Debugging Workflows from Code](developer/workflow-debugging.md).

Related: [Troubleshooting](troubleshooting.md), [Key Concepts](key-concepts.md), [Workflow Editor](workflow-editor.md), [Cookbook](cookbook.md).
