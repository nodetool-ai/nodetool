---
title: "How to edit a video with text prompts in 2026"
description: "Change a clip with a written instruction: Kling O3 Edit, Luma Ray 2 Modify, Wan 2.7 Edit, Lucy Edit, Runway Aleph and Grok compared on limits and price."
headline: "How to edit a video with text prompts"
excerpt: "Pick the edit model by the kind of change, keep the clip short, write the instruction as a diff, and audition the result as a take before it touches your cut. Prices run from $0.04 to $0.35 per second of footage."
tag: Guide
date: 2026-10-08
author: "The NodeTool team"
accent: violet
ogImage: creatives_timeline.png
priority: 0.7
changeFrequency: monthly
---

You edit a video with a text prompt by sending the clip and one instruction to a video-to-video model, such as Kling O3 Edit, Luma Ray 2 Modify, Wan 2.7 Edit or Decart Lucy Edit. The model returns a new clip with the change applied and the original motion kept. At fal's list prices these models cost between $0.04 and $0.35 per second of footage. A five-second fix therefore costs between twenty cents and $1.75.

Getting a usable result depends less on the model than on three decisions: what kind of change you ask for, how long a clip you send, and whether the result replaces your shot or sits next to it. This guide covers all three. It also shows the NodeTool graph and the timeline flow that do it without a script.

Prices below are the per-second rates recorded in the provider catalogs NodeTool bills against, read in July 2026. You pay them on your own key, with [no markup](/pricing).

## Quick answer

- **Changing an object, outfit or prop inside a shot:** Kling O3 Edit or Decart Lucy Edit Pro.
- **Restyling the whole shot (live action to animation, day to night):** Luma Ray 2 Modify, or Ray 2 Flash Modify while you iterate.
- **Cheap drafts of an edit:** Lucy Edit Fast at $0.04/s or Grok Imagine Edit at $0.05/s.
- **A longer clip in one pass:** Runway Aleph 2 on [Replicate](/providers/replicate) accepts 2 to 30 seconds, and Luma's Replicate endpoint accepts up to 30 seconds.
- **Keeping a shot in the cut while you try edits:** run the edit from the NodeTool timeline, where every result arrives as a candidate take.

## Three kinds of edit, three kinds of model

A prompt edit is one of three jobs, and models are built for one of them.

1. **Local edits.** Swap the jacket, remove the cup, change the sign on the wall. Everything outside the change should stay pixel-close to the source. Kling's O1 and O3 edit endpoints, Decart Lucy Edit and Wan 2.7 Edit are built for this. Kling's prompt can refer to the input clip as `@Video1` and to extra reference images as `@Image1`, which is how you say "replace the bag with this bag".
2. **Restyles.** Change the look of every frame and keep the motion. Luma describes Ray 2 Modify as "turning live-action into CG or stylized animation, to changing wardrobe, props". Lucy Restyle and the generic LTX video-to-video model in NodeTool's Video To Video node also sit here.
3. **Structural edits.** Make the shot longer, wider or a different shape. These are extend and reframe models: Veo 3.1 Extend, Grok Imagine Extend, Luma Ray 2 Reframe, Wan VACE outpainting and reframe. They do not change what is in the shot. They add more of it.

Sending a restyle prompt to a local-edit model, or the other way round, is the most common reason an edit "does nothing" or redraws the whole frame.

## Edit models compared

| Model | Provider | Best at | Input limits | USD per second |
| :--- | :--- | :--- | :--- | ---: |
| Decart Lucy Edit Fast | fal | Cheap local edit drafts |  | 0.04 |
| Grok Imagine Edit | fal | Quick drafts | Resized to max 854×480 | 0.05 |
| Wan 2.7 Edit | fal | Local edits, matches input length |  | 0.10 |
| Decart Lucy Edit Pro | fal | Outfits, objects, faces |  | 0.10 |
| Luma Ray 2 Flash Modify | fal | Restyle drafts |  | 0.12 |
| Kling O3 Edit (Pro) | fal | Local edits with references | 3–15 s, 720–3840 px, 200 MB | 0.14 |
| Kling O1 Edit (Pro) | fal | Local edits with references | 3–10 s, 720–2160 px, 200 MB | 0.168 |
| Luma Ray 2 Modify | fal | Full restyle |  | 0.35 |
| Runway Aleph 2 | Replicate | Long and multi-shot edits | 2–30 s, under 16 MB | provider rate |

Blank limits mean the node's schema states none. Runway Aleph is also reachable on [kie](/providers/kie) as `kie.video.GenerateAlephVideo`. Wan 2.7 Edit runs on kie at $0.08/s and on [AtlasCloud](/providers/atlascloud) at $0.10/s, so the same edit costs a fifth less depending on which key you use.

Two things stand out in the table.

**Length is the hidden constraint.** Most local-edit models stop at 10 or 15 seconds. Cut your shot to the part that needs the change before you send it. That also cuts the bill, because every model here charges per second.

**Draft cheap, finish once.** Lucy Edit Fast at $0.04/s and Ray 2 Modify at $0.35/s differ by almost nine times. Use a cheap model to find the instruction that works, then run the final model once with that exact instruction.

## Step 1: cut the clip to the change

Put a **Trim** node (`nodetool.video.Trim`) in front of the edit. Set the start and end to the range that needs editing, plus half a second either side. You will splice the edit back over the original, and the handles give you room for a clean cut.

If the source is a vertical or square crop of a wider shot, edit the wide shot first and reframe afterwards. Edit models see more context in a wider frame and invent less.

## Step 2: write the instruction as a diff

An edit prompt describes the change, not the scene. The model already has the scene.

