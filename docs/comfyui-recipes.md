---
layout: page
title: "ComfyUI Recipes"
description: "What a ComfyUI workflow is good for once it is a node in a NodeTool graph: LLM-written prompts, batches, stored assets, cuts, mini apps, and running the whole thing from the CLI, the DSL, or the API."
---

A ComfyUI workflow loaded into a NodeTool node keeps doing exactly what it did
in ComfyUI. What changes is everything on either side of it: where the prompt
comes from, how many times it runs, where the files go, and who presses the
button.

This page is that second half. For the three nodes and their properties, see
[ComfyUI](comfyui.md). For getting a server the node can reach, see
[ComfyUI Setup](comfyui-setup.md).

---

## The shape of every recipe

A loaded workflow becomes a node with typed handles. Every dynamic input is
keyed `<comfyNodeId>:<field>` and takes the value ComfyUI would otherwise read
from the prompt JSON. Every dynamic output is keyed `<comfyNodeId>:<kind>` and
carries a NodeTool media ref, one per file. The ids are the keys of your
API-format export, so a `CLIPTextEncode` saved as node `6` exposes `6:text`,
a `LoadImage` saved as node `10` exposes `10:image`, and a `SaveImage` saved as
node `9` emits on `9:image`. Which fields are offered, and which are never
offered because ComfyUI wires them internally, is
[What becomes an input or an output](comfyui.md#what-becomes-an-input-or-an-output).

Two facts shape every recipe below:

- **A handle only exists if you asked for it.** Media inputs and save outputs
  are derived automatically. Seeds, steps, CFG, and prompt text are offered as
  a checkbox list in the Load Workflow dialog. Until you tick one there is no
  handle, and the prompt keeps its exported value. See
  [Loading a workflow](comfyui.md#loading-a-workflow).
- **The node runs on the server, not in your browser.** All three ComfyUI nodes
  are server-side, so `endpoint` has to resolve from wherever the NodeTool
  backend runs. A `127.0.0.1:8188` that works on your laptop is not the same
  address to a cloud install.

---

## Recipe 1 · A model writes the prompt

**What it does.** The positive prompt is generated per run instead of typed
into the ComfyUI graph, so one saved workflow covers a brief rather than a
sentence.

**Nodes.** `nodetool.input.StringInput`, `nodetool.agents.EnhancePrompt`,
`lib.comfy.RunWorkflow`, `nodetool.output.Output`

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  enhance["EnhancePrompt (target: image)"]
  comfy["RunWorkflow"]
  out["Output"]
  brief --> enhance -->|text| comfy
  comfy -->|"9:image"| out
{% endmermaid %}

**Wiring.** `EnhancePrompt`'s `text` output goes to the comfy node's `6:text`
handle. `nodetool.agents.Agent` works the same way when you want tools or a
system prompt, and its `text` output is the one to wire.

**Watch out.** `6:text` is not there until you tick that `CLIPTextEncode`
field in the loader dialog. A negative prompt is a second `CLIPTextEncode` with
its own id, so leaving it as a literal and driving only the positive one is the
usual arrangement.

---

## Recipe 2 · One workflow, many runs

**What it does.** The same diffusion graph runs once per item, unattended.

**Nodes.** `nodetool.input.StringInput`, `nodetool.generators.ListGenerator`,
`lib.comfy.RunWorkflow`, `nodetool.control.Collect`, `nodetool.output.Output`

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  list["ListGenerator (streams item)"]
  comfy["RunWorkflow"]
  collect["Collect"]
  out["Output"]
  brief --> list -->|item| comfy
  comfy -->|"9:image"| collect --> out
{% endmermaid %}

**Wiring.** `ListGenerator` emits `item` (a string) once per generated line, and
each item drives one run of the comfy node. `nodetool.control.ForEach` does the
same for a list you already have, and `nodetool.image.LoadImageAssets` does it
for a folder of image assets, streaming `image` and `name` per file.
`nodetool.control.Collect` gathers the results back into one list.

**Watch out.** Every run gets its own `timeout`, not a shared one, so a
fifty-item batch on a 600 second timeout can take hours before anything fails.
On Comfy Cloud, the plan's concurrent-job limit (1, 3, or 5) is the real width
of the fan-out: a full queue answers `429`, the SDK retries for 60 seconds, and
then the node fails with `Comfy queue is full`.

---

## Recipe 3 · A stored asset in, a stored asset out

**What it does.** Feeds a NodeTool image asset into a `LoadImage` node and puts
what comes back into an asset folder.

**Nodes.** `nodetool.input.ImageInput`, `lib.comfy.RunWorkflow`,
`nodetool.image.SaveImage`

{% mermaid %}
graph LR
  input["ImageInput"]
  comfy["RunWorkflow"]
  save["SaveImage (folder, name)"]
  input -->|"10:image"| comfy
  comfy -->|"9:image"| save
{% endmermaid %}

**Wiring.** A connected image, audio, or video ref is uploaded to the ComfyUI
server before the prompt is submitted (`POST /upload/image`, which ComfyUI
accepts for any input file) and the stored filename is substituted into the
prompt. On Comfy Cloud the same ref goes through the SDK's asset API and is
deduplicated by a blake3 hash of the bytes, so re-running with the same file
uploads nothing the second time.

**Watch out.** Outputs arrive as media refs carrying the bytes, not as saved
assets. Nothing is written to your asset library until a node writes it, which
is what `nodetool.image.SaveImage` is for (`nodetool.video.SaveVideo` for
video). And a `LoadImage` field you leave as a literal filename still resolves
against the ComfyUI server's own input directory, which is why an unwired
workflow keeps working and a wired one replaces the file.

---

## Recipe 4 · Frames into a cut

**What it does.** A batch of stills out of ComfyUI becomes a video without a
second tool.

**Nodes.** `lib.comfy.RunWorkflow`, `nodetool.video.FrameToVideo`,
`nodetool.output.Output`

{% mermaid %}
graph LR
  comfy["RunWorkflow (SaveImage batch)"]
  frames["FrameToVideo (fps)"]
  out["Output (Video)"]
  comfy -->|"9:image"| frames --> out
{% endmermaid %}

**Wiring.** The comfy node emits one media ref per output file on the same
slot, so a batch of four images is four frames rather than one list.
`nodetool.video.FrameToVideo` takes a streamed input and collects them into a
video at the `fps` you set. For a timeline instead of a flat encode, send the
slot through `nodetool.control.Collect` into `nodetool.timeline.AddClips`
(which has an `image_duration_ms` property) and render it with
`nodetool.timeline.RenderTimeline`.

**Watch out.** Nodes ComfyUI serves from its cache never emit an `executed`
event, so their files are reconciled from `/history/<prompt_id>` after the run
rather than streamed during it. A fully cached batch therefore arrives all at
once at the end. Frame order follows emission order, so a graph with several
save nodes gives you several slots to wire separately rather than one ordered
stream.

---

## Recipe 5 · Behind a form, in a mini app

**What it does.** Puts the workflow in front of someone who should not have to
read a node graph, or install ComfyUI.

**How.** Save the graph, open its app tab's **Design** view, add fields wired to
the workflow's Input nodes, add a Button whose **On click** action is **Run
workflow**, and wire an Image result widget to the Output node carrying the
comfy slot. [App Builder](app-builder.md) covers the editor, and
[Mini Apps](mini-apps.md) covers how one runs.

**Watch out.** Widgets wire to Input and Output nodes, not to comfy handles, so
every parameter the form should expose needs its own `nodetool.input.*` node in
front of the handle. Publishing locks in the current state of every workflow the
app runs, so a later edit to the graph does not reach the published app until
you publish again.

---

## Recipe 6 · Ask for it in chat

**What it does.** Reaches a saved ComfyUI workflow by name instead of by tab.

**How.** Save the workflow in the editor, then select it in chat or ask for it
by name. The results land in the thread. See
[Chat & Agents](global-chat-agents.md).

**Watch out.** The agent runs the graph as saved, so whatever the ComfyUI node
holds in its `workflow` property is what runs. This is the same server-side run
as every other path, which makes it the quickest check that `endpoint` is
reachable from the backend rather than only from your machine.

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
[CLI › validate](cli.md#nodetool-validate-workflow_id_or_file),
[CLI › debug](cli.md#nodetool-debug-workflow_id_or_file),
[Harness reference](harnesses.md).

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

**The limitation is in the generated types.** `RunWorkflowInputs` names the four
static properties (`endpoint`, `api`, `workflow`, `timeout`) and nothing else,
because the generator reads the node's declared props and the
`<comfyNodeId>:<field>` handles are derived from a workflow it has never seen.
A dynamic key in a DSL literal is a type error:

```
error TS2353: Object literal may only specify known properties,
and '"6:text"' does not exist in type 'RunWorkflowInputs'.
```

So a DSL-authored comfy node submits its prompt with nothing injected. Two ways
around it, in order of preference:

1. **Build the values into the prompt JSON.** The node injects dynamic props
   into `prompt[nodeId].inputs[field]` anyway, so writing them into the object
   you stringify reaches the same place. This covers seeds, steps, CFG, and
   prompt text, which is most of what a script varies.
2. **Author the graph in the editor** when the workflow needs a NodeTool media
   ref on a `Load*` handle. That upload only happens for a connected ref, so
   there is no JSON you can write instead. Run the saved graph by id from the
   CLI or the API.

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
`nodetool.input.StringInput` in front of the handle and its `name` becomes the
key. The route does not stream, so per-node progress and the ComfyUI lifecycle
lines need the `/ws` WebSocket instead. Full shapes:
[API Reference](api-reference.md), [WebSocket API](websocket-api.md).

---

## Cost, time, and failure

**Cost.** No ComfyUI run writes a provider cost record, on any of the three
nodes, so `nodetool costs` shows nothing for one. A direct or worker run is
billed by whoever owns the GPU. A Comfy Cloud run is billed per GPU second by
plan, and Comfy's v2 job response carries no cost field, so the node records the
job id and no charge amount. The run log line `Comfy job <id> submitted` is the
join key against Comfy's own billing. See
[Known limitations](comfyui.md#known-limitations).

**Time.** All three nodes default `timeout` to 600 seconds and each bounds the
NodeTool side of the run. Raise it for video and upscale graphs. The message
names which side gave up: `Timeout waiting for ComfyUI result` on the direct
native path, `ComfyUI workflow did not finish within <n>s` on a v2 path, and
`Comfy Cloud job did not finish within <n>s` on Cloud, whose own cap is 30
minutes per job (60 on Pro) regardless of what you set here.

**Cancellation** does not reach ComfyUI the same way everywhere:

| Path | What a cancelled NodeTool run does |
|---|---|
| `RunWorkflow`, `api: native` | Posts `/interrupt` and closes the WebSocket, then fails with `ComfyUI execution was canceled` |
| `RunWorkflow`, `api: v2` | Calls the job's cancel endpoint, so the job stops server-side |
| `RunWorkflowOnCloud` | Calls the job's cancel endpoint, so Comfy stops billing the run |
| `RunWorkflowOnWorker`, v2 path | Calls the job's cancel endpoint |
| `RunWorkflowOnWorker`, bridge path | Makes no cancel call. The bridge connection closes when the call settles, and the prompt runs on inside the worker's ComfyUI |

The bridge path is the one every shipped worker takes today, so treat a
long-running worker run as uncancellable and set `timeout` accordingly. The
error message table for everything else is
[Troubleshooting](comfyui.md#troubleshooting).

---

## Related

- [ComfyUI](comfyui.md): the three nodes, their properties, handles, outputs, and limitations
- [ComfyUI Setup](comfyui-setup.md): getting a server the node can reach
- [Creative Cookbook](cookbook.md): the same fan-out, collect, and render shapes, without ComfyUI in the middle
- [CLI Reference](cli.md): every flag on `validate`, `debug`, `run`, and `workflows run`
- [Harness Reference](harnesses.md): what each harness simulates and what it does not
- [App Builder](app-builder.md): the Design view Recipe 5 uses
- [API Reference](api-reference.md): endpoint matrix, auth, and the run payload
