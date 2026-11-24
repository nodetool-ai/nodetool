---
layout: page
title: "ComfyUI from Code"
description: "How the ComfyUI nodes work underneath: the derived workflow contract, the Comfy API v2 path, the worker bridge, setting a workflow from code, and running one from the CLI, the DSL, or the API."
---

This page is for developers and operators who drive the ComfyUI nodes from code, an agent, or a server. Using the nodes from the editor is covered in [ComfyUI](../comfyui.md), [ComfyUI Setup](../comfyui-setup.md) and [ComfyUI Recipes](../comfyui-recipes.md).

> **Runs:** on your ComfyUI server, a NodeTool GPU worker, or Comfy Cloud. **Needs:** a NodeTool checkout for the CLI examples, and a reachable ComfyUI endpoint or `COMFY_API_KEY`. **Hardware:** whatever the workflow's models need on the server.
{: .callout-note}

---

## Where the nodes appear

The three nodes live in the `lib.comfy` namespace and ship in the built-in `base` node pack, so every install registers them: `lib.comfy.RunWorkflow`, `lib.comfy.RunWorkflowOnWorker` and `lib.comfy.RunWorkflowOnCloud`. A server on the curated cloud profile (`NODETOOL_NODE_PROFILE=cloud`, the production default) allowlists the three runners by name and drops the rest of the namespace.

If they don't appear in the node menu, `lib.comfy` is in the **Developer Tools** group of `web/src/config/optionalNodePacks.ts`, which is hidden from the browsable namespace tree until you reveal it. Search, paste, and saved workflows resolve the nodes either way.

| | `lib.comfy.RunWorkflow` | `lib.comfy.RunWorkflowOnWorker` | `lib.comfy.RunWorkflowOnCloud` |
|---|---|---|---|
| Transport | ComfyUI's own `/prompt`, `/ws`, `/view`, `/history`, or the Comfy API v2 | The worker bridge's `comfy.*` messages, or the Comfy API v2 | `@comfyorg/sdk` over the Comfy API v2 |
| API | `native` (default) or `v2`, from the `api` property | Bridge, or v2 when the worker reports `comfy.api_v2` | v2 |
| Auth | None | Worker bearer token in a node property | The `COMFY_API_KEY` secret |
| Outputs | Streamed, one frame per file | Buffered on the bridge path, streamed on the v2 path | Streamed, one frame per file |

---

## The derived workflow contract

A Comfy workflow (`run_mode: "comfy"`) has the same contract as a NodeTool workflow, and its stored graph holds only ComfyUI nodes. You can pick it wherever a workflow is accepted: `run_workflow`, a mini app operation, an asset transform, the Workflow node, or the SDK interface.

NodeTool derives the contract from the graph. It finds one input per `LoadImage`, `LoadAudio` and `LoadVideo` node, one `prompt` input for the positive prompt, and one output per `Save*` node. A second input or output of the same kind gets a numbered name, such as `image_2`, so adding a node can change a name.

A subgraph runs as one Comfy job when it holds ComfyUI nodes and no other runnable nodes besides Input and Output nodes.

The parser is `packages/integration-nodes/src/nodes/comfy-schema.ts`. Every dynamic handle is keyed `<comfyNodeId>:<field>` for inputs and `<comfyNodeId>:<image|audio|video>` for outputs. The editor loader sends the JSON or PNG to `POST /api/comfy/resolve-workflow` and shows what comes back.

Connected values are injected into `prompt[nodeId].inputs[field]` before submission. On the direct node, a connected image, audio, or video ref is uploaded with `POST /upload/image` first and the stored filename is substituted. The stored `workflow` property is never mutated, because the node deep-clones it per run.

### Setting the workflow without the editor

A graph created over the API, by an agent, or from a file can set `workflow`
directly and leave `dynamic_inputs` and `dynamic_outputs` empty. Before every
run the server derives the same handles from `workflow` and merges them under
any saved on the node, so an edge from `15:image` or into `4:text` works
without the workflow ever being opened in the editor. When the editor opens
such a node, it writes the derived handles onto it so they show on the canvas.

