---
name: motion-graphics
description: Build and review a NodeTool timeline piece — the motion agent's entry point. Covers the build loop, choosing between the code pack and edit ops, the revise-by-editing-the-script loop, and the review pass. Use for title cards, kinetic text, lower thirds, clip entrances and exits, and layered motion.
featured: true
---

# Motion Graphics → Timeline Agent

## Before the first edit of a new piece

When starting a piece from a brief, load `motion-direction` and
`motion-principles` with `load_skill` before the first timeline edit. Use them
to set the motion language and timing for the whole piece. Do not start
animating from this file alone.

If the piece has a title layout or an end card, also load `frame-composition`
before that first edit. If it has an end card, load `logo-reveal` too. These
loads are required even when this skill was the only one selected from the
catalog.

For showcase, hero, launch, or "best" briefs, follow `motion-direction`'s
depth plan and example timelines before writing scenes.

Motion is built, then checked. Author with the pack or with ops (below), then
look at the frames with `preview_timeline_frame`. A change you have not looked
at is not done.

## Load other craft skills for the job

This file is the build loop and the entry point, not the op contract. After
the required loads above, load other relevant craft skills for the job and
come back here to pick the authoring surface.

| The question | Skill |
|---|---|
| Where do the cuts land, how do I pace it, how do I ramp a hit | `beat-sync-editing` |
| Which colours, in what order do I grade, what can actually move | `color-motion` |
| A preset is close but not right; overshoot, decay, wiggle, arc, draw-on | `motion-curves` |
| An ambient bed behind the content | `motion-background` |

Three are neighbours rather than layers. `caption-titles` decides what text
says and when it appears. `video-audio-continuity` decides, before the first
clip renders, whether a multi-scene piece's sound comes from one generated clip
or from a track of your own — a decision this file's ops cannot undo. The
board skills (`explainer-storyboard`, `commercial-beat-sheet`,
`launch-commercial`, `music-video-treatment`, `trailer-template`) decide the
shots before there is a timeline to animate; `assemble_storyboard_timeline` is
where their board becomes this file's document.

Anything generated for the timeline — a bed, a sting, a voice, a clip — has a
model line with its own guide. `find_model` returns `prompting_skill` on a
route it covers; `load_skill` it before writing that prompt.

## The build loop

Build a piece in four moves: **direct** (fix the motion language and the
scene list before writing anything — `motion-direction` and, when there is a
title or end card, `frame-composition`/`logo-reveal`), **build** (write the
scenes in code, one `v.scene` per beat), **save** (`v.save()` attaches the code; read
`saved.code` and `saved.warnings`), **review** (the
pass below). Revise by editing that script — see below — and repeat the
last two steps. A piece that renders clean on the first save has not been
looked at yet.

## Choose the authoring surface

Two ways to touch a timeline document. Pick by what changed, not by habit.

| Situation | Surface |
|---|---|
| A new cut, or a scene with more than a few clips | `@nodetool-ai/sandbox-timeline` (code) |
| A few edits to a cut that already exists — retiming a clip, swapping a preset, nudging a stagger | `edit_timeline` ops |

**Code, for a new cut.** In a JS script or a Code node, `import { video } from
"@nodetool-ai/sandbox-timeline"`. Its `video()` builds a document of scenes
(`v.scene(name, seconds, fn)`, local time in seconds), lays them out with
`v.series([...])`, and `v.save(nodetool.timelines, {...})` writes the whole
document in one call and returns `{timeline_id, errors, warnings}`. A cut
with hundreds of keyframed clips costs a handful of API calls this way,
instead of one `edit_timeline` op per clip. NodeTool's shipped example
timelines (Kite, Prism, Voltra, Tidewater, T minus 30) are built with it. Its
full signatures, options and gotchas are the pack's own skill — read
`nodetool.packs.docs("@nodetool-ai/sandbox-timeline")` before writing scenes,
not this file. `frame-composition` covers how to lay out what goes inside a
scene; this file covers the build loop and the ops surface below.

**Ops, for an edit.** `edit_timeline` takes a timeline ID and an `ops` array,
run in order, up to 60 per call:

```json
{"timeline_id":"<id>","ops":[{"op":"animate_clip","target":"Title","animations":[{"role":"in","preset":"fade","durationMs":400}]}]}
```

Its full op shapes, what each op refuses, and when a change instead needs a
whole-document `set_timeline_document` write are `timeline-edit-ops` — load it
before a batch of ops, not this file.

## A compact two-scene piece

The build loop end to end: a backdrop, a laid-out title block, a counter, a
transition, a finish pass, save, then read the warnings.

