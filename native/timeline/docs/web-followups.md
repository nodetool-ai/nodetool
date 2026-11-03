# Web follow-ups for the native timeline

The native timeline keys parameters the web editor does not. Each entry below says what native does, what web does with the same document, what web needs, and where. Add an entry in the same commit as the native behaviour. Ids are stable. Move a finished entry to [Done](#done) and keep its id.

## How these keys are stored

Curves with a name in `ANIMATED_PROPERTIES` (`packages/timeline/src/animation/types.ts`) go on the clip's keyframe animation, the one with `params.keyframed`, and web draws them.

Curves with any other name go in the clip's optional `paramCurves` field (`timelineClip.paramCurves` in `packages/protocol/src/api-schemas/timeline.ts`, `src/scene/ParamCurves.h` in native):

```json
"paramCurves": [
  {"property": "volumeDb", "keyframes": [{"t": 0, "value": 0}, {"t": 1, "value": -12, "easing": "easeIn"}]},
  {"property": "effect:<effectId>:radius", "keyframes": [{"t": 0, "value": 4}]}
]
```

The curve shape and clock are those of a custom animation's curves, with `t` normalized over the clip. The list holds at most `MAX_PARAM_CURVES` (`packages/timeline/src/paramCurves.ts`) and a curve at most `MAX_CUSTOM_KEYFRAMES` keys, pinned in `packages/execution/tests/timeline-schema-bounds.test.ts`. Any name parses and validates, and a name no reader knows is kept and ignored. The animation compiler never reads the field, so nothing here can affect the keys on the keyframe animation.

| Name | Fold | Keys |
|---|---|---|
| `volumeDb` | Adds to the static level, in dB | Volume |
| `perspective` | Replaces the static value | Motion |
| `depthPx` | Adds to the static value | Motion |
| `cropLeft`, `cropTop`, `cropRight`, `cropBottom` | Replaces the static edge | Crop |
| `borderRadius` | Replaces the static value | Corners |
| `effect:<effectId>:<param>` | Replaces the effect's static value | A numeric effect parameter |

A switched-off Motion, Opacity or Volume group holds its curves in `bypassedFixedEffects.<group>.curves`.

### What web does today

Web keeps the field through open and save and shows no rows for it. These operations handle it, in `packages/timeline` and `web/src/stores/timeline`:

- A split slices each curve at its value, a merge joins the halves back, and a trim stretches keys with the clip, as a hand-set keyframe does.
- Removing an effect, through `patchClip` or the `set_effects` op, removes its `effect:<id>:*` curves.
- Paste Attributes moves a curve with the group its parameter belongs to: effect keys with Video effects, volume keys with Volume, the others with Animations and keyframes.

Web draws the static values, so a clip's picture and sound differ from native while these keys are on.

## Open

| ID | Native | Web today | Web needs | Where |
|---|---|---|---|---|
| W2 | Anchor X/Y and Rotation X/Y have stopwatches, on channels web already has. | Draws the animated values, since the channels are shared. Its Inspector has no row for them, so it shows the static value and no keys. The Premiere XML report says they require baking. | Rows for these channels. | `web/src/components/timeline/Inspector/keyframeRows.ts`, `KEYFRAME_PROPERTIES` in `packages/timeline/src/keyframes.ts` |
| W3 | Perspective and Depth are keyed in `paramCurves`. Depth also reorders the stack per frame. | Keeps the curves and draws the static values. | Read the curves in the animated layer props and in the draw order, and add rows. | `resolveAnimatedLayerProps` in `packages/timeline/src/render/sceneModel.ts`, `keyframeRows.ts` |
| W4 | `scripts/plan-conformance.mjs` compares perspective, depth and the draw matrix per layer, and that matrix depends on the cropped size. Effect chains are not compared. | The oracle uses web's code, so a document with W3 or W7 keys reports a mismatch. No fixture has such keys, and no example timeline can, since only native writes them. | Nothing until W3 and W7. Then add a fixture. | `scripts/plan-conformance.mjs`, `fixtures/` |
| W5 | Clip Volume is keyed on `volumeDb`. Preview and export multiply it with track automation, as Premiere's clip and track volume do. | Keeps the curve, including in the Volume stash while the switch is off, and plays the static `volumeDb`. | A per-sample gain from the curve, and a row. | `web/src/components/timeline/preview/AudioGraph.ts`, `render/renderAudio.ts`, `keyframeRows.ts` |
| W6 | The Premiere report notes that `paramCurves` keys are left out, from the open document. | The XML writer puts the static level and fade keys in Audio Levels and does not read `paramCurves`, so its own report says nothing about them. | Write the `volumeDb` curve into Audio Levels with the fade keys, and report the other curves. Then remove the native note. | `packages/timeline/src/interchange.ts`, `interchangeMotion.ts`, `src/interchange/PremiereTransfer.cpp` |
| W7 | Crop is keyed per edge. Opposite edges keep 5% of the picture between keys. | Keeps the curves and draws the static `crop`. | Sample the edges where the crop is read, and add rows. | `cropRectPx` callers in `packages/timeline/src/render/`, `keyframeRows.ts` |
| W8 | Corners are keyed on `borderRadius`. | Keeps the curve and draws the static `borderRadius`. Web can animate it through a `clip.borderRadius` style track, which native also reads, and that track is a separate store. | Read the curve or migrate it to a style track, and add a row. | `packages/timeline/src/render/sceneModel.ts`, `keyframeRows.ts` |
| W9 | Numeric parameters of effects from the Effects panel are keyed on `effect:<effectId>:<param>`. A parameter a web style track already animates takes no keys in native. | Keeps the curves and draws the static values. | Apply the curves where effects are read, and add rows. A web `styleTracks` target `effect.<id>.<param>` already animates a parameter, so these could migrate to it. | `packages/timeline/src/render/sceneModel.ts`, `web/src/components/timeline/Inspector/` |

## Done

| ID | What it was | How it closed |
|---|---|---|
| W1 | Keys for parameters with no channel sat on carrier animations, which web listed as switched-off rows and duplicated whole on a split. | Replaced by the `paramCurves` field, so there are no rows, and a split slices the curves. |
