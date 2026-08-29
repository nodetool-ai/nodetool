---
layout: page
title: Core Concepts
parent: NodeTool Workflow Cookbook
nav_order: 1
---

## What a workflow is

A workflow is a graph. Nodes are operations, edges carry typed values, and a
node runs as soon as its inputs are ready — you never order the steps yourself.

```
Brief → Direct → Still → Clip → Cut
```

Four rules follow from that:

1. **Edges are typed.** An image output does not connect to a text input. The
   editor refuses the connection instead of failing at run time.
2. **Execution follows the data.** Independent branches run at the same time;
   a `Collect` node is how you wait for a stream to finish.
3. **Streaming is normal.** `ListGenerator` emits prompts one at a time, and a
   downstream image node starts on the first one while the last is still being
   written.
4. **Failures are local.** A red node stops its own branch. Other branches
   finish.

---

## Documents are values

The creative surfaces are documents, and a document travels through a
graph as one typed value. This is what connects the surface you work in to the
graph that repeats the work.

| Document | Into a graph | What reads it | What writes it |
|---|---|---|---|
| **Sketch** | `nodetool.constant.Sketch` | `RenderSketch` (image + mask), `SketchLayers` | `CreateSketch` |
| **Script** | `nodetool.constant.Script` | `LoadScript`, `ScriptToSubtitles` | `VoiceScript`, `ScriptToTimeline` |
| **Timeline** | `nodetool.constant.Timeline` | `Transcript`, `RenderTimeline` | `AddClips` |

A storyboard is the exception: it has no node of its own, because what a graph
consumes from it is the screenplay and the timeline it produces.
`nodetool.creative.Director` writes that same screenplay shape headlessly, so a
graph can start where the board would have.

---

## Data types

| Type | Carries | Typical nodes |
|---|---|---|
| `str` | Text | `StringInput`, `Prompt`, `Agent` |
| `image` | One image | `TextToImage`, `ImageToImage`, `RenderSketch` |
| `video` | One clip | `TextToVideo`, `ImageToVideo`, `RenderTimeline` |
| `audio` | One track | `TextToSpeech`, `TextToMusic` |
| `list[T]` | Many of T | `ListGenerator`, `Collect`, `SketchLayers` |
| `dict` | A record | `Director` (screenplay), `ScreenplayShots` (shot) |
| `sketch` `script` `timeline` | A document | the constants above |
| `image_model` `video_model` `tts_model` | A model choice | `ImageModelInput`, `VideoModelInput` |

Models are values too. Wire a `VideoModelInput` into several nodes and one
selection changes the whole graph — which is how a cheap draft run and an
expensive final run stay the same graph.

---

## Fan-out and collection

Most creative graphs are one of these two shapes.

**Stream, then gather.** A generator emits N items, each one runs the same
pipeline, `Collect` turns the results back into a list.

{% mermaid %}
graph LR
  brief["Brief"] --> gen["ListGenerator"] --> img["TextToImage"] --> collect["Collect"] --> out["Output"]
{% endmermaid %}

**Sequence with carry-over.** Each step depends on the last — a shot seeded by
the previous shot's final frame. `ShotChain` does this internally; `ForEach`
plus a `Code` node does it when the rule is your own.

{% mermaid %}
graph LR
  shots["ShotBatch"] --> chain["ShotChain (frame → next shot)"] --> cut["AddClips"]
{% endmermaid %}

The difference matters for cost. Fan-out spends N times in parallel and fails
independently; a chain spends in order and a failure halfway leaves the tail
unrendered.

---

## Check before you spend

A video run costs real money, so check the graph statically first:

```bash
npm run dev:nodetool -- validate workflow.json
```

It reports unknown node types, missing properties, unselected models, models
naming a provider you have no key for, and `Code` bodies that will not run —
in under a second, before any node executes. The workflow editor's estimate
panel prices the graph from per-node unit pricing in the same spirit.

When a run does fail, `nodetool debug <id>` runs it and hands back every
message, log, output, and error in one bundle. Details in
[Workflow Debugging]({{ '/workflow-debugging' | relative_url }}).
