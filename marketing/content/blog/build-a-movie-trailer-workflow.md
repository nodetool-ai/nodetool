---
title: "Build a movie trailer workflow in NodeTool — step by step"
description: "Turn one logline into a cut teaser. Director writes the shot list, Screenplay Shots turns it into prompts, Text To Image renders keyframes, Image To Video animates them, Concat cuts it."
headline: "Build a movie trailer workflow in NodeTool"
excerpt: "One logline in, a cut teaser out. We build the graph node by node — Director, Screenplay Shots, Text To Image, Image To Video, Collect, Concat — and explain what each one costs."
tag: Tutorial
date: 2026-07-21
author: "The NodeTool team"
accent: rose
ogImage: screen_workflow.png
priority: 0.7
changeFrequency: monthly
---

A trailer is a structure problem before it is a rendering problem. Shots have to escalate, the look has to hold across every frame, and the cut has to land. This workflow encodes that structure once and then runs it on any logline.

The finished graph ships as the [Movie Trailer Generator template](/templates/movie-trailer-generator) — open it in Studio and you can run it immediately. Building it by hand is worth an hour anyway, because every node here is one you will reuse.

## What you need

- **NodeTool Studio** for macOS, Windows, or Linux. Nothing here needs a GPU.
- **A language-model key** for the Director step (Anthropic, OpenAI, Google, or a local model through Ollama).
- **An image-model key** and **a video-model key**. In the shipped template these are an OpenAI image model and Veo through Google, but the pickers accept anything your keys reach.

Paste keys under Settings → Models & Providers. NodeTool stores them locally and calls each provider directly.

## Step 1 — the inputs

Start a new workflow and double-click the canvas to open the node menu. Add three inputs:

1. **String Input** (`nodetool.input.StringInput`) named `logline`. One sentence with a situation and a complication: *"A getaway driver speeds onto a bridge as it starts to collapse — and the only way out is to outrun the gap."*
2. **String Input** named `style`. This is the style bible, and it does more work than the logline. Something like: *cinematic film still, theatrical key art, anamorphic framing, high-contrast daylight, dust and sparks, handheld telephoto, motion blur.*
3. **Integer Input** (`nodetool.input.IntegerInput`) named `shot_count`. Start at 4 while you iterate. Each shot is a video call, so this is the cost dial.

Naming inputs matters beyond tidiness: named inputs are what you pass as parameters when the workflow runs from the CLI or the API, and what a mini app binds its widgets to.

## Step 2 — Director writes the shot list

Add a **Director** node (`nodetool.creative.Director`). Wire `logline` into its prompt input, `style` into the style input, and `shot_count` into the shot count.

Director is not a thin prompt wrapper. It returns a screenplay: an ordered list of shots, each with camera direction and action, plus one style bible that every shot inherits. That shared bible is what keeps shot 5 in the same film as shot 1 — the usual failure mode of prompt-per-shot pipelines is six beautiful frames from six different movies.

Pick a strong reasoning model here. It is one call, it is cheap relative to the video step, and it decides whether the trailer has a structure.

## Step 3 — Screenplay Shots turns the plan into prompts

Add **Screenplay Shots** (`nodetool.creative.ScreenplayShots`) and wire Director's output into it.

This node takes the screenplay and emits one image prompt per shot, merging each shot's action and camera direction with the style bible. Structurally it is the fan-out point: downstream nodes now run once per shot rather than once per workflow. NodeTool's runtime is a message-passing actor model, so a node that receives a stream of items processes each one as it arrives — you do not build a loop.

That is also why previews start appearing while the run is still going. Shot 1 renders while shot 4 is still being written.

## Step 4 — render the keyframes

Add **Text To Image** (`nodetool.image.TextToImage`) and wire the prompt output from Screenplay Shots into it. Open its model picker and choose an image model your key reaches.

Every shot prompt now becomes a keyframe. Run the workflow at this point, before wiring anything else — this is the cheap checkpoint. Look at the frames: if they do not feel like one film, fix the `style` input, not the prompts. The style bible is the lever.

