# Web follow-ups for the native timeline

The native timeline keys parameters the web editor does not. The document schema is unchanged, so
web opens and saves these documents. Each entry below says what native does, what web does with the
same document, what web needs, and where. Add an entry in the same commit as the native behaviour.
Ids are stable. Move a finished entry to [Done](#done) and keep its id.

Web here means `web/` and `packages/`. Nothing in them has changed for this work.

## How these keys are stored

Curves with a name in `ANIMATED_PROPERTIES` (`packages/timeline/src/animation/types.ts`) go on the
clip's keyframe animation, the one with `params.keyframed`, and web draws them.

Curves with any other name go on side animations (`src/scene/SideCurves.h`). A side animation looks
like this:

```json
{"id": "...", "role": "loop", "preset": "breathe", "durationMs": 2000, "delayMs": 0, "enabled": false,
 "params": {"intensity": 0, "sideCurves": true},
 "custom": {"curves": [{"property": "depthPx", "keyframes": [{"t": 0, "value": 0}]}]}}
```

Each animation holds at most 16 curves, and a clip has as many as it needs. The shape comes from
these web behaviours, each checked against this branch's sources by importing them:

- `customClipAnimation.curves` accepts any property name but refuses more than 16 curves, and
  `clipAnimation` keeps `custom` on any preset. So parsing and saving keep the curves.
- `normalizeCustomCurves` refuses a whole curve list for one unknown name, and `compileClipAnimations`
  then skips that animation. The comment on `animationPropertyCurve` says only the one curve is
  dropped, which is not what the code does. A new name on the keyframe animation would stop web
  drawing every key on that clip.
- `validateTimelineSequence` reports an error for an unknown preset and for an invalid custom list,
  whether or not the animation is enabled. `set_timeline_document` and the agent bake refuse to write
  a document with errors. So the side animation names a stock preset and is switched off.
- `breathe` at intensity 0 draws nothing, so switching the row on in web changes nothing.

A curve name on a side animation is a parameter name. An effect parameter is `effect:<effectId>:<param>`.

## Open

| ID | Native | Web today | Web needs | Where |
|---|---|---|---|---|
| W1 | Side animations hold keys for parameters with no channel, and the native Inspector hides them. | Keeps them through open and save. Lists each as a switched-off Breathe row in the clip's animations. Deleting that row deletes the keys. A split gives both halves the whole curve, stretched over each half. | Hide rows with `params.sideCurves`. Slice their curves in a split, as `sliceKeyframeAnimation` does. | `web/src/components/timeline/Inspector/ClipAnimations.tsx`, `packages/timeline/src/splitClip.ts` |
| W2 | Anchor X/Y and Rotation X/Y have stopwatches, on channels web already has. | Draws the animated values, since the channels are shared. Its Inspector has no row for them, so it shows the static value and no keys. The Premiere XML report says they require baking. | Rows for these channels. | `web/src/components/timeline/Inspector/keyframeRows.ts`, `KEYFRAME_PROPERTIES` in `packages/timeline/src/keyframes.ts` |
| W3 | Perspective (`perspective`, replaces the static value) and Depth (`depthPx`, adds to it) are keyed on side curves. Depth also reorders the stack per frame. | Keeps the curves and draws the static values, so the picture differs from native while either is keyed. | Read the side curves in the animated layer props and in the draw order, and add rows. | `resolveAnimatedLayerProps` in `packages/timeline/src/render/sceneModel.ts`, `keyframeRows.ts` |
| W4 | `scripts/plan-conformance.mjs` compares perspective, depth and the draw matrix per layer, and that matrix depends on the cropped size. | The oracle uses web's code, so a document with W3 or W7 keys reports a mismatch. No fixture has such keys, and no example timeline can, since only native writes them. | Nothing until W3 and W7. Then add a fixture. | `scripts/plan-conformance.mjs`, `fixtures/` |
| W5 | Clip Volume is keyed on a `volumeDb` side curve, in dB on top of `volumeDb`. Preview and export multiply it with track automation, as Premiere's clip and track volume do. | Keeps the curve and plays the static `volumeDb`, so the mix differs from native while it is keyed. Saving keeps it, including while the Volume switch is off, because the curve stays on the side animation. | A per-sample gain from the curve, and a row. | `web/src/components/timeline/preview/AudioGraph.ts`, `render/renderAudio.ts`, `keyframeRows.ts` |
| W6 | The Premiere report notes that Volume keys are left out, from the open document. | The XML writer puts the static level and fade keys in Audio Levels and does not read side curves, so its own report says nothing about them. | Write the `volumeDb` curve into Audio Levels with the fade keys, and report side curves. Then remove the native note. | `packages/timeline/src/interchange.ts`, `interchangeMotion.ts`, `src/interchange/PremiereTransfer.cpp` |
| W7 | Crop is keyed per edge on `cropLeft`, `cropTop`, `cropRight` and `cropBottom` side curves, which replace the static edge. Opposite edges keep 5% of the picture between keys. | Keeps the curves and draws the static `crop`, so the picture differs from native while they are keyed. | Sample the edges where the crop is read, and add rows. | `cropRectPx` callers in `packages/timeline/src/render/`, `keyframeRows.ts` |
| W8 | Corners are keyed on a `borderRadius` side curve, which replaces the static value. | Keeps the curve and draws the static `borderRadius`. Web can animate it through a `clip.borderRadius` style track instead, which native also reads, and that track is a separate store. | Read the side curve or migrate it to a style track, and add a row. | `packages/timeline/src/render/sceneModel.ts`, `keyframeRows.ts` |
| W9 | Numeric parameters of video effects from the Effects panel are keyed on `effect:<effectId>:<param>` side curves, one generic path. Each replaces the effect's static value at render time. Removing an effect removes its curves, and Paste Attributes moves them with the effects. | Keeps the curves and draws the static values. A web edit that removes an effect leaves its curves behind, which do nothing. | Apply the curves where effects are read. A web `styleTracks` target `effect.<id>.<param>` already animates a parameter, so these could migrate to it. Add rows. | `packages/timeline/src/render/sceneModel.ts`, `web/src/components/timeline/Inspector/` |

## Done

None yet.
