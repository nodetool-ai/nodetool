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

1. Generate a clip, then create another take with **Regenerate as new clip** or generate again.
2. Select the clip, open **History** in the Inspector, and choose **Preview Candidate** to audition a take in place.
3. Choose **Use take** on the take that belongs in the cut.
4. Keep useful alternatives or remove candidates you no longer need.

The active take is the one used by preview, render, and interchange export.
If a generated take fails, the previously active take remains in place.

## Track a subject

A media track stores a subject's position over source time. Bind a clip's
position, scale, or mask to that track when a title, graphic, or mask must
follow a moving subject.

Create the track with the agent's `track_object` tool (it needs a provider that implements `track_object`, and a box around the subject at the start of the range), then attach the dependent clip. The Inspector's **Tracking** section lists a clip's tracks. Its **Follow object** section binds the clip to a track in **Position** or **Position + scale** mode, with offsets and smoothing. The **Subject matte** section uses a track for a mask.
The binding follows trims and clip movement because it uses source time rather
than the timeline's absolute position. A changed source asset makes its media
tracks stale. Re-run tracking before relying on a stale track.

## Adapt a cut for another frame

Choose **Adapt format** in the timeline's overflow menu (the three-dot button in the tab row). Pick one or more target formats (9:16, 1:1, 4:5), a strategy, and a safe margin of 0 to 30 percent. Each format becomes a new sequence that shares the source media. The source sequence stays unchanged.

| Strategy | Behavior |
| --- | --- |
| Center | Crops each clip around the center. |
| Smart Reframe | Uses subject tracks or authored framing. Unavailable until every visual clip has a current subject track or authored framing. |
| Follow selected object | Follows one ready subject track. Unavailable until a track exists. |

Review the derived cut, then open **Smart Reframe** in the Inspector for a clip. Choose its subject (auto, center, or a track) and add manual framing keys where the automatic crop needs direction. Framing is stored in source time, so it follows trims and moves. The section flags automatic framing as stale when the source asset changes. Preview and render use the same framing data.

## Repair or extend a shot

Generative timeline edits (the **AI Edit** section for a video clip, or the agent's `ui_timeline_generatively_edit_clip` tool) create a candidate take. They do not replace the
active media until you select the result.

Available operations include:

- Extend a shot at its start or end (`extend`).
- Replace a source range (`replace_range`).
- Remove or replace a tracked object (`remove_object`, `replace_object`).
- Restyle a shot (`restyle`) or regenerate it (`regenerate`).

The clip must be a video clip with a current asset and a positive duration.

Object operations require a ready media track for the active source. Before
running an edit, NodeTool checks the requested operation against the selected
model's capabilities. If the model cannot perform the edit, choose another
model or change the operation.

## Hand off a sequence

`exportInterchange` in `@nodetool-ai/timeline` writes an editable project document for another editor. No editor menu, CLI command, or agent tool calls it yet. Use it from code until one does.

| Target | Output | Carries |
| --- | --- | --- |
| Final Cut Pro | FCPXML | sequence format, active media, timing, tracks, and markers |
| Premiere Pro | Legacy FCP XML | sequence format, active media, audio and video tracks, timing, and markers |

The export report names missing media and edits that need baking, including
effects, transforms, masks, retimes, fades, captions, and unsupported clip
types. Resolve or bake those items before delivery. NodeTool never reports an
incomplete editable export as lossless.

## Work with the agent

The agent can read each clip's active take id through `ui_timeline_get_state`, select a take with `ui_timeline_apply_take`, create a media track with `track_object`, adapt a sequence format with `ui_timeline_retarget_format`, set framing with `ui_timeline_set_reframe_subject` and `ui_timeline_add_reframe_keyframe`, and request a generative edit with `ui_timeline_generatively_edit_clip`. Give it the
editorial intent and the target clip. For example: "Track the product in the
hero shot, attach the price graphic, then make a vertical version of this cut."

Check the resulting takes, tracks, and framing before export.

## Related features

- [Video Editor](video-editor.md) — timeline, playback, clip editing, and MP4 export
- [Workflow Editor](workflow-editor.md) — edit a workflow bound to a generated clip
- [Asset Management](asset-management.md) — organize imported media
