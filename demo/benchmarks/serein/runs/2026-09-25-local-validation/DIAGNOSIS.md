# Serein picture diagnosis

The highest-priority finding is a confirmed server export defect: adjustment layers are omitted before the GPU compositor. The other investigated score losses reproduce as authored motion, layout, or visibility choices in both CPU preview and GPU export. This diagnosis changes no production code or authored timeline. It preserves the validated full export.

## Evidence and scope

Read the local validation RESULTS.md, all three independent judge JSONL files, BRIEF.md, JUDGE.md, the saved `demo/out/serein-doc.json`, and the builder. Inspected the validated checkpoint and motion sheets. Compiled and sampled the actual saved animations, then rendered twelve isolated fixtures through `renderTimelineFrames` and `renderTimelineComposited` in a separate local process. Every fixture completed with no skipped clips. CPU reports list no dropped layers or degradations.

Artifacts are under `/tmp/serein-picture-diagnosis`. Each fixture directory contains `input.json`, CPU PNGs and reports, `gpu.mp4`, and `comparison.png`. Comparisons put CPU on top and GPU below. CPU preview caps width at 1280, while the GPU fixture renders at 1920. Both rows are displayed at the same size. These comparisons establish matching behavior, not pixel-perfect parity. Scene transitions, camera, finish, and unrelated layers were removed from isolated motion cases. Full original checkpoint sheets supply the surrounding composition. Single-frame generator controls freeze time at the original frame.

## F1 — GPU export drops adjustment layers (confirmed renderer defect, highest priority)

C2 has two causes. The renderer cause is independent of strength: `packages/video-nodes/src/nodes/timeline/compositeRender.ts:295` destructures only `layers` and `precomposites` from the scene model. Its `FrameSample` return at line 459 omits `adjustments`. `HeadlessFrameCompositor.renderFrameSamples` supports `sample.adjustments`, but therefore receives none. CPU preview maps and draws the adjustment records at `packages/agents/src/timeline-preview/frames.ts:535`.

Falsifiable control: isolate the actual counter and its sibling RGB adjustment at frame 110, then change only RGB strength from its resolved 0.2155504 to 12. CPU shows strong colored edges at 12. GPU decoded frames remain byte-identical: SHA256 `e10a8fea78abb5be90dae82bae93bfc1a59c4fccbcc192921edcc996c356bef5` for all 6,220,800 RGB bytes in both outputs. See `rgb/comparison.png` and `rgb12/comparison.png`.

A direct compositor control bypasses the export adapter. On a 64×16 white stripe over opaque black, a 12-pixel RGB adjustment changes 640 of 1,024 pixels, all 640 colored. The GPU shader and compositor work when given the adjustment.

Concrete fix: map the scene model's adjustment records into every returned `FrameSample`, including id, zIndex, opacity, effects, mask, wipe, and precomposeGroupId. Add a server-export boundary regression for root and nested adjustments and motion-blurred samples. Existing tests against the GPU compositor alone cannot detect this adapter omission. Preserve the static-shutter optimization, but ensure animated adjustments participate in its static decision.

The same omission affects every adjustment in this Serein document: S1 RGB split, S5 vignette, the frame-640–644 glitch join, and global grain/dither. Their contribution must be reassessed after the adapter fix. There is no basis for claiming that the current export demonstrates those features.

## F2 — RGB strength is subpixel even after the adapter is fixed (authoring/unit mismatch)

At frame 110 the actual saved style track resolves to 0.2155504. At frame 122 it reaches 0.4. `packages/gpu/src/shaders/filters/visualFx/v1/module.ts:99` divides this number by texture dimensions, so it denotes pixel displacement, not a normalized intensity. At the 640-pixel checkpoint display the intended frame-110 shift is approximately 0.072 pixel. The CPU original-strength fixture also has almost no visible separation.

