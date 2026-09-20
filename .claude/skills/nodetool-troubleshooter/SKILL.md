---
name: nodetool-troubleshooter
description: "Diagnose a failing NodeTool run on any surface: workflows, mini apps, timelines, sketches, scripts, storyboards, and stuck media generations. Use diagnosing-bugs for repository code defects."
---

You are a NodeTool troubleshooter. Diagnose issues systematically using this guide.

# Name the surface first

A failure belongs to one document kind, and each kind has its own static check
and its own replay harness. Checking the wrong one wastes the run.

| Symptom sits in | Static check | Replay | Skill for the fix |
|---|---|---|---|
| A workflow graph | `validate_workflow` | `debug_workflow` | [nodetool-workflow-builder](../nodetool-workflow-builder/SKILL.md) |
| A mini app: dead button, blank widget | `debug_app {run: false}` | `debug_app {interact}` | [nodetool-app-builder](../nodetool-app-builder/SKILL.md) |
| A timeline: wrong length, missing clip, bad font | `validate_timeline` | `timeline debug` | [nodetool-video-post](../nodetool-video-post/SKILL.md) |
| A sketch: empty layer, wrong blend | `validate_sketch` | `sketch debug` | [nodetool-sketch](../nodetool-sketch/SKILL.md) |
| A JS script or Code node | `validate_js_script`, `validate_code` | `run_js_script`, `test_js_script` | [nodetool-js-scripting](../nodetool-js-scripting/SKILL.md) |
| A 3D model | `validate_model3d` | `render_model3d` | [nodetool-3d-scene](../nodetool-3d-scene/SKILL.md) |
| A storyboard: a shot that will not render | `get_storyboard` | re-render one target | [storyboard-core](../storyboard-core/SKILL.md) |
| A media call that never came back | `generations get` | `generations await` | below, under **Stuck generation** |

A run that spans surfaces fails at one of them. A mini app over a broken
workflow reports that the app is broken: debug the graph as a graph first.

# CLI Debug Harnesses (start here when you have shell access)

The `nodetool` CLI has purpose-built harnesses that beat manual poking. Escalate in cost order:

```bash
# 1. Static check (<1s, no run, no DB for file targets): unknown node types,
#    missing required props, unselected models, dangling/mis-typed edges
npm run dev:nodetool -- validate <workflow_id|workflow.json|workflow.ts>

# 2. Single node in isolation — no workflow authoring needed
npm run dev:nodetool -- node run nodetool.text.Concat --props '{"a":"hi"}' --no-secrets

# 3. Full server-side run → self-contained debug bundle (messages, logs,
#    outputs, errors) + agent-friendly verdict. --json prints the full report.
npm run dev:nodetool -- debug <workflow_id|workflow.json> --params '{"prompt":"hi"}'
npm run dev:nodetool -- debug workflow.json --watch     # re-run on save, print verdict diff

# 4. Opt-in expensive surfaces
npm run dev:nodetool -- debug <id> --trace              # OTel spans: timing, tokens, cost
npm run dev:nodetool -- debug <id> --browser --stages   # real browser + per-stage screenshots

# Mini apps: binding validation, then a headless run of every operation
npm run dev:nodetool -- app debug <id> --no-run     # free wiring check
npm run dev:nodetool -- app debug <id> --json

# The other document surfaces — same shape: validate, then replay a scripted session
npm run dev:nodetool -- timeline validate <timeline_id|sequence.json> --json
npm run dev:nodetool -- sketch validate <image_document_id|sketch.json> --json
npm run dev:nodetool -- jsscript validate <id|file.json> --json
npm run dev:nodetool -- timeline debug <id> --interact '[…]'
npm run dev:nodetool -- sketch debug <id> --interact '[…]'
npm run dev:nodetool -- jsscript debug <id> --interact '[…]'
```

For every one of these, a path that exists on disk wins over an id, and a file
target needs no database. Each `debug` writes a bundle under `nodetool-debug/`
and exits non-zero on a bad verdict. Read the report's `notSimulated` list
before concluding that a green verdict means the surface works.

The bundle lands in `nodetool-debug/<id>-<ts>/` (`report.md`, `server/messages.jsonl`, …). Loop: run `debug` → read the verdict → edit → re-run. Against a running server, agents can use the `validate_workflow` and `debug_workflow` tools instead.

For agent/LLM issues, capture a trace and inspect the spans (`llm.chat` carries `gen_ai.usage.*` token/cost attributes):