---

## The direct node's run

The direct node submits the prompt to `/prompt`, follows the run on ComfyUI's WebSocket, and downloads each output file from `/view` as the node that produced it finishes. Cached nodes never emit an `executed` event, so after the run the node reconciles anything it missed from `/history/<prompt_id>`. A final frame carries ComfyUI's raw history payload on the static `output` slot (`dict[str, any]`). Non-streaming consumers get the same data buffered: `process()` drains the generator and merges frames, collapsing repeated slots into arrays.

The node forwards ComfyUI's WebSocket lifecycle to the run log: execution start, `execution_cached` (as a count of reused nodes), the class name of each executing node, and errors. Sampler `progress` events become `node_progress` messages. Cancelling the run posts `/interrupt` and closes the WebSocket, and the node then fails with `ComfyUI execution was canceled`.

An `endpoint` is a host:port or an `http://` or `https://` URL. A bare host:port gets `http://`, and the WebSocket scheme follows the HTTP one. A `ws://` or `wss://` URL is not accepted.

---

## Using the v2 API

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

### comfy-api-proxy

ComfyUI core does not serve `/api/v2` yet, so a local ComfyUI needs Comfy-Org's own adapter in front of it. It translates v2 onto the native protocol:

```bash
pip install comfy-api-proxy
comfy-api-proxy --comfyui http://127.0.0.1:8188 --port 8189
```

Then set `endpoint` to `127.0.0.1:8189` and `api` to `v2`. Leaving `api` on `v2` while `endpoint` points at a plain ComfyUI gets a `404` on `/api/v2/jobs`. No API key is sent on this path, so the proxy has to accept an unauthenticated submit. Once ComfyUI core serves `/api/v2`, the proxy is unnecessary and `v2` becomes the default.

---

## The worker node

Use this when ComfyUI runs on a rented GPU and should not be exposed. Deploy the
`ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` image (selectable as
*NodeTool Worker + ComfyUI* in the worker profile dialog — see
[Worker Deployment](../worker-deployment.md)). That worker runs a co-located,
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

