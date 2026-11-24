---
layout: page
title: Workflow Concepts
parent: NodeTool Workflow Cookbook
nav_order: 1
---

## What a workflow is

A workflow is a graph. Nodes are operations, connections carry values of a set
type, and a node runs as soon as its inputs are ready. You never order the
steps yourself.

```
Brief → Direct → Still → Clip → Cut
```

Four rules follow from that:

1. **Connections have types.** An image output does not connect to a text
   input. The editor refuses the connection instead of failing at run time.
2. **Execution follows the data.** Independent branches run at the same time.
   A **Collect** node waits for a stream to finish.
3. **Streaming is normal.** **List Generator** emits prompts one at a time, and
   a downstream image node starts on the first one while the last is still
   being written.
4. **Failures are local.** A red node stops its own branch. Other branches
   finish, and the run then ends as `failed` with each node's error.

---

## Documents are values

Storyboards, scripts, timelines, and sketches are documents, and each one
travels through a graph as one value. That is what connects the editor you
work in to the graph that repeats the work.

| Document | Node that loads it | What reads it | What writes it |
|---|---|---|---|
| **Sketch** | Sketch | Render Sketch (image + mask), Sketch Layers | Create Sketch |
| **Script** | Script | Voice Script, Script To Timeline, Script To Subtitles, Fill Script | Write Script, Fill Script, Voice Script (saves takes) |
| **Timeline** | Timeline | Timeline Transcript, Render Timeline, Retarget Timeline, Fill Timeline Text | Add Clips To Timeline, Script To Timeline, Retarget Timeline, Fill Timeline Text |
| **Storyboard** | Storyboard | Storyboard Shots, Render Stills, Render Clips, Assemble Timeline, Recast Storyboard | Recast Storyboard, Render Stills, Render Clips |

Workflows, mini apps, and JS scripts load the same way, through the
**Workflow**, **Application**, and **JS Script** nodes. Drag a document file
from the Files panel onto the canvas to add its node.

**Director** writes the same screenplay shape as a storyboard, so a graph can
start from a brief instead of from a board you already approved. **Recast
Storyboard** copies an approved board onto a new cast and keeps every frame
whose prompt did not change, so a re-run pays only for what changed.

---

## Data types

The type names below are the ones the editor shows when you hover a handle.
[Data Types and Connections]({{ '/data-types' | relative_url }}) lists every
type and its handle color.

| Type | Carries | Typical nodes |
|---|---|---|
| Text | A prompt, a label, or any other text | String Input, Prompt, Agent |
| Image | One image | Text To Image, Image To Image, Render Sketch |
| Video | One clip | Text To Video, Image To Video, Render Timeline |
| Audio | One track | Text To Speech, Text To Music |
| List | Many items of one type | List Generator, Collect, Sketch Layers |
| Dictionary | Named fields, such as one shot of a screenplay | Director (screenplay), Screenplay Shots (shot) |
| Sketch, Script, Timeline, Storyboard | A document | the document nodes above |
| Image Model, Video Model, TTS Model | A model choice | Image Model Input, Video Model Input |

Models are values too. Connect one **Video Model Input** to several nodes and
one selection changes the whole graph. A cheap draft run and an expensive
final run stay the same graph.

---

<span id="fan-out-and-collection"></span>

## One item at a time, or one after another

Most creative graphs take one of these two shapes.

**Stream, then gather.** A generator emits N items, each one runs the same
steps, and **Collect** turns the results back into a list.

{% mermaid %}
graph LR
  brief["Brief"] --> gen["List Generator"] --> img["Text To Image"] --> collect["Collect"] --> out["Output"]
{% endmermaid %}

**Sequence with carry-over.** Each step depends on the last, such as a shot
seeded by the previous shot's final frame. **Shot Chain** does this
internally. **For Each** plus a **Code** node does it when the rule is your
own.

{% mermaid %}
graph LR
  shots["Shot Batch"] --> chain["Shot Chain (frame → next shot)"] --> cut["Add Clips To Timeline"]
{% endmermaid %}

The difference matters for cost. A stream spends N times in parallel and each
item fails on its own. A chain spends in order, and a failure halfway leaves
the rest of the shots unrendered.

---

## Check before you spend

A video run costs real money. Two checks run without spending anything:

- **Cost estimate.** In the workflow editor, the **Cost estimate** section sits
  under the Inspector in the right panel. Its header shows the total per run,
  and expanding it lists each node that calls a model with its price. It
  updates as you edit. See
  [Costs and credits]({{ '/costs-and-credits' | relative_url }}#the-estimate-panel).
- **Property problems.** Select a node and open the Inspector (`i`) to see
  missing or invalid properties before you run.

The chat assistant can also check a workflow without running it. Ask it to
validate the graph, and it reports unknown nodes, missing required
properties, unselected models, and connections whose types do not match.

When a run does fail, the failed node shows its error and a **View logs**
button. [Workflow Debugging]({{ '/workflow-debugging' | relative_url }})
covers the rest, including the command-line checks.