```js
import { video } from "@nodetool-ai/sandbox-timeline";

const v = video({
  width: 1920, height: 1080, fps: 30,
  palette: { ink: "#06110e", ink2: "#0c2a21", text: "#f4fbf8", accent: "#34d399" },
  fonts: { display: "Space Grotesk", body: "Inter" }
});

const hello = v.scene("Hello", 2.5, (s) => {
  s.backdrop();
  const kicker = s.kicker("LIVE");
  const title = s.text("Round-ups", { size: 120, weight: 700, font: "display" });
  const sub = s.text("on every card", { size: 40, color: "#8fb3a6" });
  s.stack([kicker, title, sub], { gap: 20 }); // frame-composition: a title block
  title.enter({ from: { scale: 1.2, opacity: 0 }, dur: 0.3, ease: "outExpo" });
  sub.enter({ from: { offsetY: 24, opacity: 0 }, at: 0.15, dur: 0.25 });
});

const outro = v.scene("Outro", 1.8, (s) => {
  s.backdrop({ colors: ["#0f3b2e", "#06110e"] });
  const counter = s.text("$0.00", { size: 96, font: "display" });
  counter.count({ from: 0, to: 1.6, dur: 1.2, prefix: "$", decimals: 2 });
  s.finish({ vignette: 0.2, grain: 0.05 });
});

v.series([hello, v.transition("wipe", 0.3, { direction: "left" }), outro]);

const saved = await v.save(nodetool.timelines, { name: "Round-ups", showcase: true });
if (saved.warnings.length) {
  // read them before calling this done — see Review pass below
}
```

## Author and revise with code

`v.save(nodetool.timelines, {...})` attaches the code that rebuilds the
timeline as its source — no separate `code.set` call. The stored code is the
retained program: the scene callbacks and the helpers they use, with every
research result, generated asset id and loop value written in as a literal.
The calls that produced those values ran once, in your action, and a rebake
never repeats them. `saved.code.embedded` is false, with the reason in
`saved.code.warnings`, when a scene callback calls `nodetool.*`, uses
`Math.random()`/`Date.now()`, or reads a value that is not plain data. Do the
research and generation at the top level, then build the scenes from the
results. To attach code after the fact,
`nodetool.timelines.code.set(timeline_id, code)` bakes the code, which must
build the timeline without a capability call.

Revising a code-backed timeline is: `code.get(id)` → `code.edit(id, edits)`
with a few small exact string replacements (each `old` matches exactly once)
→ read the `conflicts` and `warnings` it answers → look at frames. This is
the review → revise → rerun loop from the build loop above, made cheap — a
two-line diff instead of a 500-line resend. `edit_timeline` ops still apply
for a timeline with no code, or a deliberate hand tweak — `timeline-edit-ops`
owns that contract and what it costs a code-backed scene. The pack's own
skill (`@nodetool-ai/sandbox-timeline`) covers what code-backed identity
means for scene names and clip ids; `api-timelines` owns the full `code.*`
call contract.

## Review pass

For a showcase, hero, launch, or "best" piece, critique like a director before
calling it done. A render with no errors is not a finished piece — this pass is
part of the job, not a step to skip when the frames look clean. Reserve rounds
for it: the run budget is shared with authoring, so budget for at least one
full pass plus one revision, not just the build.

1. **Contact sheet.** `preview_timeline_frame` with `sheet: true`, sampling
   every scene at its entrance, its hero hold, and its exit.
2. **Per-scene checklist**, answered in writing before you touch an op:
   - What does the eye follow first, and is that the intended hero?
   - What moves in the background? A static bed behind the action is a
     finding, not a pass.
   - Does any text touch or get crossed by a shape?
   - How much of the frame is actually used? Look yourself — the validator's
     `showcase_frame_underfilled` check is a bounding-box proxy and can miss a
     thin outline or ring that reads as sparse against an empty backdrop.
   - Does every number that is supposed to count actually count, and finish
     while it is still on screen?
   - How does the scene exit and the next one enter? A default crossfade on a
     showcase brief is a finding to name, not the absence of one.
3. **Compare against a reference.** Pick the closest scene with
   `examples.list()` / `examples.get(slug)`. Render matching-beat sheets of
   your piece and that example with `preview_timeline_frame`, `sheet: true`,
   mapping beats across differing durations and sampling the middle of a
   move. Call `view_image` on both with this explicit question: "Compared
   with the example, what is missing in layer count, secondary motion,
   texture and light, and camera depth? Name the beat and the gap." Read how
   the example scene was actually built with `examples.source(slug)` when the
   clip excerpt alone does not explain a moment — a repeater's phase offsets,
   a two-pass text effect, a shared id scheme. `compare_timeline_frames`
   cannot target a shipped example — both its sides must be your own timeline
   (an id, version or document) — so use it after a revision to prove which
   frames actually changed, not to judge against a reference.
4. **Validate at the showcase tier.** `validate_timeline(id, {tier:
   "showcase"})` returns `errors` and `warnings` — there is no `issues` field.
   Every `showcase_*` warning is a hard stop: resolve it, or state the
   specific artistic exclusion to the user before rendering. Expect
   `showcase_scene_groups_missing`, `showcase_custom_motion_missing`,
   `showcase_finish_missing`, `showcase_camera_missing`,
   `showcase_layer_density_low`, `showcase_scene_group_density_low`,
   `showcase_custom_animation_density_low`, `showcase_effect_variety_low`,
   `showcase_clip_density_low`, `showcase_motion_blur_missing`, plus
   `showcase_frame_underfilled`, `showcase_text_collision`,
   `showcase_motion_range_narrow` and `showcase_dead_motion`. Each names a
   shipped example to study. Zero warnings is a structural floor, not a
   craft verdict — the medians in the warning text are the design target.
5. **Revise, then re-run this pass.** Make at least one revision that changes
   the composition itself, not only a fix for a validator error, before
   calling the piece done. Then repeat steps 1–4 on the result. Stopping at
   the first clean render is the failure this pass exists to catch.