Uploads, `429` retry, SSE with polling fallback, and cancel work as in
[Using the v2 API](#using-the-v2-api). No shipped worker image reports the flag
yet, so every worker takes the bridge path.

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

On the v2 path each finished file is emitted on its own slot, with the slot
keys and job manifest described in [Using the v2 API](#using-the-v2-api).

On the bridge path output files come back as blobs on the terminal result. Each
blob's media kind is sniffed from its leading bytes (PNG, JPEG, GIF, RIFF for
WEBP/WAVE/AVI, `ftyp` boxes for MP4/MOV, OGG, and ID3) and emitted as a base64
media ref on a slot named after the worker's blob key. ComfyUI's raw outputs land
on the static `output` slot.


---

## The Comfy Cloud node

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

The node has the same **Load Workflow** button and schema-derived handles as the direct node. See [Loading a workflow](../comfyui.md#loading-a-workflow) and [What becomes an input or an output](../comfyui.md#what-becomes-an-input-or-an-output).

### How a run works

Each dynamic input keyed `<comfyNodeId>:<field>` is written into the per-run
copy of the prompt at `prompt[id].inputs[field]`: a scalar goes in as it is, and a connected image,
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
its own slot with the keys described in [Using the v2 API](#using-the-v2-api).

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

## Bundled templates and catalogs

The Comfy Cloud model picker includes official ComfyUI API templates alongside
the existing image-to-video workflows. Z-Image Turbo, Krea 2 Turbo, MOSS Image
and Qwen Image 2.1 generate images. Hunyuan Video 1.5 and Wan 2.2 A14B generate
video from text. MiniMax H3 and FastH3 text-to-video templates require the
existing `NODETOOL_COMFY_ENABLE_RESTRICTED_LICENSE_MODELS=1` opt-in where their
model licenses permit use.

The imports come from the API-format graphs in
[Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates/tree/1ae390968e323dba24a6991d1860ded051f5a79b/benchmarks).
The source revision and input bindings are pinned in
[`scripts/comfy-templates/catalog.mjs`](https://github.com/nodetool-ai/nodetool/blob/main/scripts/comfy-templates/catalog.mjs).
These benchmark graphs supply the curated examples. The broader provider
catalog comes from the non-partner templates in the same repository and uses
model ids beginning with `comfyui-gpu/`, displayed as **(Comfy GPU)**.
It covers image generation and editing, video generation and editing, reference
video, music, speech, audio transforms, text generation and image-to-3D.

At execution, NodeTool reads Cloud's node schemas, converts the selected saved
template to an API prompt, binds the request's inputs, uploads its media and
submits one GPU job. Templates with missing Cloud nodes, partner API nodes or
incompatible widget layouts fail before submission. Input counts are checked
before uploading. Text workflows do not advertise tool calling.

Templates needing inputs outside a provider method's contract are recorded
with exclusion reasons in `comfy-gpu-catalog.json`. This includes mask-editor
workflows and transforms requiring several independent audio recordings.
Template metadata is a source catalog, not proof that every account currently
has the referenced models installed. Live render verification requires a key.

Regenerate from the checked-in JSON snapshots with:

```bash
node scripts/comfy-templates/generate.mjs
node scripts/comfy-templates/generate.mjs --check
node scripts/comfy-templates/gpu-catalog.mjs
node scripts/comfy-templates/gpu-catalog.mjs --check
```

The `Comfy *` examples are compiled from UI-format templates by
`scripts/comfy-templates/ui-examples.mjs`. `--refresh` keeps only the templates
whose values and models Comfy Cloud's node catalog accepts. A kept template has
passed that static check, and only a few have run. Examples tagged `partner` use
Comfy's paid partner nodes.

`node scripts/comfy-templates/thumbnails.mjs` stores each template's gallery
image from the pinned revision as the example thumbnail. Audio templates with
no gallery image keep the default tile.

`--refresh` downloads only the selected JSON files from the pinned revision.
It does not clone the repository or download weights or sample media. When
changing the revision, review node availability, model filenames and bindings
before refreshing. Output socket names are extracted from the corresponding
UI templates into
[`sockets.json`](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/tests/fixtures/comfy-templates/sockets.json),
so saved connections use the same names as the Comfy editor catalog.
The template license is MIT. Model licenses apply separately.

Headless validation checks the native graph's structure and its execution
runner. Comfy Cloud validates the remote node classes, model files and input
types when the job is submitted.

## Comfy Router internals

- **Catalog**: `comfy-router-catalog.ts` lists each model with the NodeTool
  tasks it serves, generated by `scripts/generate-comfy-router-catalog.mjs` from
  every schema's input and output modalities and required fields. Run it with
  `COMFY_API_KEY` set to pick up new models. At runtime the table is
  intersected with the live `GET /v2/models` listing so retired models drop
  out. 3D models, audio-in models, mask-only editors and models that take their
  source video only as a public URL are left out.
- **Requests**: each model takes its provider's native JSON. The provider reads
  the model's input schema (`/v2/models/{id}/openapi.json`) and sets only the
  fields it declares, coercing enums and numbers. Media goes inline as a data
  URI, or as raw base64 for fields that say so, since the Router has no upload
  route. Native envelopes are built where a schema uses one: Vertex
  `instances[]` (Veo), `content[]` parts (Seedance), Gemini `contents`, Qwen
  `input.messages`, Wan `input.media` items and ElevenLabs `inputs[]`. A few
  required fields the schema describes only in prose, such as Krea's
  `resolution`, have a per-model preset. A required field the request cannot
  fill fails before submitting.
- **Queue**: runs submit to `/requests`, poll the status route honouring
  `Retry-After`, then collect the native result; cancelling a run cancels the
  queued request. Output media is found in the native result (URLs, base64
  fields) or read as raw bytes.
- **Chat**: Anthropic Messages for `anthropic/*`, Gemini `contents` when the
  schema declares it, OpenAI chat completions otherwise, with tool calls. The
  reply arrives whole, as one chunk.
- **Cost**: the Router reports credits per run (`X-Comfy-Credits-Used`); NodeTool
  does not convert them to a cost record yet.
- **Open weights**: these are partner APIs. For an open-weights run, use a
  ComfyUI graph with open models through the nodes above.
- `comfy-router-manifest.ts` lists the sizes, aspect ratios, resolutions and
  durations each model accepts. `npm run generate:comfy-manifest` builds it from
  the OpenAPI documents, including limits that only a field description states.
  A request takes the model's spelling, a size fits its pixel area, and a value
  the model does not accept is dropped with a warning. Model pickers offer the
  same lists. A field in `unparsed` is not constrained.

---

## The `comfy.*` bridge surface

`comfy.execute` is the only call a shipped node makes, but the bridge exposes the
whole proxy family. The bridge does not check `supportsComfy()` for you, so callers test it first.

| Bridge method | Wire message | Returns |
|---|---|---|
| `comfyExecute(workflow, options, onEvent, requestId)` | `comfy.execute` | `{prompt_id, status, outputs, blobs}` |
| `cancelComfyExecute(requestId)` | `cancel` | — (rejects the local promise itself) |
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
it sends the cancel frame *and* rejects the local promise, because the worker may
never emit a terminal frame after a cancel.

Wire-level details live in [Python Bridge Protocol](../python-bridge-protocol.md);
the authoritative field reference is `docs/comfy-proxy.md` in `nodetool-core`.

---

## Design notes

The `comfy.*` bridge family stays until a worker image reports `comfy.api_v2`, which is a `nodetool-core` change. The direct node's `v2` stays opt-in while a local ComfyUI needs `comfy-api-proxy` in front of it. The design is `docs/superpowers/specs/2026-09-05-comfy-sdk-integration-design.md` in the repository (engineering specs are not part of the published site).

## Where the code lives

| Concern | File |
|---|---|
| Direct and worker nodes | `packages/integration-nodes/src/nodes/comfy.ts` |
| Cloud node | `packages/integration-nodes/src/nodes/comfy-cloud.ts` |
| Comfy API v2 transport and runner | `packages/integration-nodes/src/nodes/comfy-sdk.ts` (`cloudTransport` for Comfy Cloud, `v2Transport(baseUrl, apiKey?)` for the worker and direct v2 paths) |
| Direct HTTP/WS executor | `packages/runtime/src/comfy-executor.ts` |
| `comfy.*` bridge methods | `packages/runtime/src/python-bridge-base.ts` |
| Bridge types | `packages/runtime/src/python-bridge-types.ts` |
| Schema parser (browser) | `web/src/utils/comfyDynamicSchema.ts` |
| Editor node and loader | `web/src/components/node/DynamicComfySchemaNode/` |

---

## Running it without the editor

### The CLI harnesses

`validate` first, because it costs nothing:

```bash
npm run dev:nodetool -- validate <workflow_id>
npm run dev:nodetool -- validate comfy-graph.json --json
```

It checks the **NodeTool** graph: unknown node types, missing required
properties, dangling or mis-typed edges, and model properties naming a provider
or a model id that does not exist (which is what catches a bad model on the
`EnhancePrompt` node in Recipe 1). It never opens a socket to ComfyUI, so
everything inside the `workflow` string is invisible to it. A missing
checkpoint, an uninstalled custom node, and a `class_type` that server does not
have all pass validation and fail at submit with `Submit failed (400)`. An empty
`workflow` property passes too, and the node raises
`ComfyUI workflow is required` at run time.

Then `debug`, which runs the graph and keeps everything it emitted:

```bash
npm run dev:nodetool -- debug <workflow_id>
npm run dev:nodetool -- debug comfy-graph.json --params '{"brief":"a red bicycle"}'
npm run dev:nodetool -- debug <workflow_id> --trace
```

The bundle's `server/messages.jsonl` holds the ComfyUI lifecycle the node
forwards into the run log: execution start, the count of reused nodes, the class
name of each executing node, sampler progress, and the error text ComfyUI
returned. That is the ComfyUI console without a ComfyUI browser tab.
`--watch` re-runs a file target on every save and prints a diff of the verdict.

To just run it:

```bash
npm run dev:nodetool -- workflows run <workflow_id> --params '{"brief":"a red bicycle"}'
npm run dev:nodetool -- run comfy-graph.ts --json
```

With `--json`, an image or video payload over 64 KiB is written to
`nodetool-output/<job_id>/payload-N.<ext>` and appears as a `{"$file": …}`
reference instead of being inlined. Flag reference:
[CLI › validate](../cli.md#nodetool-validate-workflow_id_or_file),
[CLI › debug](../cli.md#nodetool-debug-workflow_id_or_file),
[Harness reference](../harnesses.md).

### The DSL

`packages/dsl/src/generated/lib.comfy.ts` exports one function per node:
`runWorkflow`, `runWorkflowOnWorker`, and `runWorkflowOnCloud`. A file like this
runs with `nodetool run`:

```typescript
import { libComfy, output, workflow } from "@nodetool-ai/dsl";

const prompt = {
  "3": {
    class_type: "KSampler",
    inputs: { seed: 42, steps: 20, cfg: 7, model: ["4", 0] }
  }
};

const comfy = libComfy.runWorkflow({
  endpoint: "127.0.0.1:8188",
  workflow: JSON.stringify(prompt),
  timeout: 600
});

export const comfyRun = workflow(
  output.output({ name: "result", value: comfy.output() })
);
```

**Dynamic inputs type-check, dynamic outputs do not resolve.** Because the node
supports dynamic inputs, `RunWorkflowInputs` names the four static properties
(`endpoint`, `api`, `workflow`, `timeout`) and also has a
`[name: string]: unknown` index signature, so a `"6:text"` key compiles. A
literal under that key is stored as a dynamic property and injected into
`prompt["6"].inputs.text` at run time. An upstream node's output handle under a
key such as `"10:image"` becomes an edge into that handle, which is how a
NodeTool media ref reaches a `Load*` node.

The generated function declares one output slot, `output`, which carries the raw
ComfyUI history (the job manifest when `api` is `v2`). It declares none of the `<comfyNodeId>:<kind>` slots, because
they come from a workflow the generator has never seen, and
`comfy.output("9:image")` throws `Unknown output slot '9:image'`. A DSL script
therefore cannot select the per-file image, audio or video slots. Two ways
around it:

1. **Read `output`** when the script only needs ComfyUI's history payload.
2. **Author the graph in the editor** when downstream nodes need the media on a
   save slot. Run the saved graph by id from the CLI or the API.

### The API

A saved workflow containing a ComfyUI node runs like any other:

```bash
curl -X POST "http://localhost:7777/api/workflows/YOUR_WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"params": {"brief": "a red bicycle"}}'
```

The response is one JSON object with `job_id`, `workflow_id`, `status`,
`outputs`, `error`, `message_count`, and `background`. `outputs` is keyed by
output-node name, so the comfy slot reaches the caller under whatever you named
the `nodetool.output.Output` node wired to it.

`params` is keyed by **input-node name**, not by comfy handle. A workflow whose
`6:text` is fed by a literal takes no parameter at all. Put a
a String Input node in front of the handle and its `name` becomes the
key. The route does not stream, so per-node progress and the ComfyUI lifecycle
lines need the `/ws` WebSocket instead. Full shapes:
[API Reference](../api-reference.md), [WebSocket API](../websocket-api.md).

---

## Related

- [ComfyUI](../comfyui.md): the three nodes, loading a workflow, and troubleshooting
- [ComfyUI Setup](../comfyui-setup.md): connecting a local ComfyUI or Comfy Cloud
- [ComfyUI Recipes](../comfyui-recipes.md): composing a ComfyUI node with the rest of a graph
- [Worker Deployment](../worker-deployment.md#comfyui-on-a-worker): renting a GPU and running ComfyUI on a worker
- [Python Bridge Protocol](../python-bridge-protocol.md): the `comfy.*` message family on the wire
