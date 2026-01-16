---
layout: page
title: "Workflow Debugging Guide"
description: "Learn how to debug NodeTool workflows, inspect data between nodes, and troubleshoot errors."
---

This guide teaches you how to debug NodeTool workflows when they don't work as expected. You'll learn to inspect intermediate data, read error logs, and systematically isolate problems.

---

## Quick Debugging Checklist

When a workflow isn't working:

- [ ] Check node status colors (gray/yellow/green/red)
- [ ] Click on failed (red) nodes to see error messages
- [ ] Add Preview nodes after suspicious nodes
- [ ] Verify all required inputs are connected
- [ ] Check data types match between connections
- [ ] Review the console/logs for detailed errors
- [ ] Test problem nodes in isolation

---

## Understanding Node Status

Nodes display their execution status through border colors:

| Color | Status | Meaning |
|-------|--------|---------|
| **Gray** | Not started | Node hasn't been processed yet |
| **Yellow** | Running | Node is currently executing |
| **Green** | Completed | Node finished successfully |
| **Red** | Failed | Node encountered an error |
| **Blue outline** | Selected | Node is currently selected |

When a node fails (red), click it to see the error message in the properties panel.

---

## Using Preview Nodes

Preview nodes are your primary debugging tool. They show exactly what data is flowing through your workflow at any point.

### Adding Preview Nodes

1. Press **Space** to open the node search
2. Type "Preview" and select the Preview node
3. Connect the output you want to inspect to the Preview node
4. Run the workflow

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

Preview nodes display data based on type:

| Data Type | Preview Display |
|-----------|-----------------|
| **Text/String** | Full text content, scrollable |
| **Image** | Rendered image with dimensions |
| **Audio** | Playable audio widget |
| **List** | JSON array with items |
| **Object/Dict** | Formatted JSON |
| **Number** | Numeric value |
| **Boolean** | True/False |

---

## Inspecting Workflow JSON

Every NodeTool workflow is stored as JSON. Inspecting this JSON can help debug complex issues.

### Exporting Workflow JSON

1. Open your workflow in the editor
2. Use **File → Export** or press **Ctrl/⌘ + Shift + E**
3. Save the `.json` file
4. Open in any text editor or JSON viewer

### Workflow JSON Structure

```json
{
  "id": "workflow_abc123",
  "name": "My Workflow",
  "description": "...",
  "nodes": [
    {
      "id": "node_1",
      "type": "nodetool.input.StringInput",
      "data": {
        "value": "Hello world"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "node_2", 
      "type": "nodetool.agents.Agent",
      "data": {
        "prompt": "...",
        "model": { "provider": "openai", "id": "gpt-4" }
      },
      "position": { "x": 300, "y": 100 }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "sourceHandle": "output",
      "target": "node_2",
      "targetHandle": "text"
    }
  ]
}
```

### What to Look For

**Missing connections:** Check that `edges` correctly connect outputs to inputs

**Incorrect values:** Look at `data` for each node to verify settings

**Node types:** Ensure `type` matches expected node (typos happen in programmatic workflows)

**Position issues:** If nodes overlap or are off-canvas, check `position` values

---

## Reading Error Logs

### Desktop App Logs

**Enable debug logging:**
1. Open **Settings → Advanced**
2. Enable **Debug Logging**
3. Logs appear in the console panel (View → Developer Tools)

**Log location:**
- Windows: `%USERPROFILE%\.nodetool\logs\`
- macOS: `~/Library/Logs/NodeTool/` or `~/.nodetool/logs/`
- Linux: `~/.nodetool/logs/`

### CLI/Server Logs

When running NodeTool from command line:

```bash
# Verbose logging
nodetool serve --verbose

# Or set log level
nodetool serve --log-level debug
```

### Understanding Error Messages

**Common error patterns:**

```
Error: Type mismatch - cannot connect 'List[String]' to 'String'
```
→ Use a node to extract a single item from the list (e.g., `GetElement`)

```
Error: Required input 'prompt' is not connected
```
→ Connect something to the `prompt` input, or set a default value

```
Error: Model not found: 'gpt-4'
```
→ Check API key configuration in Settings → Providers

```
Error: CUDA out of memory
```
→ Use a smaller model, reduce batch size, or close other GPU applications

```
Error: Connection refused on localhost:7777
```
→ NodeTool server isn't running, or firewall is blocking

---

## Debugging Specific Issues

### LLM Not Responding

1. **Check model availability**
   - Open Models → Model Manager
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
   - Open Model Manager
   - Ensure SDXL/Flux/etc. is downloaded

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
   - While NodeTool prevents circular connections, complex logic can create infinite loops
   - Look for conditional nodes that might never exit

2. **Monitor node status**
   - Which node is stuck on "running" (yellow)?
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
   - Disconnect nodes in the middle
   - Run first half only

2. **Check results**
   - Working? Problem is in second half
   - Broken? Problem is in first half

3. **Repeat**
   - Continue halving until you find the problem node

### Testing Nodes in Isolation

Create a minimal test workflow:

1. **New workflow** with just the suspicious node
2. **Add input nodes** with known good test data
3. **Add Preview/Output** to see results
4. **Run and verify**

If the node works in isolation, the problem is with the data it receives in the full workflow.

### Comparing Working vs Broken

If a workflow used to work:

1. **Export both versions** (working and broken) as JSON
2. **Diff the files** to see what changed
3. **Focus on changed nodes/edges**

```bash
diff working_workflow.json broken_workflow.json
```

---

## Debugging Tools Summary

| Tool | When to Use | How to Access |
|------|-------------|---------------|
| **Preview nodes** | See intermediate data | Space → search "Preview" |
| **Node click** | See error messages | Click red (failed) nodes |
| **Console/DevTools** | View detailed logs | View → Developer Tools |
| **JSON export** | Inspect workflow structure | File → Export |
| **--verbose flag** | CLI debugging | `nodetool serve --verbose` |
| **Log files** | Historical debugging | `~/.nodetool/logs/` |

---

## Common Fixes

| Problem | Solution |
|---------|----------|
| "Type mismatch" | Add conversion node between incompatible types |
| "Not connected" | Wire up all required inputs |
| "Model not found" | Install model in Model Manager or configure API key |
| "Out of memory" | Use smaller model, reduce batch size, close apps |
| "Timeout" | Check internet, increase timeout setting |
| "Empty output" | Add Preview to find where data is lost |
| "Wrong format" | Use FormatText or conversion nodes |
| "Permission denied" | Check file paths and permissions |

---

## Getting More Help

If you're still stuck after debugging:

1. **Export your workflow** as JSON
2. **Take screenshots** of error messages
3. **Note your system info** (OS, GPU, RAM, NodeTool version)
4. **Ask on [Discord](https://discord.gg/WmQTWZRcYE)** with these details
5. **File a [GitHub issue](https://github.com/nodetool-ai/nodetool/issues)** for bugs

---

## Related Documentation

- [Troubleshooting Guide](troubleshooting.md) – Broader troubleshooting for common issues
- [Key Concepts](key-concepts.md) – Understanding nodes, edges, and data flow
- [Workflow Editor](workflow-editor.md) – Using the visual editor effectively
- [Cookbook](cookbook.md) – Working workflow patterns to learn from
