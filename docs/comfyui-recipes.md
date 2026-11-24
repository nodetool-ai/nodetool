---
layout: page
title: "ComfyUI Recipes"
description: "What a ComfyUI workflow is good for once it is a node in a NodeTool graph: LLM-written prompts, batches, stored assets, cuts, mini apps, and chat."
---

Patterns for what surrounds a ComfyUI node: where the prompt comes from, how often it runs, where the files go, and what triggers it. For the nodes and their properties see [ComfyUI](comfyui.md), and for the server see [ComfyUI Setup](comfyui-setup.md).

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

- **A handle only exists if you asked for it.** Media inputs, prompt text, and
  save outputs are derived automatically. Seeds, steps, CFG, and sizes are
  offered as a checkbox list in the Load Workflow dialog. Until you tick one
  there is no handle, and the prompt keeps its exported value. See
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

**Nodes.** String Input, Enhance Prompt, Run ComfyUI Workflow, Output

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  enhance["Enhance Prompt (target: image)"]
  comfy["Run ComfyUI Workflow"]
  out["Output"]
  brief --> enhance -->|text| comfy
  comfy -->|"9:image"| out
{% endmermaid %}

**Wiring.** Enhance Prompt's `text` output goes to the ComfyUI node's `6:text`
handle. An Agent node works the same way when you want tools or a system
prompt, and its `text` output is the one to wire.

**Watch out.** A negative prompt is a second `CLIPTextEncode` with its own id
and its own handle. Leaving it unconnected keeps its exported text, so driving
only the positive one is the usual arrangement.

---

## Recipe 2 · One workflow, many runs

**What it does.** The same diffusion graph runs once per item, unattended.

**Nodes.** String Input, List Generator, Run ComfyUI Workflow, Collect, Output

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  list["List Generator (streams item)"]
  comfy["Run ComfyUI Workflow"]
  collect["Collect"]
  out["Output"]
  brief --> list -->|item| comfy
  comfy -->|"9:image"| collect --> out
{% endmermaid %}

**Wiring.** List Generator emits `item` (a string) once per generated line, and
each item drives one run of the ComfyUI node. For Each does the same for a list
you already have, and Load Image Assets does it for a folder of image assets,
streaming `image` and `name` per file. Collect gathers the results back into
one list.

**Watch out.** Every run gets its own `timeout`, not a shared one, so a
fifty-item batch on a 600 second timeout can take hours before anything fails.
On Comfy Cloud, the plan's concurrent-job limit (1, 3, or 5) is the real width
of the fan-out: when the queue stays full for a minute, the node fails with
`Comfy queue is full`.

---

## Recipe 3 · A stored asset in, a stored asset out

**What it does.** Feeds a NodeTool image asset into a `LoadImage` node and puts
what comes back into an asset folder.

**Nodes.** Image Input, Run ComfyUI Workflow, Save Image

{% mermaid %}
graph LR
  input["Image Input"]
  comfy["Run ComfyUI Workflow"]
  save["Save Image (folder, name)"]
  input -->|"10:image"| comfy
  comfy -->|"9:image"| save
{% endmermaid %}

**Wiring.** A connected image, audio, or video is uploaded to the ComfyUI
server before the workflow runs, and the uploaded file replaces the one named in
the workflow. On Comfy Cloud, re-running with the same file uploads nothing the
second time.

**Watch out.** Outputs arrive as media in the run, not as saved assets. Nothing
is written to your asset library until a node writes it, which is what Save
Image is for (Save Video for video). And a `LoadImage` field you leave
unconnected still resolves against the ComfyUI server's own input folder, which
is why an unwired workflow keeps working and a wired one replaces the file.

---

## Recipe 4 · Frames into a cut

**What it does.** A batch of stills out of ComfyUI becomes a video without a
second tool.

**Nodes.** Run ComfyUI Workflow, Frame To Video, Output

{% mermaid %}
graph LR
  comfy["Run ComfyUI Workflow (SaveImage batch)"]
  frames["Frame To Video (fps)"]
  out["Output (Video)"]
  comfy -->|"9:image"| frames --> out
{% endmermaid %}

**Wiring.** The ComfyUI node emits one result per output file on the same
slot, so a batch of four images is four frames rather than one list. Frame To
Video takes the stream and collects the frames into a video at the `fps` you
set. For a timeline instead of a flat encode, send the slot through Collect into
Add Clips To Timeline (which has an `image_duration_ms` property) and render it
with Render Timeline.

**Watch out.** Nodes that ComfyUI serves from its cache are collected after the
run rather than streamed during it, so a fully cached batch arrives all at once
at the end. Frame order follows emission order, so a graph with several
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
every parameter the form should expose needs its own Input node in front of
the handle. Publishing locks in the current state of every workflow the
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

To run a graph with a ComfyUI node from the command line, a TypeScript script or the HTTP API, see [ComfyUI from Code](developer/comfyui.md#running-it-without-the-editor).

---

## Cost, time, and failure

**Cost.** No ComfyUI run writes a cost record, so `nodetool costs` shows nothing
for one. A run on your own server or a worker is billed by whoever owns the GPU.
A Comfy Cloud run is billed per GPU second by plan. The node records Comfy's job
id in the run log (`Comfy job <id> submitted`), which you can match against
Comfy's own billing. See [Known limitations](comfyui.md#known-limitations).

**Time.** All three nodes default `timeout` to 600 seconds. Raise it for video
and upscale graphs. The message names which side gave up:
`Timeout waiting for ComfyUI result` on a ComfyUI server, and
`Comfy Cloud job did not finish within <n>s` on Comfy Cloud, whose own cap is 30
minutes per job (60 on Pro) regardless of what you set here.

**Cancellation.** Cancelling a run stops the job on a ComfyUI server and on Comfy
Cloud, so Comfy stops billing. It does not stop a run on a NodeTool worker: the
ComfyUI prompt keeps running there while NodeTool stops waiting, so set
`timeout` accordingly. The error messages are in
[Troubleshooting](comfyui.md#troubleshooting).

---

## Related

- [ComfyUI](comfyui.md): the three nodes, their properties, handles, outputs, and limitations
- [ComfyUI Setup](comfyui-setup.md): getting a server the node can reach
- [Creative Cookbook](cookbook.md): the same fan-out, collect, and render shapes, without ComfyUI in the middle
- [ComfyUI from Code](developer/comfyui.md): running a graph from the CLI, a script, or the API
- [App Builder](app-builder.md): the Design view Recipe 5 uses