While you are here, this is the natural place to add editing nodes if you want them. `nodetool.image.Upscale` before the video step, or `nodetool.image.Relight` to push the key light in one direction across every shot.

## Step 5 — animate each frame

Add **Image To Video** (`nodetool.video.ImageToVideo`) and wire the image output into it. Choose a video model in the picker.

Read the meter before you run this. Video models bill per second of generated video, and this node fires once per shot — six shots is six calls. Keep `shot_count` low and the duration short while you are still finding the look. Nothing else in this graph is close to it in cost.

## Step 6 — collect and cut

Two nodes finish the pipeline:

1. **Collect** (`nodetool.control.Collect`) gathers the per-shot clips streaming out of Image To Video back into a single ordered list. Fan-out started at Screenplay Shots; this is where it closes.
2. **Concat** (`nodetool.video.Concat`) joins the list into one video in shot order.

Wire Concat into an **Output** node (`nodetool.output.Output`) so the result is a named result of the workflow rather than a preview that disappears.

## Step 7 — run it, then tune it

Hit run. Node previews fill in live: the screenplay text, then keyframes, then clips, then the assembled cut.

Where to spend your iteration time, in order:

- **The style bible.** Consistency lives here. One extra clause about lens and light does more than rewriting six prompts.
- **The shot count.** Four shots that escalate beat eight that meander, and four costs half as much.
- **The logline.** Trailers need a complication, not a premise. "A driver on a bridge" is a setting; "the bridge is collapsing and the gap is widening" is a trailer.
- **The models.** Swap the video model while iterating and swap it back for the final render. The graph does not change.

## Taking it further

**Cut it properly.** Open the result in NodeTool's multi-track timeline, drop a music bed under it, and retime the shots. Clips on the timeline can stay bound to the workflow that made them, so changing a parameter regenerates the clip in place.

**Wrap it in a mini app.** Bind `logline`, `style`, and `shot_count` to three widgets and a Run button, and hand a teammate a focused tool instead of a canvas. The graph stays underneath, editable.

**Run it headlessly.** `nodetool workflows run <id> --params '{"logline":"..."}'` runs the same graph from the terminal, which is how you batch a dozen concepts overnight. Add `--supervise` and an agent handles a failed shot mid-run — retry, skip, or stop — inside a cost budget you set.

**Start from the storyboard instead.** If you would rather direct the shots yourself, the storyboard editor gives you shots you write and revise by hand, with the same render path underneath.

Every model call above ran on your own key at the provider's price. Swap any node for a different provider and the rest of the graph does not notice — that is the whole reason to build it this way.

## FAQ

### How much does one trailer cost to run?

The image-to-video step dominates. Video models are metered per second of generated video, and a six-shot trailer makes six of those calls, so the shot count is the cost dial. The text and image steps are cents by comparison. Every call is billed by the provider on your own key, and NodeTool's cost view shows the per-call spend after a run.

### Can I swap the models?

Yes — that is the point of the graph. Text To Image and Image To Video each carry a model picker, and changing one does not touch the rest of the wiring. Pick a cheaper video model while you iterate on the shot list, then switch back for the final render.

### Do I need a GPU?

Not for this workflow. The models run on the providers' servers and you reach them with your own API keys. A GPU only matters if you later want to run models locally through Ollama, MLX, or llama.cpp.

### Can an agent build this graph for me?

Yes. Describe the pipeline in chat and the agent authors the graph — picks the nodes, wires the edges, selects the models — and validates it before it runs. Starting from the template is faster if you want this exact shape; the agent is better when you want a variation.

## Read next

- [Movie Trailer Generator template](/templates/movie-trailer-generator) — The finished graph, ready to run.
- [Movie trailer use case](/use-cases/movie-trailer) — What the output looks like.
- [Video templates](/templates) — More video workflows to start from.
- [Download Studio](/studio) — macOS, Windows, Linux.