- **Name what changes and what it becomes.** "Replace the red umbrella with a clear plastic umbrella" beats "a woman with a clear umbrella in the rain".
- **Name what must stay.** "Keep her face, the street and the camera move unchanged." Local-edit models respect this. Restyle models will still repaint everything, which is the point of them.
- **One change per pass.** Two edits in one prompt usually get one done well and one done badly. Chain two edit nodes instead.
- **Use references for anything branded.** On Kling, attach the product photo and write "replace the bottle with @Image1". Words describe a product loosely. A reference image pins it.

## Step 3: build the graph

The smallest editing graph is four nodes:

1. **Video Input** (`nodetool.input.VideoInput`) for the clip.
2. **Trim** to cut it to the range.
3. **Video To Video** (`nodetool.video.VideoToVideo`) with your instruction in `prompt`. Its model picker lists every video-to-video model your keys reach, and its `strength` dial (0 to 1, default 0.6) decides how far the result moves from the source.
4. **Output** (`nodetool.output.Output`) so the result is saved as an asset.

To use a provider-specific model with all its options, such as Kling's reference images or `keep_audio`, use that model's own node instead of the generic one. Search the node menu for the model name. The [Video Restyle Studio template](/templates/video-restyle-studio) ships this graph with a Prompt node in front that expands a short style note into a full restyle brief.

## Step 4: run it from the timeline instead

If the clip already sits in a cut, edit it there. Select a video clip in NodeTool's timeline, open **AI Edit** in the Inspector, and choose an operation: `restyle`, `replace_object`, `remove_object`, `replace_range`, `extend` or `regenerate`. NodeTool checks the operation against the selected model's capabilities before it spends anything, so asking a restyle-only model to remove an object fails up front instead of after the bill.

The result arrives as a **candidate take** on the clip. Your edit does not move: start time, duration, track and effects stay where they were. Choose **Preview Candidate** under History to audition it in place, then **Use take** if it belongs in the cut. If a generated take fails, the previous take stays active.

The agent can do the same from chat. "Make shot 3 darker and add rain" becomes a generative edit on that clip alone, and it waits for you to accept the take.

## Step 5: finish the shot

Some edit models return a smaller frame than they were given. Grok Imagine Edit, for example, resizes its input to at most 854×480. Three steps close the gap:

- **Upscale.** Topaz video upscaling on [fal](/providers/fal) costs $0.01/s, and the [Topaz provider](/providers/topaz) is also available directly. See [video upscaling](/tasks/upscale-video) for the other options.
- **Reframe.** For a vertical version, the timeline's **Adapt format** makes 9:16, 1:1 and 4:5 sequences from the same media, or the [Cut a Landscape Clip for Vertical](/templates/cut-a-landscape-clip-for-vertical) template does a plain resize.
- **Cut out.** To put the edited subject on a new background, Bria and VEED background removal run as video-to-video nodes, and `nodetool.video.ChromaKey` handles green screen ([template](/templates/key-out-a-green-screen)).

## What a typical edit costs

| Job | Plan | Total |
| :--- | :--- | ---: |
| Swap one prop in a 5 s shot | 4 drafts on Lucy Edit Fast (20 s × $0.04), 1 final on Kling O3 (5 s × $0.14) | $1.50 |
| Restyle a 10 s shot | 3 drafts on Ray 2 Flash Modify (30 s × $0.12), 1 final on Ray 2 Modify (10 s × $0.35) | $7.10 |
| Fix 6 shots of 4 s each in a 30 s ad | 1 pass per shot on Kling O3 (24 s × $0.14) | $3.36 |

Running all five passes of the first job on Kling O3 costs $3.50 instead of $1.50. The habit this table exists to break is drafting on the final model.

## Checklist

1. Decide whether the change is local, a restyle, or structural.
2. Trim to the range, with half a second of handle on each side.
3. Write the change, not the scene, and say what must stay.
4. One change per pass. Chain nodes for more.
5. Attach a reference image for any product or logo.
6. Draft on a cheap model, finish once on the good one.
7. Audition the result as a take before it replaces anything.
8. Upscale and reframe last.

## FAQ

### What is the best AI model for editing a video with a text prompt?

It depends on the edit. For changing one object or outfit, Kling O3 Edit and Decart Lucy Edit Pro are built for local changes and keep the rest of the frame. For changing the look of the whole shot, Luma Ray 2 Modify is built for restyling. For cheap drafts, Lucy Edit Fast costs $0.04 per second.

### How long can the clip be?

Kling O3 Edit accepts 3 to 15 seconds and Kling O1 Edit 3 to 10. Runway Aleph 2 and Luma's Replicate endpoint accept up to 30 seconds. For anything longer, cut the clip into the shots that need changing and edit each one.

### Does the edit keep the original audio?

Kling's edit endpoints have a `keep_audio` option. With other models, keep the original audio yourself: edit the picture, then put the source audio back with NodeTool's Add Audio node, or leave the audio on its own track in the timeline.

### Can I undo an AI edit on the timeline?

Yes. Every generative edit on the timeline creates a candidate take, and your clip keeps its previous take until you choose **Use take**. You can switch back to an earlier take from the clip's History at any time.

### Do I need a GPU?

No. Every model in this guide runs on the provider's servers and is called with your own API key. NodeTool Studio runs on macOS, Windows and Linux without a GPU.

## Read next

- [Video Restyle Studio template](/templates/video-restyle-studio) — The edit graph, ready to run.
- [Video upscaling](/tasks/upscale-video) — Finish an edited shot at a higher resolution.
- [How much does AI video generation cost in 2026?](/blog/ai-video-generation-cost) — Per-second rates for generating the source clip.
- [fal on NodeTool](/providers/fal) — Where most of the edit models above run.