Concrete fix: after repairing F1, choose a visibly measurable pixel displacement, initially around 6–12 source pixels, inspect at checkpoint resolution, and tune down. The brief's numeric 0–0.4 ramp conflicts with its demand for a clearly visible RGB split under the current effect's units. Record that conflict rather than claiming both have been satisfied. A parameter description naming pixel units would prevent this mistake, but is outside this diagnosis.

## F3 — Fast normalized easing hides most movement during fades (authoring/API semantics)

The compiler and CPU/GPU fixtures agree on the following values. There is no reproduced early-frame caching or animation-loss defect.

| Samples | Actual resolved behavior | Why the strip reads as a pop | Concrete adjustment |
|---|---|---|---|
| M1 counter | At f8/f9/f10/f12/f14/f20 opacity is .011/.445/.689/.902/.969/1. Blur is 29.66/16.64/9.34/2.94/.93/0. | At 320-pixel display, f10's effective Gaussian sigma is about .52 displayed pixel. It already looks sharp. By f12 the fade is 90% complete. | Preserve the required expo if strict compliance is the priority, and evaluate dense frames. A visibly longer reveal needs a slower fade or delayed/longer deblur, which departs from the literal 12-frame expo requirement. |
| M3 first sort card | At f251/f252/f253/f254, remaining Y flight is 600/432/192/38px, opacity .005/.254/.502/.751. At f256 it overshoots by 29px. | The 15-frame spring covers 94% of travel in 3 frames. Its 4-frame fade conceals the largest motion. The rubric samples f251 then f256. | Expose the card earlier with a quicker fade and inspect every frame. To retain substantial visible travel over 500ms, bake a spring evaluated in physical seconds rather than stretching the normalized settling curve into 500ms, or deliberately change its duration. |
| C10 tone pill | Move starts f470. At f474 it has covered 221.6 of 237px. At f476 it overshoots to 248.6px. At f480 it is at 238.25px. | The checkpoint is 10 frames into a 20-frame spring but almost exactly at the destination. | Bake a physically timed spring over the requested window, or retime the entrance so its visibly moving phase includes f480. The latter conflicts with the specified local-frame-14 start. |
| M5 zero slam | At f600/f601/f602/f604/f607 scale is 1.4/1.148/1.055/1.0076/1. Blur is 30/11.13/4.13/.57/0. | The 7-frame expo is already 86% finished by the second frame. The strip skips f601. The particles also compete with its silhouette. | Clear the particle field around the numeral first. For stronger perceived motion, change the scale curve or duration deliberately. The current isolated render follows the literal brief. |
| M6 end logo and CTA | Logo scale f668/f670/f673/f678 is 1.200/1.102/.996/.999. Its opacity is .003/.337/.837/1. CTA opacity f688/f690/f692/f700 is .005/.630/.862/.997. | Most logo scaling happens while it is faint and under the flash/leak. A 20px CTA rise is only 3.3px in the 320px strip. | Let the logo scale remain visible after the flash, or retime the scale independently of the fade. Verify the prescribed 20px rises at full size and denser samples before increasing travel. |

`spring(170,18,1)` here normalizes its time to an envelope of 1e-4 residual by t=1 (`animation/easing.ts:242`). This is documented implementation behavior. A 500ms authored window is not the same trajectory as an unnormalized physical spring simulated for 500ms. That distinction explains the rapid flight and Warm-pill settle, without proving the easing implementation is wrong.

Artifacts: `counter/comparison.png`, `fly/comparison.png`, `tone/comparison.png`, `zero/comparison.png`, `end/comparison.png`; exact authored and compiled data are in `samples.json`.

## F4 — Toast timing contains an explicit brief/checkpoint conflict (authoring)

The scene prose says local 76–88, which means absolute f532–544. C11 asks for a toast entering at f530, two frames before that window. The builder consciously uses local 72–84 instead, or f528–540.