```bash
NODETOOL_TRACE_FILE=/tmp/trace.jsonl npm run dev:chat
npm run dev:nodetool -- --trace-file trace.jsonl run workflow.ts
```

# Quick Diagnostic Checklist

When a user reports a problem, work through this in order:

- [ ] **Connections**: Are all required inputs connected?
- [ ] **Types**: Do connected types match? (hover edges to check)
- [ ] **Preview nodes**: Add Preview nodes at each stage to inspect data
- [ ] **Error messages**: Read red node error text carefully
- [ ] **Model availability**: Is the model downloaded/API key set?
- [ ] **File paths**: Do referenced files exist and have correct permissions?
- [ ] **API keys**: Are provider keys configured? (`nodetool secrets store KEY`)
- [ ] **Logs**: Check `~/.nodetool/logs/` or run with `NODETOOL_LOG_LEVEL=debug`

# Node Status Colors

| Color | Status | Action |
|-------|--------|--------|
| **Gray** | Not started | Waiting for inputs or not yet reached |
| **Yellow** | Running | Currently processing, wait |
| **Green** | Completed | Working correctly |
| **Red** | Failed | Click node to see error message |

# Common Issues & Solutions

## Workflow Stuck / Not Progressing

**Symptoms**: Yellow nodes that never turn green, no output

**Check**:
1. Is a model downloading? (first run can be slow)
2. Is there an infinite loop? (check for cycles in connections)
3. Is a node waiting for all inputs? (check `sync_mode`)
4. Is the server running? (`nodetool serve`)
5. Network timeout on API call?

**Fix**: Add Preview nodes before stuck node. Check server logs. Kill and restart if needed.

## Type Mismatch

**Symptoms**: Red edge, error about incompatible types

**Fix**:
- Hover over the edge to see source/target types
- Use conversion nodes (e.g., `nodetool.text.ToString`, `nodetool.data.ToDataframe`)
- Check `metadataOutputTypes` of source node matches expected input type

## Empty / Null Output

**Symptoms**: Downstream nodes receive nothing, Preview shows null

**Check**:
1. Add Preview node immediately after the suspect node
2. Is the upstream node actually completing? (should be green)
3. Are optional inputs that are actually needed left unconnected?
4. Is the node returning the correct output key?

## Stuck Generation

**Symptoms**: An image, video, audio or 3D call never returns. The surface shows
a pending take with no error.

Every provider media call is one `predictions` row, opened before the call and
closed with its outcome, so a hung call is visible without reading logs.

```bash
npm run dev:nodetool -- generations list --status running --json
npm run dev:nodetool -- generations get <generation_id> --json
npm run dev:nodetool -- generations await <generation_id> --timeout 300   # exit 1 while running
npm run dev:nodetool -- generations cancel <generation_id>
npm run dev:nodetool -- generations sweep        # close orphaned rows after a restart
npm run dev:nodetool -- generations reconcile <generation_id>   # ask the provider what it billed
```

A row reading `interrupted` means a restart orphaned it, not that the provider
failed. `provider-list` and `provider-get` ask the provider's own record instead
of the local table, for a run started on another machine. Agents reach the same
record through `list_generations`, `get_generation`, `await_generation`,
`cancel_generation` and `reconcile_generation`.

## Mini App Shows Nothing

**Symptoms**: The button does nothing, or a widget stays blank after a run.

**Check**, in this order:

1. `debug_app {application_id, run: false}` — free. A binding pointing at a
   missing input, output or variable is the usual answer.
2. Does the app have a run trigger at all? A Button needs a `run` action.
3. Is anything bound to `op:<id>/exec#error`? A failed operation with no error
   binding leaves the app looking idle.
4. Did the run actually complete? `debug_app {interact}` reports each widget's
   final state and each invocation's policy decision, so a run that was
   replaced, queued or timed out says so.
5. Is the widget bound to the right kind? A Sketch or Timeline reference bound
   to an Image or Video widget renders nothing.

## Timeline Renders Wrong

**Symptoms**: The cut runs longer than planned, a font differs from the editor,
an animation does not play.

1. `validate_timeline` first. It catches overlaps, fades longer than their clip,
   unknown presets, incomplete bindings and non-portable fonts.
2. A shot is as long as its render, not as long as its directed duration. Check
   `retimed_shots` from the assembly call.
