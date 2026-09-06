---
layout: page
title: "ComfyUI"
description: "Run ComfyUI workflows inside NodeTool: directly against a ComfyUI server, proxied over a NodeTool GPU worker, or on Comfy Cloud."
---

NodeTool runs ComfyUI workflows as nodes in a NodeTool graph. You export a
workflow from ComfyUI in **API (prompt) format**, load it into a node, and its
`Load*` nodes become typed inputs while its `Save*` nodes become typed outputs.
Everything around it — asset handling, LLM steps, mini apps — stays NodeTool's.

Three nodes cover three topologies:

| | `lib.comfy.RunWorkflow` | `lib.comfy.RunWorkflowOnWorker` | `lib.comfy.RunWorkflowOnCloud` |
|---|---|---|---|
| Title | Run ComfyUI Workflow | Run ComfyUI Workflow (Worker) | Run ComfyUI Workflow (Comfy Cloud) |
| Talks to | Any ComfyUI HTTP/WebSocket endpoint | A NodeTool worker that fronts ComfyUI | Comfy Cloud, `https://cloud.comfy.org` |
| Transport | ComfyUI's own `/prompt`, `/ws`, `/view`, `/history`, or the Comfy API v2 | The worker bridge's `comfy.*` messages, or the Comfy API v2 | `@comfyorg/sdk` over the Comfy API v2 |
| API | `native` (default) or `v2`, from the `api` property | Bridge, or v2 when the worker reports `comfy.api_v2` | v2 |
| Auth | None | Worker bearer token in a node property | The `COMFY_API_KEY` secret |
| GPU | Yours | The rented worker's | Comfy's |
| ComfyUI reachable from NodeTool? | Yes, directly | No, loopback-only inside the worker | Not applicable |
| Workflow loader in the editor | Yes | No (see [limitations](#known-limitations)) | Yes |
| Outputs | Streamed, one frame per file | Buffered on the bridge path, streamed on the v2 path | Streamed, one frame per file |

All three live in the `lib.comfy` namespace and ship in the built-in `base` node
pack, so every install registers them — including a server running the curated
cloud profile (`NODETOOL_NODE_PROFILE=cloud`, the production default), which
allowlists the three runners by name while dropping the rest of the namespace.

If they don't appear in the node menu, that is the menu's own decluttering, not
a gate: `lib.comfy` sits in the **Developer Tools** group of
`web/src/config/optionalNodePacks.ts`, hidden from the browsable namespace tree
until you reveal that group. Search, paste, and saved workflows resolve the
nodes either way.

---

## Quickstart

From a workflow you already have to a run inside NodeTool.

1. **Export in API format.** In ComfyUI use **Save (API Format)**. The regular
   save writes the UI format, which every node here rejects with a message
   saying exactly that.
2. **Get an endpoint.** A ComfyUI already listening on `127.0.0.1:8188` needs
   nothing further. With no local install and no GPU, use the Cloud node and a
   `COMFY_API_KEY` instead. Both paths, and the rented-GPU one between them, are
   in [ComfyUI Setup](comfyui-setup.md).
3. **Add the node.** Search the node menu for *Run ComfyUI Workflow*. Searching
   finds it even though `lib.comfy` is collapsed out of the browsable tree.
4. **Load the workflow.** Use the **Load Workflow** button in the node header:
   paste the JSON, drop the `.json`, or drop a `.png` that ComfyUI wrote. The
   workflow's `Load*` nodes become typed input handles and its `Save*` nodes
   become typed output handles.
5. **Run it.** Outputs arrive one file at a time as each save node finishes.

If the submit fails, the cause is usually a model or custom node the server
doesn't have rather than anything in NodeTool. [Troubleshooting](#troubleshooting)
lists the messages.

---

## When to reach for a ComfyUI node

NodeTool generates images and video with its own nodes.
`nodetool.image.TextToImage` and its siblings take a `model` property and route
to whichever provider owns that model, so switching models is a dropdown change
and there is no graph to maintain. That is the shorter path for most generation.

A ComfyUI node earns its place when the graph itself is the point:

- **The workflow already exists.** A tuned ControlNet chain, a multi-pass
  upscale, a regional-prompting setup runs as it is, with no porting.
- **The technique lives in custom nodes.** Anything a ComfyUI extension does
  that no NodeTool node covers stays available, because the workflow executes on
  ComfyUI.
- **The weights are yours.** Checkpoints and LoRAs on your own disk never leave
  the machine that runs them.

The two compose rather than compete: a ComfyUI node is one node in a NodeTool
graph, so an agent can write its prompt, a dataframe can drive a batch of runs,
and its stills can feed a video assembly. Those patterns are in
[ComfyUI Recipes](comfyui-recipes.md).

---

## Run ComfyUI Workflow

Point the node at a ComfyUI server you can reach. It submits the prompt over
HTTP, follows the run on ComfyUI's WebSocket, and downloads each output file as
the node that produced it finishes. That is the default `native` API; setting
`api` to `v2` swaps the transport, see [Using the v2 API](#using-the-v2-api).

### Properties

| Property | Default | Meaning |
|---|---|---|
| `endpoint` | `127.0.0.1:8188` | Host:port or full URL. `https://…` and `wss://` proxies (RunPod pods, Cloudflare tunnels) work — the scheme is derived from the endpoint. |
| `workflow` | *empty* | The API-format prompt as a JSON string: a map of node id to `{ class_type, inputs }`. |
| `timeout` | `600` | Seconds to wait for the run. Also bounds the WebSocket handshake and the submit request. |
| `api` | `native` | Which API the endpoint speaks. `native` is ComfyUI's own `/prompt` plus WebSocket. `v2` treats `endpoint` as a Comfy API v2 origin. |

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

Cancelling the run posts `/interrupt` to the ComfyUI server and closes the
WebSocket, so the prompt stops there instead of running on with nothing
listening. The node then fails with `ComfyUI execution was canceled`.

### Using the v2 API

Set `api` to `v2` and the node sends the workflow through the same Comfy API v2
client the Cloud node uses, pointed at `endpoint` instead of
`https://cloud.comfy.org`. Two things serve that API in front of a local
ComfyUI:

- **`comfy-api-proxy`**, Comfy-Org's Python adapter, which translates v2 onto
  the native protocol. `pip install comfy-api-proxy`, then
  `comfy-api-proxy --comfyui http://127.0.0.1:8188 --port 8189`, and point
  `endpoint` at port 8189.
- **ComfyUI itself**, once core serves `/api/v2`. Then the proxy is unnecessary
  and `v2` becomes the default.

No API key is sent on this path, so the endpoint has to accept an unauthenticated
submit. Everything else matches the Cloud node's run: the submit carries an
idempotency key and retries a `429` for up to 60 seconds, media inputs are
uploaded through the asset API and deduplicated by a blake3 hash of the bytes,
the run is followed over SSE with polling as the fallback when the stream drops,
and cancelling the NodeTool run calls the job's cancel endpoint.

Outputs use the same `<comfyNodeId>:<kind>` convention as the Cloud node rather
than ComfyUI's history payload: `image`, `audio` and `video` carry a media ref,
`text` carries the decoded string, and `file` and `latent` carry a document ref.
The static `output` slot carries the same job manifest the Cloud node returns:
`job_id`, `status`, and one entry per output file.

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

The node opens a one-shot bridge connection (no auto-reconnect), because the
bridge is how it reads `worker.status.comfy`, and that status picks the path.

#### The v2 path

A worker whose status reports `comfy.api_v2: true` serves the Comfy API v2 on its
own port 7777, behind the bearer token it already requires, with ComfyUI still
loopback-only. The node closes the bridge, turns `worker_url` into an HTTP origin
(`wss://host/ws` becomes `https://host`), and runs the workflow through the same
v2 client the Cloud node uses, with `worker_token` as the key.

Media inputs go through the asset API and are deduplicated by a blake3 hash of
the bytes. The submit carries an idempotency key and retries a `429` for up to 60
seconds, the run is followed over SSE with polling as the fallback, and
cancelling calls the job's cancel endpoint.

The worker image that reports the flag is a `nodetool-core` change and has not
shipped, so today every worker takes the bridge path.

#### The bridge path

Without the flag the node calls `comfy.execute` over the same connection, and
closes it whether the run succeeds or throws. This path also requires
`supportsComfy()`: bridge protocol **v3+** and `worker.status.comfy.enabled: true`.
A worker built from the plain image fails that check with a message naming the
ComfyUI image.

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

On the v2 path each finished file is emitted on its own slot, keyed
`<comfyNodeId>:<kind>`: `image`, `audio` and `video` carry a media ref, `text`
carries the decoded string, and `file` and `latent` carry a document ref. The
static `output` slot carries the job manifest, `job_id` and `status` and one
entry per output file. That is the convention the direct and Cloud nodes use.

On the bridge path output files come back as blobs on the terminal result. Each
blob's media kind is sniffed from its leading bytes (PNG, JPEG, GIF, RIFF for
WEBP/WAVE/AVI, `ftyp` boxes for MP4/MOV, OGG, and ID3) and emitted as a base64
media ref on a slot named after the worker's blob key. ComfyUI's raw outputs land
on the static `output` slot.

---

## Run ComfyUI Workflow (Comfy Cloud)

Use this when you have no GPU and no ComfyUI install. The node submits the same
API-format prompt to [Comfy Cloud](https://cloud.comfy.org) through the official
`@comfyorg/sdk`, which speaks the Comfy API v2: `POST /api/v2/jobs` to submit,
`/api/v2/assets` for media inputs, and an SSE stream at
`/api/v2/jobs/{id}/events` for the run. Base URL is `https://cloud.comfy.org`
(the SDK reads `COMFY_BASE_URL` from the server's environment if you point it
somewhere else) and the key travels as a `Bearer` token.

Add the key first. Get one at <https://platform.comfy.org> (Comfy Cloud keys are
prefixed `comfyui-`) and store it as `COMFY_API_KEY`, either on the Comfy Cloud
card in **Settings → Models & Providers** or with
`nodetool secrets store COMFY_API_KEY`. The node declares it in
`requiredSettings`, so the editor badges it as unconfigured until it is set. The
same key is sent alongside the workflow as `extra_data.api_key_comfy_org`, which
is what authenticates any partner (API) node inside the graph.

### Properties

| Property | Default | Meaning |
|---|---|---|
| `workflow` | *empty* | The API-format prompt as a JSON string, same shape as the other two nodes. Required. |
| `timeout` | `600` | Seconds to wait for the job. Comfy caps a run at 30 minutes, 60 on Pro. |
| `previews` | `false` | Write a line to the run log for each preview frame Comfy sends. No slot carries the bitmaps. |

The node has the same **Load Workflow** button and the same schema-derived
handles as the direct node, so a pasted API-format JSON, a dropped `.json`, or a
ComfyUI `.png` all fill it in. See
[Loading a workflow](#loading-a-workflow) and
[What becomes an input or an output](#what-becomes-an-input-or-an-output).

### How a run works

The prompt is deep-cloned per run, so the stored `workflow` property is never
mutated. Each dynamic input keyed `<comfyNodeId>:<field>` is written into
`prompt[id].inputs[field]`: a scalar goes in as it is, and a connected image,
audio, or video ref is uploaded through the SDK's asset API and referenced as a
`core/ASSET` object. That upload is deduplicated by a blake3 hash of the bytes,
so re-running with the same input file uploads nothing the second time.

UI-format JSON is rejected before any request is made. Re-export from ComfyUI
with **Save (API Format)**.

While the job runs, the SSE stream drives the node: sampler progress becomes
`node_progress`, and logs, status changes and queue position go to the run log.
When the stream ends the node refreshes the job over HTTP and decides on that
status, so a deployment with no live SSE still finishes correctly. Cancelling
the NodeTool run calls the job's cancel, so the job stops on Comfy's side too
rather than running on unwatched.

### Outputs

This is a streaming-output node. Each finished file is fetched while the job is
still running, because the signed URL Comfy hands out expires, and emitted on
its own slot, keyed `<comfyNodeId>:<output type>`: `image`, `audio` and `video`
carry a media ref, `text` carries the decoded string, and anything else
(`file`, `latent`) carries a document ref.

A final frame on the static `output` slot (`dict[str, any]`) describes the
finished job: `job_id`, `status`, and one entry per output file with its
`node_id`, `name`, `type`, `content_type`, `size_bytes` and `asset_id`. The
bytes already went out on the dynamic slots, so this frame is metadata.

### Limits

Comfy's own, not NodeTool's:

- **Concurrent jobs**: 1, 3 or 5 at a time depending on the plan. A full queue
  answers `429`; the SDK waits the `Retry-After` and resubmits until a 60 second
  budget runs out, then the node fails with `Comfy queue is full: …`.
- **Runtime**: 30 minutes per job, 60 on Pro. The node's `timeout` bounds the
  NodeTool side of the same run.
- **Credit**: an account without enough credit gets `402` from the submit and
  the node fails with `Comfy account has insufficient credits: …`.

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

- **The worker node has no workflow loader in the editor.** The Load Workflow
  button and the schema-derived handles belong to `lib.comfy.RunWorkflow` and
  `lib.comfy.RunWorkflowOnCloud`, whose slot names the parser can predict. For
  `lib.comfy.RunWorkflowOnWorker` you paste the API-format JSON into the
  `workflow` property and add dynamic input handles yourself, keyed
  `<comfyNodeId>:<field>`. What keeps it out is the bridge path's slot naming
  below, which the v2 path fixes.
- **On the bridge path, the worker node's output slot names come from the
  worker**, not from the `<comfyNodeId>:<kind>` convention the direct and Cloud
  nodes and the schema parser use. Check the emitted keys against a real run
  before wiring downstream nodes. The v2 path uses the convention.
- **On the bridge path the worker node does not stream outputs.** It returns
  everything on completion. The v2 path yields each file as it lands, like the
  direct and Cloud nodes.
- **`include_temp` is not exposed on either node.** The bridge supports it
  (`ComfyExecuteOptions.includeTemp`), so preview-node outputs can be fetched
  from code, but no node property surfaces it.
- **The Cloud node reports no cost.** Comfy's v2 job response carries no cost
  field, so no provider cost record is written for a Cloud run and the Comfy
  Cloud column in a run's cost breakdown stays empty. The Comfy job id is
  written to the run log, so a run can be matched against Comfy's own billing.

The worker node's v2 path is built; the worker image that reports
`comfy.api_v2` is a `nodetool-core` change and ships separately, so the `comfy.*`
bridge family stays until it does. The direct node's `v2` stays opt-in while a
local ComfyUI needs `comfy-api-proxy` in front of it. The design is
`docs/superpowers/specs/2026-09-05-comfy-sdk-integration-design.md` in the
repository (engineering specs are not part of the published site).

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
| A submit that answers `404` on `/api/v2/jobs` | `api` is `v2` but the endpoint is a plain ComfyUI, which serves no `/api/v2`. Put `comfy-api-proxy` in front of it, or set `api` back to `native`. |
| `Comfy account has insufficient credits` | Comfy Cloud answered `402`. Top the account up at [platform.comfy.org](https://platform.comfy.org). |
| `Comfy queue is full` | Your plan's concurrent-job limit was still full 60 seconds after the first `429`. |
| `Comfy Cloud job did not finish within <n>s` | The job outlived the Cloud node's `timeout`. Raise it, up to Comfy's own 30 or 60 minute cap. |
| `COMFY_API_KEY is required to run a workflow on Comfy Cloud` | No key stored. Add it in **Settings → Models & Providers**. |
| `ComfyUI workflow is in UI-export format` | The v2 client rejected the prompt before sending it, on the Cloud node or on either `v2` path. Re-export with **Save (API Format)**. |

---

## Where the code lives

| Concern | File |
|---|---|
| Direct and worker nodes | `packages/integration-nodes/src/nodes/comfy.ts` |
| Cloud node | `packages/integration-nodes/src/nodes/comfy-cloud.ts` |
| Comfy API v2 transport and runner | `packages/integration-nodes/src/nodes/comfy-sdk.ts` — `cloudTransport` for Comfy Cloud, `v2Transport(baseUrl, apiKey?)` for the worker and direct v2 paths |
| Direct HTTP/WS executor | `packages/runtime/src/comfy-executor.ts` |
| `comfy.*` bridge methods | `packages/runtime/src/python-bridge-base.ts` |
| Bridge types | `packages/runtime/src/python-bridge-types.ts` |
| Schema parser (browser) | `web/src/utils/comfyDynamicSchema.ts` |
| Editor node + loader | `web/src/components/node/DynamicComfySchemaNode/` |

## Related

- [ComfyUI Setup](comfyui-setup.md) — getting an endpoint these nodes can reach, and what has to be installed on it
- [ComfyUI Recipes](comfyui-recipes.md) — composing a ComfyUI node with the rest of a graph, and running one headless
- [Worker Deployment](worker-deployment.md) — renting a GPU and picking the ComfyUI worker image
- [Provider Reference](providers.md) — the Comfy Cloud provider and its key
- [Python Bridge Protocol](python-bridge-protocol.md) — the `comfy.*` message family on the wire
- [Comparisons](comparisons.md) — how NodeTool and ComfyUI differ as tools