The actual saved animation resolves to opacity 0 at f528, .439 at f529, .685 at f530, .901 at f532, and .990 at f536. CPU and GPU isolated toast fixtures show the same progression. Thus “fully visible at f530” is an appearance judgment, not literal full opacity. The judge note saying it is visible at f528 also exceeds what the isolated sample shows: that frame is exactly zero opacity. Full-image particles/compression and thumbnail interpretation do not establish a timing bug.

Concrete fix: choose explicitly whether scene prose or checkpoint takes precedence. To meet the checkpoint with an unmistakable partial state, begin closer to f529 and use a less front-loaded opacity curve while retaining position easing. That is an authoring change, not a renderer repair. See `toast/comparison.png`.

M4's plane path is curved, and CPU/GPU fixtures agree. Its direction changes from about −15° at f520 to −55° at f524 and −59° at f528, then becomes a long near-diagonal exit. Centre positions at f520/f524/f528/f532 are (525,158), (665,33), (767,−132), (871,−306). By f536 x=986 is outside the 960px half-width. The visible path is short and most of its bend is near launch. A stronger onscreen curve needs different control points or a later exit. This is art direction, with no reproduced followPath defect. See `plane/comparison.png`.

## F5 — Eight-card column intersects the headline (authoring layout, high confidence)

Both the CPU and GPU full-S4a isolation reproduce the lowest Later card behind “Sorted before you look.” at f330. The saved layout has eight Later slots, top centre y=−240, step104, last centre488. Before perspective, its card bottom is y532. With board scale .88 and position y−50, that maps to approximately screen y958, directly in the headline region.

The specified 104px spacing and eight rows require deliberate room allocation. The builder's board scale/position leave too little space. A concrete starting adjustment preserving the 104px step is board scale .8 and position y−100: nominal bottom becomes866, with the header around156. Recheck projected corners and headline bounds. Alternatively compact the row spacing, recording that departure from the brief. See `overlap/comparison.png`.

## F6 — Particle layer competes with the numeral and subline (authoring/capability mismatch)

The two full-frame particle generators use full amount1, different colored seeds, screen blending, and no exclusion mask. They sit above the zero. Removing only those particle clips cleans up the numeral and subline in both render paths at f604. See `particles/comparison.png` versus `particles-off/comparison.png`.

The mode's actual shader scatters one particle per grid cell and drifts its centre vertically with time (`visualFx/v1/module.ts:184`). It is not a radial burst with birth time, initial position, and outward velocity. Calling it a “burst” does not make it one. The author starts this continuous field at f600 and fades it, so particles fill the screen immediately.

Concrete fix: reduce opacity/density and exclude the zero/subline region with a mask. For the described burst, use a bounded set of shape particles with outward animated positions and fade, or add an explicitly specified radial-burst capability in a separate task. The current result is not evidence of a broken existing particle renderer.

## Reproduction commands

From the repository root:

```bash
node --import ./node_modules/tsx/dist/loader.mjs /tmp/serein-picture-diagnosis/sample.mts
node --import ./node_modules/tsx/dist/loader.mjs /tmp/serein-picture-diagnosis/render.mts
python3 /tmp/serein-picture-diagnosis/inspect.py
node --import ./node_modules/tsx/dist/loader.mjs /tmp/serein-picture-diagnosis/direct-adjustment.mts
```

GPU commands require macOS GPU access outside the restricted sandbox. They write only local diagnostic outputs. No server calls, asset-library writes, timeline uploads, edits to the validated export, or production code changes were used.

## Remaining uncertainty

No subjective craft-score improvement is claimed from these controls. The strongest renderer finding is F1, demonstrated by a strength control plus a successful direct-compositor control. The timing findings rely on exact saved-document samples and matching isolated CPU/GPU output. Thumbnail-based judgments can miss motions that exist, especially when the brief explicitly demands steep exponential easing. After F1 is fixed, the film needs a fresh full export because previously omitted grain/dither and other adjustments can change both appearance and rendering cost.