3. A CSS generic family (`sans-serif`, `serif`, `system-ui`) is refused where a
   clip is authored, because the editor, the render and the frame preview would
   each pick a different typeface. Use a bundled family.
4. `preview_timeline_frame` before `render_timeline`. Rendering to check an edit
   is the expensive way to be wrong.

## LLM Poor Quality

**Symptoms**: Agent output is wrong, irrelevant, or garbled

**Fix**:
- Improve the prompt (be specific, add examples)
- Use a more capable model (`find_model`, or the ids the provider registry lists)
- Lower temperature for factual tasks (0.0–0.3)
- Add few-shot examples in system prompt
- Use RAG to ground answers in source documents

## RAG / Vector Search Returns Nothing

**Symptoms**: HybridSearch or TextSearch returns empty results

**Check**:
1. Was the collection actually indexed? Inspect it with a `vector.Count` / `vector.Peek` node, or the editor's collection view.
2. Does the embedding model match between indexing and search?
3. Test search directly with a simple query
4. Review chunking — very small or very large chunks reduce quality
5. For the Chroma backend, check `CHROMA_PATH` / `CHROMA_URL` (SQLite-vec, the default, needs no config)

## API Key Errors

**Symptoms**: 401, 403, "API key invalid", "authentication failed"

**Fix**:
```bash
# Store key
nodetool secrets store OPENAI_API_KEY
# Or via environment
export OPENAI_API_KEY=sk-...
```

**Provider key names**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`, `FAL_API_KEY`

## Model Not Found

**Symptoms**: "Model not found", "model does not exist"

**Check**:
1. For local models: Is the model downloaded? (Models → Model Manager)
2. For Ollama: Is Ollama running? (`ollama list`)
3. For cloud: Is the model ID correct? (check provider docs)
4. For HuggingFace gated models: Accept terms on HF Hub

## Memory Issues

**Symptoms**: OOM errors, slow processing, system unresponsive

**Fix**:
- Use quantized models (INT4/FP4) for local inference
- Enable CPU offload for large models
- Reduce batch sizes
- Use smaller model variants
- For Docker: increase `--memory` limit

## Deployment Failures

**Symptoms**: Deploy command fails, server won't start

**Check**:
1. `deployment.yaml` syntax (valid YAML?)
2. All required env vars set? (`NODETOOL_ENV`, `AUTH_PROVIDER`, `SECRETS_MASTER_KEY`)
3. Docker running? (`docker ps`)
4. Port already in use? (`lsof -i :7777`)
5. Volume mount paths exist?
6. SSH key permissions correct? (600)

# Debugging Techniques

## Preview Node Strategy
```
Input → Preview(1) → Transform → Preview(2) → LLM → Preview(3) → Output
```
Add Preview nodes at each stage to isolate where data breaks.

## Log Inspection
```bash
# Desktop app logs
ls ~/.nodetool/logs/

# CLI verbose mode (logging is controlled by an env var, not a serve flag)
NODETOOL_LOG_LEVEL=debug nodetool serve

# Browser DevTools
# View → Developer Tools → Console tab
```

## JSON Export
Export workflow as JSON (`File → Export`) to inspect:
- Node `data` fields for property values
- Edge `sourceHandle`/`targetHandle` names
- Node `type` strings for correctness

## Network Debugging
```bash
# Check server health
curl http://localhost:7777/health

# Test API auth
curl -H "Authorization: Bearer TOKEN" http://localhost:7777/v1/models

# Check WebSocket
wscat -c ws://localhost:7777/ws
```

# Performance Optimization

| Issue | Solution |
|-------|----------|
| Slow LLM responses | Use local models for simple tasks, cloud for complex |
| Large file processing | Batch processing, stream with `genProcess` |
| Multiple independent tasks | Use parallel execution paths in workflow |
| Repeated computations | Cache results, avoid redundant nodes |
| Model loading time | Keep models in memory (server mode), pre-download |
| High memory usage | Right-size models, use quantized variants |
| Slow vector search | Optimize chunk size (200-500 tokens), use FAISS for speed |

# Error Recovery Patterns

1. **Read the error message carefully** — most errors are self-explanatory
2. **Check the simplest explanation first** — missing connection, wrong type, no API key
3. **Isolate with Preview nodes** — find exactly where data breaks
4. **Check logs** — server logs have full stack traces
5. **Restart if stuck** — kill server, clear cache, restart
6. **Reduce complexity** — test with a minimal workflow first, then add nodes
