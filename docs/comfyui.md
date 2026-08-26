---
layout: page
title: "ComfyUI"
description: "Run ComfyUI workflows inside NodeTool — directly against a ComfyUI server, or proxied over a NodeTool GPU worker."
---

NodeTool runs ComfyUI workflows as nodes in a NodeTool graph. You export a
workflow from ComfyUI in **API (prompt) format**, load it into a node, and its
`Load*` nodes become typed inputs while its `Save*` nodes become typed outputs.
Everything around it — asset handling, LLM steps, mini apps — stays NodeTool's.

Two nodes cover two topologies:

| | `lib.comfy.RunWorkflow` | `lib.comfy.RunWorkflowOnWorker` |
|---|---|---|
| Title | Run ComfyUI Workflow | Run ComfyUI Workflow (Worker) |
| Talks to | Any ComfyUI HTTP/WebSocket endpoint | A NodeTool worker that fronts ComfyUI |
| Transport | ComfyUI's own `/prompt`, `/ws`, `/view`, `/history` | The worker bridge's `comfy.*` messages |
| ComfyUI reachable from NodeTool? | Yes, directly | No — loopback-only inside the worker |
| Workflow loader in the editor | Yes | No (see [limitations](#known-limitations)) |
| Outputs | Streamed, one frame per file | Buffered, returned at the end |

Both live in the `lib.comfy` namespace and ship in the built-in `base` node
pack, so every install registers them — including a server running the curated
cloud profile (`NODETOOL_NODE_PROFILE=cloud`, the production default), which
allowlists the two runners by name while dropping the rest of the namespace.

If they don't appear in the node menu, that is the menu's own decluttering, not
a gate: `lib.comfy` sits in the **Developer Tools** group of
`web/src/config/optionalNodePacks.ts`, hidden from the browsable namespace tree
until you reveal that group. Search, paste, and saved workflows resolve the
nodes either way.

---

## Run ComfyUI Workflow

Point the node at a ComfyUI server you can reach. It submits the prompt over
HTTP, follows the run on ComfyUI's WebSocket, and downloads each output file as
the node that produced it finishes.

### Properties

| Property | Default | Meaning |
|---|---|---|
| `endpoint` | `127.0.0.1:8188` | Host:port or full URL. `https://…` and `wss://` proxies (RunPod pods, Cloudflare tunnels) work — the scheme is derived from the endpoint. |
| `workflow` | *empty* | The API-format prompt as a JSON string: a map of node id to `{ class_type, inputs }`. |
| `timeout` | `600` | Seconds to wait for the run. Also bounds the WebSocket handshake and the submit request. |

### Loading a workflow

In the editor, the node has a **Load Workflow** button in its header. It accepts:

- **Pasted JSON** in API format. In ComfyUI, use **Save (API Format)** — not the
  regular save, which writes the UI format with a `nodes` array. Pasting the UI
  format gives you an error saying exactly that.
- **A dropped `.json` file** in the same format.
- **A dropped `.png` exported by ComfyUI**, whose `prompt` metadata chunk is read
  out of the PNG's `tEXt`/`iTXt` chunks.

A wrapper object with the prompt nested under a `prompt` key is unwrapped
automatically.

Applying a workflow writes three things onto the node: the normalized prompt into
the `workflow` property, the derived `dynamic_inputs`/`dynamic_outputs`, and
default values for the exposed inputs. Values you had already edited on handles
that still exist are preserved.

### What becomes an input or an output

The parser (`web/src/utils/comfyDynamicSchema.ts`) reads the prompt and derives
handles. Every dynamic handle is keyed **`<comfyNodeId>:<field>`**.

**Typed media inputs** come from `Load*` classes. Curated classes map to a known
field and type — `LoadImage`, `LoadImageMask`, `LoadImageOutput` (image),
`LoadAudio`, `VHS_LoadAudioUpload` (audio), `LoadVideo`, `VHS_LoadVideo` (video).
Any other class whose name starts with `Load` falls back to a prefix guess: the
media kind comes from the class name (`Audio`/`Video`, else image) and the field
is its first literal string input.

**Typed outputs** come from `Save*` and `Preview*` classes. Curated:
`SaveImage`, `PreviewImage`, `SaveAnimatedWEBP`, `SaveAnimatedPNG` (image),
`SaveAudio`, `SaveAudioMP3`, `SaveAudioOpus`, `PreviewAudio` (audio),
`SaveVideo`, `VHS_VideoCombine` (video). Other `Save*`/`Preview*` classes fall
back to the same name-based guess. Each output slot is keyed
`<comfyNodeId>:<image|audio|video>` and carries a **singular** media type,
because outputs stream one item per file.

**Everything else literal** is offered in the loader dialog as a checkbox list
under *Expose additional parameters as inputs* — seeds, steps, CFG, prompt text.
Ticking one adds an optional input handle with the value's inferred type
(`bool`, `int`, `float`, `str`). Inputs that are ComfyUI connections
(`[sourceNodeId, slot]`) are never offered; they're wired inside the workflow.

Connected values are injected into `prompt[nodeId].inputs[field]` before
submission. A connected image, audio, or video ref is uploaded to the ComfyUI
server first (`POST /upload/image`, which ComfyUI accepts for any input file) and
the stored filename is substituted. The stored `workflow` property is never
mutated — the node deep-clones it per run.

### Outputs

This is a streaming-output node. When a save node finishes, its files are
downloaded from `/view` immediately and emitted on that node's slot, one media
ref per file, so a batch of four images produces four frames rather than one
list. Cached nodes never emit an `executed` event, so after the run the node
reconciles anything it missed from `/history/<prompt_id>`.

A final frame carries ComfyUI's raw history payload on the static `output` slot
(`dict[str, any]`).

Non-streaming consumers get the same data buffered: `process()` drains the
generator and merges frames, collapsing repeated slots into arrays.

### Progress and logs

The node forwards ComfyUI's WebSocket lifecycle to the NodeTool run log:
execution start, `execution_cached` (as a count of reused nodes), the class name
of each executing node, and errors. Sampler `progress` events become
`node_progress` messages, so the node shows a progress bar.

---

## Run ComfyUI Workflow (Worker)

Use this when ComfyUI runs on a rented GPU and should not be exposed. Deploy the
`ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` image (selectable as
*NodeTool Worker + ComfyUI* in the worker profile dialog — see
[Worker Deployment](worker-deployment.md)). That worker runs a co-located,
loopback-only ComfyUI and proxies it over the bridge; ComfyUI's own ports are
never published.

### Properties

| Property | Default | Meaning |
|---|---|---|
| `worker_url` | `ws://127.0.0.1:7777/ws` | WebSocket URL of the worker. |
| `worker_token` | *empty* | Bearer token, when the worker requires one. |
| `workflow` | *empty* | Same API-format prompt JSON as the direct node. |
| `timeout` | `600` | Seconds, passed through to the worker. |
| `previews` | `false` | Stream ComfyUI preview images during the run. Costs bandwidth. |

### How a run works

The node opens a one-shot bridge connection (no auto-reconnect), checks
`supportsComfy()`, and calls `comfy.execute`. The capability check requires both
bridge protocol **v3+** and `worker.status.comfy.enabled: true`; a worker built
from the plain image fails it with a message naming the ComfyUI image. The bridge
is closed whether the run succeeds or throws.

Media inputs are **not** uploaded over HTTP here. Each one is sent as a bridge
blob and referenced from the workflow JSON as `"blob:<key>"`; the worker uploads
it into ComfyUI's input directory and splices in the real filename before
submitting. Scalar inputs are written into the prompt directly, same as the
direct node.

Lifecycle events arrive as dedicated `comfy.event` frames rather than generic
`progress` frames, in emission order:

```
queued → queue → started/cached → executing → progress → node_output → preview → completed/cancelled
```

The node logs `started`, `cached`, and `executing`, and turns `progress`
(`value`/`max`) into `node_progress`.

### Outputs

Output files come back as blobs on the terminal result. Each blob's media kind
is sniffed from its leading bytes — PNG, JPEG, GIF, RIFF (WEBP/WAVE/AVI),
`ftyp` boxes for MP4/MOV, OGG, and ID3 — and emitted as a base64 media ref on a
slot named after the worker's blob key. ComfyUI's raw outputs land on the static
`output` slot.

---

## The `comfy.*` bridge surface

`comfy.execute` is the only call a shipped node makes, but the bridge exposes the
whole proxy family. Every method is gated by `supportsComfy()`.

| Bridge method | Wire message | Returns |
|---|---|---|
| `comfyExecute(workflow, options, onEvent, requestId)` | `comfy.execute` | `{prompt_id, status, outputs, blobs}` |
| `cancelComfyExecute(requestId)` | `cancel` | — (settles the local promise itself) |
| `comfyQueue()` | `comfy.queue` | `{queue_running, queue_pending}` |
| `comfyInterrupt()` | `comfy.interrupt` | — (global stop; admin-only) |
| `comfyCancelPrompt(promptId)` | `comfy.cancel` | — (per-prompt, the user-facing cancel) |
| `comfyUpload(filename, bytes, options)` | `comfy.upload` | stored file info |
| `comfyView(filename, options)` | `comfy.view` | file bytes |
| `comfyObjectInfo()` | `comfy.object_info` | the node catalog, unwrapped |
| `comfySystemStats()` | `comfy.system_stats` | ComfyUI system/VRAM stats |
| `comfyStatus()` | `comfy.status` | `{enabled, url, reachable, system_stats, queue_remaining, error}` |
| `comfyFree(options)` | `comfy.free` | — (unload models from VRAM) |
| `comfyModelsList(folder?)` | `comfy.models.list` | model files; `folder` filters client-side |
| `comfyModelsDownload(req, onProgress, requestId)` | `comfy.models.download` | — (streams `progress` frames) |
| `comfyModelsDelete(folder, filename)` | `comfy.models.delete` | `boolean` |

Two shapes are easy to get wrong. `comfy.execute` takes its prompt under
`workflow`, not `prompt`. `comfy.models.download` takes a nested
`source: { type: "huggingface", repo_id, path, revision? }` or
`source: { type: "url", url }` — a flat `{url}` or `{repo_id}` is rejected by the
worker. `comfy.models.list` has no server-side folder filter, so the bridge
fetches the whole volume and narrows it locally.

Cancel a run with `cancelComfyExecute(requestId)` rather than the bare `cancel`:
it sends the cancel frame *and* settles the local promise, because the worker may
never emit a terminal frame after a cancel.

Wire-level details live in [Python Bridge Protocol](python-bridge-protocol.md);
the authoritative field reference is `docs/comfy-proxy.md` in `nodetool-core`.

---

## Known limitations

- **The worker node has no workflow loader in the editor.** Only
  `lib.comfy.RunWorkflow` gets the dedicated node UI with the Load Workflow
  button and schema-derived handles. For `lib.comfy.RunWorkflowOnWorker` you
  paste the API-format JSON into the `workflow` property and add dynamic input
  handles yourself, keyed `<comfyNodeId>:<field>`.
- **The worker node's output slot names come from the worker**, not from the
  `<comfyNodeId>:<kind>` convention the direct node and the schema parser use.
  Check the emitted keys against a real run before wiring downstream nodes.
- **The worker node does not stream outputs.** It returns everything on
  completion, while the direct node yields each file as it lands.
- **`include_temp` is not exposed on either node.** The bridge supports it
  (`ComfyExecuteOptions.includeTemp`), so preview-node outputs can be fetched
  from code, but no node property surfaces it.

---

## Troubleshooting

| Message | Cause |
|---|---|
| `This looks like a ComfyUI UI workflow…` | Exported with the regular save. Re-export with **Save (API Format)**. |
| `No ComfyUI prompt found in this PNG` | The PNG was written without metadata, or re-encoded by another tool. |
| `Node "<id>" is not in API format` | The JSON isn't a map of node id to `{ class_type, inputs }`. |
| `ComfyUI workflow is not valid JSON` | The `workflow` property holds malformed JSON. |
| `WebSocket connection failed` | Wrong host/port, or ComfyUI isn't listening. Check `endpoint`. |
| `Submit failed (400)` | ComfyUI rejected the prompt — usually a missing model or an unknown `class_type` on that server. The response body is included. |
| `Timeout waiting for ComfyUI result` | The run exceeded `timeout` seconds. Raise it for large video or upscale graphs. |
| `The connected worker does not front a ComfyUI server` | The worker isn't running the ComfyUI image, or reports `comfy.enabled: false`. |

---

## Where the code lives

| Concern | File |
|---|---|
| Both nodes | `packages/integration-nodes/src/nodes/comfy.ts` |
| Direct HTTP/WS executor | `packages/runtime/src/comfy-executor.ts` |
| `comfy.*` bridge methods | `packages/runtime/src/python-bridge-base.ts` |
| Bridge types | `packages/runtime/src/python-bridge-types.ts` |
| Schema parser (browser) | `web/src/utils/comfyDynamicSchema.ts` |
| Editor node + loader | `web/src/components/node/DynamicComfySchemaNode/` |

## Related

- [Worker Deployment](worker-deployment.md) — renting a GPU and picking the ComfyUI worker image
- [Python Bridge Protocol](python-bridge-protocol.md) — the `comfy.*` message family on the wire
- [Comparisons](comparisons.md) — how NodeTool and ComfyUI differ as tools
