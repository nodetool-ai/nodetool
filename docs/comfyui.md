---
layout: page
title: "ComfyUI"
description: "Run ComfyUI workflows inside NodeTool: on a ComfyUI server you run, on a NodeTool GPU worker, or on Comfy Cloud."
---

A ComfyUI workflow exported in **API (prompt) format** loads into a NodeTool node. Its
`Load*` nodes become typed inputs and its `Save*` nodes become typed outputs.

> **Runs:** on your ComfyUI server, a NodeTool GPU worker, or Comfy Cloud. **Needs:** a reachable ComfyUI server for the first two, a Comfy Cloud key for Comfy Cloud. **Hardware:** whatever the workflow's models need on the server. NodeTool does not measure it.
{: .callout-note}

---

## Quickstart

From a workflow you already have to a run inside NodeTool.

1. **Export in API format.** In ComfyUI use **Save (API Format)**. The regular
   save writes the UI format, which every ComfyUI node here rejects.
2. **Get a server.** A ComfyUI already running on your computer at
   `127.0.0.1:8188` needs nothing further. With no local install and no GPU,
   use the Comfy Cloud node and a Comfy key instead. Both paths are in
   [ComfyUI Setup](comfyui-setup.md).
3. **Add the node.** Search the node menu for *Run ComfyUI Workflow*.
4. **Load the workflow.** Use the **Load Workflow** button in the node header
   ([details](#loading-a-workflow)): paste the JSON, drop the `.json`, or drop a
   `.png` that ComfyUI wrote.
5. **Run it.** Outputs arrive one file at a time as each save node finishes.

If the submit fails, the cause is usually a model or custom node the server
doesn't have. [Troubleshooting](#troubleshooting) lists the messages.

---

## Keep a Comfy graph inside a normal workflow

To edit ComfyUI nodes in place instead of loading JSON into one node, right-click
the canvas and choose **Add Comfy subgraph**. The new Subgraph node starts as
ComfyUI's text-to-image graph and shows a `prompt` input and an image
`output`. Open it to edit the ComfyUI nodes. The node menu then lists the ComfyUI
node classes of your Comfy target (see [Choose where Comfy workflows run](#choose-where-comfy-workflows-run)).

A subgraph runs as one Comfy job when it holds ComfyUI nodes and nothing else
except Input and Output nodes. Put any NodeTool nodes the job needs, such as an
LLM that writes the prompt, outside the subgraph and connect them to its inputs.

A workflow whose graph holds only ComfyUI nodes can be used wherever NodeTool
accepts a workflow: chat, a mini app, or another workflow. How NodeTool derives
its inputs and outputs is in [ComfyUI from Code](developer/comfyui.md#the-derived-workflow-contract).

---

## When to reach for a ComfyUI node

The generic image nodes, such as Text To Image, pick a model and handle the rest.
They are the shorter path for most generation.

A ComfyUI node earns its place when the graph itself is the point:

- **The workflow already exists.** A tuned ControlNet chain, a multi-pass
  upscale, a regional-prompting setup runs as it is, with no porting.
- **The technique lives in custom nodes.** Anything a ComfyUI extension does
  that no NodeTool node covers stays available, because the workflow executes on
  ComfyUI.
- **The weights are yours.** Checkpoints and LoRAs on your own disk never leave
  the machine that runs them.

A ComfyUI node is one node in a graph, so an agent can write its prompt and a
list can drive a batch. See [ComfyUI Recipes](comfyui-recipes.md).

---

## The three nodes

| | Run ComfyUI Workflow | Run ComfyUI Workflow (Worker) | Run ComfyUI Workflow (Comfy Cloud) |
|---|---|---|---|
| Runs on | A ComfyUI server you can reach: your computer, another machine, or a rented GPU | A NodeTool GPU worker that runs ComfyUI for you | Comfy Cloud, Comfy's hosted service |
| Credential | None | The worker's token | A Comfy key |
| GPU | Yours | The rented worker's | Comfy's |
| Workflow loader in the editor | Yes | No (see [limitations](#known-limitations)) | Yes |
| Outputs | One at a time as each file is ready | All at the end of the run | One at a time as each file is ready |

Choose the first when you have a ComfyUI server, the second when you rent a GPU
and want ComfyUI kept private behind a token, and the third when you have no GPU
and no ComfyUI install. [ComfyUI Setup](comfyui-setup.md) walks through each.

### Run ComfyUI Workflow

Point the node at a ComfyUI server you can reach. It sends the workflow, shows
progress while it runs, and downloads each output file as the node that produced
it finishes.

| Property | Default | Meaning |
|---|---|---|
| `endpoint` | `127.0.0.1:8188` | The server's `host:port` or an `http://` or `https://` URL. |
| `workflow` | *empty* | The API-format workflow as JSON. The **Load Workflow** button fills it in. |
| `timeout` | `600` | Seconds to wait for the run. |
| `api` | `native` | Leave this on `native` unless you run Comfy API v2. See [ComfyUI from Code](developer/comfyui.md#using-the-v2-api). |

### Run ComfyUI Workflow (Worker)

Use this when ComfyUI runs on a GPU you rented through NodeTool and should not be
exposed to the internet. Set `worker_url` and `worker_token` from the worker's
row in the Workers panel, and fill the `workflow` property. Provisioning the
worker is covered in [Worker Deployment](worker-deployment.md#comfyui-on-a-worker).

### Run ComfyUI Workflow (Comfy Cloud)

Use this when you have no GPU and no ComfyUI install. Get a key at
[platform.comfy.org](https://platform.comfy.org) and add it on the Comfy Cloud
card in **Settings → Models & Providers**. The editor marks the node as
unconfigured until the key is set. The same key authenticates any Comfy partner
node inside the workflow.

| Property | Default | Meaning |
|---|---|---|
| `workflow` | *empty* | The API-format workflow as JSON. Required. |
| `timeout` | `600` | Seconds to wait for the job. Comfy caps a run at 30 minutes, 60 on Pro. |
| `previews` | `false` | Write a line to the run log for each preview frame Comfy sends. |

Limits come from Comfy, not NodeTool:

- **Concurrent jobs**: 1, 3 or 5 at a time depending on the plan. If the queue
  stays full for a minute the node fails with `Comfy queue is full`.
- **Runtime**: 30 minutes per job, 60 on Pro.
- **Credit**: an account without enough credit fails with
  `Comfy account has insufficient credits`.

---

## Loading a workflow

In the editor, the node header has an upload icon with the tooltip **Load Workflow**. It opens a **Load ComfyUI Workflow** dialog that accepts:

- **Pasted JSON** in API format. The regular save writes the UI format, and
  pasting it gives an error saying so.
- **A dropped `.json` file** in the same format.
- **A dropped `.png` exported by ComfyUI**, whose embedded workflow is read out
  of the image.

The dialog summarizes what it found (node count, typed inputs, outputs). Choose
**Apply** to write the workflow onto the node together with its inputs, outputs
and default values. Values you had already edited on inputs that still exist are
preserved. To set the workflow from an agent or a script, see
[ComfyUI from Code](developer/comfyui.md#setting-the-workflow-without-the-editor).

---

## What becomes an input or an output

Every input and output on a loaded node is named
**`<comfyNodeId>:<field>`**, where the id is the node's key in your API-format
export. A `CLIPTextEncode` saved as node `6` exposes `6:text`.

- **App Mode inputs come first.** If the PNG or JSON carries the ComfyUI graph and
  the author picked inputs in ComfyUI App Mode, those widgets become the inputs
  and nothing else is exposed automatically. A plain API-format export has no App
  Mode selection, so it uses the rules below.
- **Media inputs** come from `Load*` nodes such as `LoadImage`, `LoadAudio` and
  `LoadVideo`. Other nodes whose name starts with `Load` are guessed from the
  name: audio, video, or image.
- **Media outputs** come from `Save*` and `Preview*` nodes such as `SaveImage`,
  `SaveAudio` and `SaveVideo`. Each output carries one file at a time, so a batch
  of four images produces four results rather than one list.
- **Prompt text inputs** come from text-encoder nodes, such as `CLIPTextEncode`.
  Each text field becomes an optional input, so a prompt from another node can be
  wired in. Left unconnected, it keeps the exported text.
- **Everything else** (seeds, steps, CFG, sizes) is offered in the loader dialog
  as a checkbox list under *Expose additional parameters as inputs*. Ticking one
  adds an optional input. Fields that ComfyUI wires between its own nodes are
  never offered.

Connected values replace the matching field when the node runs. A connected image,
audio, or video is uploaded to the server first. The stored workflow is never
changed.

### Outputs and progress

When a save node finishes, its files are downloaded and emitted right away, one
per file. A final result on the `output` slot carries the run's raw record
(ComfyUI's history, or the job summary on Comfy Cloud). ComfyUI nodes served from
its cache are collected after the run, so a fully cached batch arrives all at once.

The node shows a progress bar while a sampler runs and writes the start, the
reused nodes and each executing node to the run log. Cancelling the run stops
the job on the ComfyUI server.

---

## Bundled workflow templates

The Comfy Cloud model pickers include official ComfyUI templates for image and
video generation, such as Z-Image Turbo, Krea 2 Turbo, Qwen Image, Hunyuan Video
1.5 and Wan 2.2. The broader catalog appears with model names ending in
**(Comfy GPU)** and covers image and video generation and editing, music, speech,
audio, text and image-to-3D.

The **Comfy** examples contain complete Comfy graphs, including ACE-Step, Stable
Audio and YuE audio workflows. Open one to see the whole graph, edit the prompts
and settings on its nodes, then run it on Comfy Cloud. Copying an example keeps
it a Comfy workflow. Examples tagged `partner` use Comfy's paid partner nodes.
All of them need a Comfy Cloud key and the nodes and model files on the Comfy
deployment, and a listed template is not proof that your account has every
model installed.

### Choose where Comfy workflows run

The selector next to the Run button sets where every Comfy workflow runs:

| Selector option | Runs on | Also needs |
|---|---|---|
| Comfy Cloud | Comfy Cloud | A Comfy key |
| ComfyUI server | A ComfyUI server you run | Its URL, in the **ComfyUI server URL** field |
| Worker | A NodeTool worker that runs ComfyUI | The worker's URL, and its token if it has one |

A target that is not configured fails the run. It never falls back to another
target. The first run log line names the target, and the node menu shows that
target's nodes. The chosen target must have the models and custom nodes the
workflow uses. Partner nodes need a Comfy key, which only Comfy Cloud sends. The
selector does not affect the three Run ComfyUI Workflow nodes above, because
each names its own target.

Template sources, the regeneration scripts and the catalogs are in
[ComfyUI from Code](developer/comfyui.md#bundled-templates-and-catalogs).

---

## Comfy Router models

With the same Comfy key, Comfy Cloud also offers partner models from the
[Comfy Router](https://docs.comfy.org/development/comfy-router): image (FLUX,
Seedream, GPT Image, Ideogram, Recraft), video (Kling, Veo, Seedance, Wan, LTX,
Luma, Runway), speech (ElevenLabs) and chat (Claude, GPT, Gemini). They appear in
every model picker under **Comfy Cloud**, including Create, the composer,
storyboards and the generic generation nodes. No ComfyUI graph is involved.

Comfy reports credits per run, and NodeTool does not convert them to a cost
record yet. These are partner APIs. For an open-weights run, use a ComfyUI graph
with open models through the nodes above. How requests are built and queued is in
[ComfyUI from Code](developer/comfyui.md#comfy-router-internals).

---

## Known limitations

- **The worker node has no workflow loader in the editor.** The **Load Workflow**
  button and the automatic inputs belong to Run ComfyUI Workflow and its Comfy
  Cloud variant. On the worker node you paste the API-format JSON into the
  `workflow` property and add inputs yourself, named `<comfyNodeId>:<field>`.
- **The worker node's output names come from the worker.** They do not follow the
  `<comfyNodeId>:<kind>` pattern of the other nodes. Check the names against a
  real run before wiring downstream nodes.
- **The worker node returns all files at the end** instead of one at a time.
- **Cancelling a NodeTool run does not stop a worker run.** The ComfyUI prompt
  keeps running on the worker while NodeTool stops waiting. Use the `timeout`
  property to bound it.
- **The Comfy Cloud node reports no cost.** Comfy's job response carries no cost
  field, so the Comfy Cloud column in a run's cost breakdown stays empty. The
  Comfy job id is written to the run log, so a run can be matched against Comfy's
  own billing.

The technical background is in [ComfyUI from Code](developer/comfyui.md#the-worker-node).

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
| `ComfyUI workflow did not finish within <n>s` | The same timeout, when `api` is set to `v2`. |
| `Comfy job <id> failed in <class_type> (#<node>): …` | The job ran and a ComfyUI node raised. The text after the colon is ComfyUI's own message and error code. |
| `The connected worker does not front a ComfyUI server` | The worker isn't running the ComfyUI image, or reports `comfy.enabled: false`. |
| `Comfy account has insufficient credits` | Comfy Cloud answered that the account is out of credit. Top it up at [platform.comfy.org](https://platform.comfy.org). |
| `Comfy queue is full` | Your plan's concurrent-job limit was still full a minute after the first attempt. |
| `Comfy Cloud job did not finish within <n>s` | The job outlived the node's `timeout`. Raise it, up to Comfy's own 30 or 60 minute cap. |
| `COMFY_API_KEY is required to run a workflow on Comfy Cloud` | No key stored. Add it in **Settings → Models & Providers**. |
| `ComfyUI workflow is in UI-export format` | Exported with the regular save. Re-export with **Save (API Format)**. |
| `404` on `/api/v2/jobs` | `api` is set to `v2` but the endpoint is a plain ComfyUI. Set `api` back to `native`. |

---

## Related

- [ComfyUI Setup](comfyui-setup.md): connecting a local ComfyUI or Comfy Cloud, and what has to be installed on the server
- [ComfyUI Recipes](comfyui-recipes.md): composing a ComfyUI node with the rest of a graph
- [ComfyUI from Code](developer/comfyui.md): setting a workflow from code, the v2 API, the worker bridge, and running without the editor
- [Worker Deployment](worker-deployment.md#comfyui-on-a-worker): renting a GPU for ComfyUI
- [Providers](providers.md): the Comfy Cloud provider and its key
- [Comparisons](comparisons.md): how NodeTool and ComfyUI differ as tools
