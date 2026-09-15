---
layout: page
title: "AI Timeline Editing"
description: "Compare generated takes, track a subject, adapt framing, repair a shot, and hand a NodeTool sequence to another editor."
---

A NodeTool timeline keeps editorial timing separate from generated media. You can
compare variations, repair a shot, and adapt a cut for another format without
rebuilding the sequence.

## Compare takes without moving the edit

Every generated result is a take on its clip. A take records the generated
asset and its generation context. Selecting another take changes the media in
the clip, not its start time, duration, track, effects, or linked media.

Use takes when you want to compare alternate performances, prompts, or model
results in the same cut.

1. Generate a clip, then create one or more variations.
2. Open the clip's take history and preview the candidates.
3. Select the take that belongs in the cut.
4. Keep useful alternatives or remove candidates you no longer need.

The active take is the one used by preview, render, and interchange export.
If a generated take fails, the previously active take remains in place.

## Track a subject

A media track stores a subject's position over source time. Bind a clip's
position, scale, or mask to that track when a title, graphic, or mask must
follow a moving subject.

Track against the source range that matters, then attach the dependent clip.
The binding follows trims and clip movement because it uses source time rather
than the timeline's absolute position. A changed source asset makes its media
tracks stale. Re-run tracking before relying on a stale track.

## Adapt a cut for another frame

Smart Reframe creates a derived sequence for a new aspect ratio such as 9:16
or 1:1. It uses tracked subjects and framing analysis to choose a crop for each
shot. The source sequence stays unchanged.

Review the derived cut, then add manual framing keys where the automatic crop
needs direction. Preview and render use the same framing data.

## Repair or extend a shot

Generative timeline edits create a candidate take. They do not replace the
active media until you select the result.

Available operations include:

- Extend a shot at its start or end.
- Replace a source range.
- Remove or replace a tracked object.
- Restyle a shot or regenerate it.

Object operations require a ready media track for the active source. Before
running an edit, NodeTool checks the requested operation against the selected
model's capabilities. If the model cannot perform the edit, choose another
model or change the operation.

## Hand off a sequence

Use professional interchange when another editor needs the cut.

| Target | Output | Carries |
| --- | --- | --- |
| Final Cut Pro | FCPXML | sequence format, active media, timing, tracks, and markers |
| Premiere Pro | Legacy FCP XML | sequence format, active media, audio and video tracks, timing, and markers |

The export report names missing media and edits that need baking, including
effects, transforms, masks, retimes, fades, captions, and unsupported clip
types. Resolve or bake those items before delivery. NodeTool never reports an
incomplete editable export as lossless.

## Work with the agent

The agent can inspect takes, select an approved take, create or query media
tracks, adapt a sequence format, and request a generative edit. Give it the
editorial intent and the target clip. For example: "Track the product in the
hero shot, attach the price graphic, then make a vertical version of this cut."

Check the resulting takes, tracks, and framing before export.

## Related features

- [Video Editor](video-editor.md) — timeline, playback, clip editing, and MP4 export
- [Workflow Editor](workflow-editor.md) — edit a workflow bound to a generated clip
- [Asset Management](asset-management.md) — organize imported media
