---
name: video-workflow
description: Build a reusable NodeTool workflow graph that produces video, so the same pipeline can be re-run on new inputs — a UGC factory, a batch shot renderer, a per-SKU ad generator. Use when the user asks for a template, a pipeline, a factory, a batch job, or something they will run again with different inputs, rather than one finished video. Not for directing a single piece, which needs no graph (use ugc-video, product-commercial or short-film).
---

**Load `/storyboard-core` for what a shot is and how entities season a prompt,
and `/nodetool-workflow-builder` for how to author a graph at all** — node search,
handles, validation, the tools. This skill is the seam between them: the nodes that
turn a brief into shots, and when a graph is the wrong answer.

## First, check a graph is actually wanted

A graph earns its cost only when the pipeline gets **re-run on new inputs**. One video,
even a complicated one, is faster and cheaper to direct on a storyboard — no node
search, no handle wiring, no validation pass, and the user can see and fix each shot.

Build a graph when the user says template, pipeline, batch, factory, "for every SKU",
"run it again next month", or wants it callable from Chat by name. If they asked for a
video and you are reaching for a graph, go back to the storyboard skills.

## The creative nodes

Search the registry before adding any of these — `search_nodes` or `ui_search_nodes`
with `include_properties` and `include_outputs` — and never invent a type, a property
or a handle name. Verified types:

| Node | Does |
|---|---|
| `nodetool.creative.Director` | brief → `Screenplay`. Props: `model` (language_model), `brief`, `style`, `shot_count` (1–20). Outputs: `screenplay`, `narration`, `music_prompt`, `title`. |
| `nodetool.creative.ScreenplayShots` | fans a screenplay out one shot at a time. Outputs `shot`, `shot_prompt`, `index` per iteration plus `output` as the whole list. |
| `nodetool.creative.ShotBatch` | flattens a screenplay into generation-ready specs in one go. Output: `shots` (list[dict]) with prompt, timing and keyframe. |
| `nodetool.creative.ShotChain` | animates a spec list sequentially, seeding each shot's first frame from the previous clip's last frame. Output: `videos`. Needs the `ffmpeg` runtime. |
| `nodetool.creative.ApplyEntities` | seasons a prompt with entity descriptors, the same rule the storyboard render path uses. |
| `nodetool.image.TextToImage` | prompt → image. |
| `nodetool.video.ImageToVideo` / `nodetool.video.TextToVideo` | still → clip, or prompt → clip. |

## Two shapes, and they are not interchangeable

**Per-shot fan-out** — `Director` → `ScreenplayShots` → `TextToImage` → `ImageToVideo`.
Each shot renders independently. Use it when shots are separate takes: an ad, a set of
social cuts, anything where a shot failing should not spoil the rest.

**Continuous chain** — `Director` → `ShotBatch` → `ShotChain`. Each clip's first frame
is the previous clip's last frame, so motion and framing carry across the cut. Use it
for a sequence that has to feel continuous. It is sequential, so it is slower and one
bad clip propagates.

`ApplyEntities` goes between the prompt source and the image node whenever the pipeline
has a recurring character or product to hold steady.

## Wire the gate in

The storyboard loop's value is that a human sees the stills before the clips are paid
for. A graph loses that unless you build it in: keep the still half and the clip half
separable, so the user can run to the stills, look, and then run the clip half. Say
which inputs do that when you hand the workflow over.

## Validate, and do not run the expensive half

`validate_workflow` with the inline graph before saving — it catches unknown node
types, missing required properties, unselected models, dangling edges and a model id
the provider does not offer, in well under a second and with no spend.

`create_workflow` refuses to save a graph whose model properties are unselected, so
pick real ones with `find_model` and stamp them in. Nothing fills them in at run time.

Save the graph. Do not run the clip stage unless the user asks — a batch renderer's
whole point is that one run costs real money.

## Brief

```
Build a workflow named "UGC factory" that I can re-run from Chat.

Inputs: a product image, a brief, an aspect ratio.
Shape: nodetool.creative.Director (brief + style + shot_count) ->
nodetool.creative.ScreenplayShots -> nodetool.creative.ApplyEntities ->
nodetool.image.TextToImage -> a point I can stop at and look ->
nodetool.video.ImageToVideo -> timeline assembly.

Search the registry for every node type and read its real properties and handles
before you add it. Pick concrete models with find_model and stamp them in.
validate_workflow before saving.

Save it and stop. Do not run the clip stage.
```
