# Native timeline motion parity

## Scope and ownership

F11 owns native motion evaluation, raster text, motion controls and their tests. F10 owns generation, providers, prompts, jobs, takes, agents, transcripts, scripts and storyboards. Caption and existing matte rendering belong to F11; caption or matte generation does not. The user deferred 3D. Shared application hosts, model, server, assets, compositor and shader changes are integration artifacts, not changes applied to the shared checkout. Concurrent F10 files are outside this work.

Dedicated existing files changed by F11 are `src/scene/Animation.cpp`, `src/preview/SceneEval.cpp`, `src/render2d/Rasterizer.cpp`, `src/render2d/tst_render2d.cpp`, `src/render2d/reference.mjs`, `src/preview/effects/EffectPlan.cpp`, `src/preview/effects/tst_effectplan.cpp` and `qml/Inspector/KeyframeClipAnimationEditor.qml`. Recursive `src/*/module.cmake` discovery registers dedicated sources and tests without a top-level CMake edit.

| Owned directory | Purpose |
| --- | --- |
| `src/motion/` | Motion evaluation regressions and differential oracle. |
| `src/motion/beat/` | Beat timing and shared-function comparisons. |
| `src/motion/controls/` | Follow-path picker, advanced motion, group and border-radius controls, mounted tests. |
| `src/motion/border/` | Border-radius pixel fixtures and contracts. |
| `src/motion/pixels/` | Effects, groups and secondary-source pixel comparisons. |
| `src/motion/shipped/` | Complete shipped-document import, field-preservation and pixel comparisons. |
| `src/motion/blur/` | Shutter sampling, source-pool, pixel and export checks. |
| `src/motion/capacity/` | Reusable effect scratch surfaces and retention tests. |
| `src/motion/orientation/` | Vulkan and OpenGL group orientation oracles. |
| `src/motion/capturedeadline/` | Shared capture readiness policy and timing/cancellation tests. |
| `src/motion/gesture/` | Preview-isolation helper and focused tests. |
| `src/motion/dof/` | Deferred camera depth-of-field causal diagnostic and fixture contract. |
| `src/motion/wipe/` | Ordinary-layer wipe helpers and strict pixel oracles. |
| `src/motion/blurcontrols/` | Motion-blur controls and mounted tests. |
| `src/motion/mattes/` | Existing generated-matte carrier and resolution checks. |
| `src/motion/maskoutsets/` | Strict masked-glow/outset comparisons, including the Voltra reproduction. |
| `src/motion/tracking/` | Track-binding evaluator, controls, pure and pixel oracles. |
| `src/motion/prism/` | Full-document Prism, source-decoding and placement regressions. |
| `src/motion/conformance/` | Cropped-source plan-oracle regression. |

## Behavior and evidence

The reference is `packages/timeline/src/animation/`, `render/sceneModel.ts`, `render/temporal.ts`, `render/textLayout.ts` and the web inspector. Native changes and temporary integration snapshots must preserve authored and unknown document fields.

| Area | Current behavior and verification | Boundary |
| --- | --- | --- |
| Text and stagger | Native rasterization retains the Latin HarfBuzz path and uses itemized fallback runs for missing glyphs, non-Latin scripts and color faces. Measured line stagger includes flex-resolved width. Raster references and mixed-script and color-emoji regressions passed. The large Latin outline path also passes the retained counter, overlapping-glyph, gradient and shadow cases. | Fallback fonts are host-provided. Cross-platform glyph pixel equality and bitmap emoji outline strokes are not established. |
| Animation, paths and links | Follow-path uses normalized boxes and arc-length sampling. Links sample authored source state without recursive links. Stepped follower time drives link clocks. Linked opacity keeps fade, transition and parent coverage. Beat timing resolves clip or sequence scope. | Scene tests and pure shared-function comparisons cover these behaviors. They do not establish full encoded-export pixel parity. |
| Repeaters and echoes | Copies have distinct identities and names, shifted clocks and repeater color inputs. Copies clear layout. | Expanded copies requiring secondary media need the unapplied source-pool integration patch. |
| Controls | Native controls cover path selection, repeaters, echoes, links and wiggle. The path picker copies shape geometry while retaining unrelated parameters. Mounted tests cover cancellation, invalid values, unknown fields and undo. | Group-host and radius-control wiring are unapplied integration patches. The inspected web inspector does not expose equivalent repeater, echo or link controls. |
| Crop, effects, masks and blends | Crop pixel origins preserve near-integral values after float storage. Existing effect, mask, blend, group-surface and outsets fixtures exercise the renderer. | Asset-ID-only generated mattes need the shared carrier and resolution integration. The candidate session resolver passes the zero- and two-surface single-fetch checks; the integration remains unapplied. |
| Motion blur and grain | The temporary integration stack implements per-tap scene and source scheduling and grain-clock fixes, with dedicated shutter and pool tests. | The blur patch is unapplied. Selected PNG and MP4 export frames pass; not every encoded frame was compared. |
| Tracking | Dedicated track-binding evaluator, controls and oracles exist; integration into scene evaluation and group controls is an unapplied patch. | The candidate passes mounted controls and live pixel comparisons for both follow modes, including source clocks, smoothing and backward fresh seeks. The production reference preserves the full fields. Integration remains unapplied. |
| 3D | Native evaluates model3d layers and 2.5D transforms. | The user deferred the glTF/model3d renderer. Plan geometry is not evidence of model pixels or export parity. |

Historical regressions failed before their fixes for follow-path sampling, source links, repeat/echo names and effects, wrapped and flex-wrapped stagger, mixed-script measurement, color emoji, crop origins, stepped wiggle and linked opacity. The original crop-origin reproduction floored an integral origin one pixel early. The original motion-blur reproduction changed the web image when reducing Prism's shutter samples but left native captures identical. These failures are retained in the focused tests and diagnostic harnesses.

## Shared integration artifacts

The following patches are integration artifacts. They have **not** been applied to the shared checkout. Their targets are listed so an integration owner can review conflicts with F10 and other work before applying them.

| Artifact in `docs/` | Shared targets |
| --- | --- |
| `motion-parity-integration.patch` | `src/server/FieldAudit.cpp`, `fixtures/plan/exclusions.json` |
| `motion-secondary-integration.patch` | `src/preview/SceneEval.{h,cpp}`, `src/preview/PreviewCompositor.cpp` |
| `motion-border-integration.patch` | `src/scene/TextAnimation.{h,cpp}`, `src/preview/SceneEval.{h,cpp}`, `src/preview/PreviewCompositor.cpp`, `shaders/composite.{vert,frag}` |
| `motion-export-duration-integration.patch` | `src/export/ExportEngine.cpp` |
| `motion-group-integration.patch` | `src/edit/inspectorsections/ClipGroupPanel.qml` |
| `motion-radius-controls-integration.patch` | `src/motion/controls/module.cmake`, `src/motion/controls/GroupMotion.qml` |
| `motion-blur-integration.patch` | `src/preview/SceneEval.{h,cpp}`, `src/preview/PreviewCompositor.cpp`, `src/preview/SourcePool.{h,cpp}`, `src/playback/PlaybackClock.{h,cpp}` |
| `motion-preview-integration.patch` | `src/model/TimelineModel.{h,cpp}`, `src/edit/inspectorsections/InspectorEdits.cpp`, `src/edit/keyframes/ClipInspectorController.cpp`, `src/preview/gizmo/TransformGizmoController.cpp`, `src/preview/crop/ReframeController.{h,cpp}`, `src/edit/transitions/TransitionController.{h,cpp}`, `src/app/startup/LocalDocumentSaver.{h,cpp}`, `src/motion/gesture/module.cmake` |
| `motion-capture-deadline-integration.patch` | `src/main.cpp`, `src/export/OffscreenFrames.cpp`, `src/motion/capturedeadline/module.cmake` |
| `motion-capacity-integration.patch` | `src/preview/effects/ClipEffects.cpp`, `DrawCache.{h,cpp}`, `src/motion/capacity/module.cmake` |
| `motion-crop-placement-integration.patch` | `src/preview/PreviewCompositor.cpp`, `shaders/composite.frag`, `shaders/effects/clip.frag` |
| `motion-gl-orientation-integration.patch` | `src/preview/PreviewCompositor.cpp` |
| `motion-golden-audio-integration.patch` | `scripts/golden-import.mjs` |
| `motion-wipe-integration.patch` | `src/preview/PreviewCompositor.cpp`, `shaders/composite.{vert,frag}` |
| `motion-crop-domain-integration.patch` | `src/preview/effects/ClipEffects.cpp`, `shaders/effects/clip.frag` |
| `motion-mask-outsets-integration.patch` | `src/preview/effects/ClipEffects.cpp`, `shaders/effects/clip.frag` |
| `motion-blur-controls-integration.patch` | `src/motion/blurcontrols/module.cmake`, `src/motion/controls/GroupMotion.qml` |
| `motion-reference-integration.patch` | `packages/cli/src/timeline-debug/target.ts` |
| `motion-tracking-integration.patch` | `src/preview/SceneEval.cpp`, `src/server/FieldAudit.cpp`, `src/motion/tracking/module.cmake`, `src/motion/controls/GroupMotion.qml` |
| `motion-matte-integration.patch` | `src/model/TimelineTypes.h`, `TimelineModel.{h,cpp}`, `src/server/ServerTimeline.{h,cpp}`, `src/preview/effects/Masks.cpp`, `src/main.cpp`, `src/motion/mattes/module.cmake` and associated mask, server, model-hook, export and asset-browser tests. Its document/session lifecycle candidate has passed zero- and two-surface single-fetch checks; the patch remains unapplied. |
| `motion-conformance-integration.patch` | `scripts/plan-conformance.mjs`, `src/preview/effects/tst_effectsblend.cpp`, `src/preview/effects/README.md` |
| `motion-prism-integration.patch` | `src/preview/FfmpegSource.cpp` |
| `motion-placement-integration.patch` | `src/preview/PreviewCompositor.cpp`, `shaders/composite.frag` |

A fresh isolated stack was checked in this order: parity, secondary, border, export-duration, group, radius-controls, blur, tracking, reference, golden-audio, blur-controls, matte, conformance, prism, placement, crop-domain, wipe, crop-placement, mask-outsets, capacity, gl-orientation, capture-deadline, preview. Each name denotes `docs/motion-<name>-integration.patch`. Apply the group patch from `native/timeline/`; apply the others from the repository root. The independent fresh stack's source files match the integrated candidate. These artifacts remain unapplied to the shared checkout.


## Verification and remaining boundaries

The 22-artifact rendering candidate is `/home/mg/f11-test-tmp/f11-final-22-app`, SHA-256 `1317fc11e3e25d2d4fe6bfadd583324b1ea3715a3068d394d46da467ec050593`. Its source and QML match an independently assembled fresh stack. The extended preview-isolation candidate is `/home/mg/f11-test-tmp/f11-final-23-boundaries-app`, SHA-256 `95a3115aea5186562d26a7d129056c6f1a3735768e8774f46b169ace94a91c99`. Its source matches an independently assembled 23-patch stack. Its complete-example replay matches the prior candidate on every sampled frame; `build/motion-native-replay-M3w1hF/report.json` records the result. The complete seven-example plan comparison on an earlier immutable integrated application passed with 138499 layer comparisons and no exclusions; `/home/mg/f11-test-tmp/conformance-final.json` records the result. Plan conformance checks timing, transforms, matrices, groups and crop source rectangles. It does not establish pixel parity for effects, masks, mattes, border radius or text, shape, caption and 3D payloads.

The extended 23-artifact candidate's complete original-document pixel comparison passes all 55 sampled frames within the requested 2D scope. The raw comparison exits nonzero on Prism frame 450, which remains outside that scope because it uses nonzero 2.5D projection; the explicit scope audit passes. These are sampled still comparisons, not a claim about every frame or encoded export. The corrected reference preserves tempo and media tracks. The original documents and reference inputs remain intact apart from audited scratch media-locator substitutions.

Focused candidate checks cover the following boundaries:

- Ordinary-layer wipe: the Vulkan baseline failed the retained reduced cases. The candidate passes those cases and the original Kite frame 196. Its OpenGL group-orientation correction also passes its separate OpenGL and Vulkan checks.
- Mask with effect outsets: the reduced Voltra masked-glow baseline failed. The candidate passes feathered, hard, inverted, asymmetric-crop and nested-group comparisons, plus unchanged full Voltra frame 554. The previous incorrect crop mapping fails the asymmetric negative test. The effect shader bakes for the module's GLSL 330/440, HLSL 50 and MSL 12 targets. The old posterize assertion expected green 127; the shared renderer and final native Vulkan and OpenGL pixels are 128. The conformance artifact updates that stale assertion.
- Text: mixed-script and intrinsic-color emoji regressions pass with installed host fallback fonts. The large Latin outline path passes counter, overlapping-glyph, gradient and shadow cases; original Serein frame 48 passes the sampled pixel comparison. Cross-platform fallback glyph pixel equality and bitmap emoji outline strokes are not established.
- Motion blur: nested repeaters, secondary sources and backward seeks pass the current pixel fixtures. A one-sample identity check, allocation-failure handling and visible eight-sample change are covered. A 24-frame PNG archive has the expected frame count and selected frame 21 matches the preview exactly. The corresponding decoded MP4 frame passes the codec comparison. These checks do not compare every encoded frame.
- Tracking: both follow modes pass mounted controls and live pixel comparisons, including source clocks, smoothing and backward fresh seeks. The corrected production reference retains media tracks and tempo.
- Capture: the old 15-second readiness deadline timed out on unchanged Serein frame 48. With candidate scratch-surface reuse and a fixed 60-second deadline, both still capture and the OffscreenFrames export backend completed that frame in about 20 seconds with identical decoded pixels. A post-render cancellation seam has a failing omitted-probe mutant. The deadline does not interrupt a blocked GPU call. The render-labeled integration and existing export cleanup tests passed in final native verification.
- Generated mattes and controls: the session resolver candidate passes zero- and two-surface single-fetch checks. Motion-blur, group and animation diagnostics pass their initial mounted tests. A later concurrent-edit regression exposed blur-preview leakage into unrelated commits. The final preview-isolation artifact passes that regression and its related boundary tests. The final native CPU, mounted UI, blur-pool and matte-carrier selections have passed. The asset-browser, session, export and capture-host checks also passed.

The four required repository checks passed on the owned source including the preview-isolation additions: affected tests, typecheck, lint and harness gate. Logs are `/tmp/f11-preview-final-test-affected.log`, `/tmp/f11-preview-final-typecheck.log`, `/tmp/f11-preview-final-lint.log` and `/tmp/f11-preview-final-harness.log`. Package build also passed. An earlier concurrent lint run observed a transient test fixture removed by another check; the subsequent official lint run passed after the affected tests finished.

The preview-isolation candidate passes the retained concurrent-edit tests and focused boundary tests, including direct and precomputed edits, invalid settlement rejection, marker undo and local autosave of the committed snapshot. It covers motion inspector, keyframe inspector, transform gizmo, reframe and transition preview controllers. Speed, audio, basic clip gestures and F10 workflows are outside this patch. The ordinary gizmo, reframe, transition, edit-preview, transition-resolver, model-hook and autosave regression selections passed.

Remaining work is the shared integration handoff and the explicitly deferred 3D scope. The 23 patches above are not applied to this checkout. Model3d needs a registered glTF layer source, asset resolution and sampled camera channels. Camera depth-of-field is also deferred: an isolated original Serein card changes in the web renderer when aperture changes, while the native baseline stays byte-identical. Native evaluates the radius but does not add the camera blur to the effect chain. The full frame's independent large-text discrepancy was fixed; its sampled pass does not establish depth-of-field parity.

The native motion controls do not add editors for wiggle amplitude keyframes or beat anchoring. Those editors are also absent from the inspected web animation inspector; the native evaluator handles the authored data. Host font availability remains a separate rendering dependency.

## F11 file manifest

Paths below are relative to `native/timeline/`. This enumerates the F11 changes since `fa68d18b6b` and its current untracked owned files. Shared checkout changes owned by F10 are excluded. Integration patches are artifacts, not applied files.

```text
docs/motion-blur-controls-integration.patch
docs/motion-blur-integration.patch
docs/motion-border-integration.patch
docs/motion-capacity-integration.patch
docs/motion-capture-deadline-integration.patch
docs/motion-conformance-integration.patch
docs/motion-crop-domain-integration.patch
docs/motion-crop-placement-integration.patch
docs/motion-export-duration-integration.patch
docs/motion-gl-orientation-integration.patch
docs/motion-golden-audio-integration.patch
docs/motion-group-integration.patch
docs/motion-mask-outsets-integration.patch
docs/motion-matte-integration.patch
docs/motion-parity-integration.patch
docs/motion-parity.md
docs/motion-placement-integration.patch
docs/motion-preview-integration.patch
docs/motion-prism-integration.patch
docs/motion-radius-controls-integration.patch
docs/motion-reference-integration.patch
docs/motion-secondary-integration.patch
docs/motion-tracking-integration.patch
docs/motion-wipe-integration.patch
qml/Inspector/KeyframeClipAnimationEditor.qml
qml/Inspector/KeyframeClipCustomCurves.qml
src/motion/beat/Beat.h
src/motion/beat/module.cmake
src/motion/beat/oracle.mjs
src/motion/beat/tst_beat.cpp
src/motion/blur/Shutter.h
src/motion/blur/export.mjs
src/motion/blur/fixtures.mjs
src/motion/blur/module.cmake
src/motion/blur/oracle.mjs
src/motion/blur/pixels.mjs
src/motion/blur/tst_blurpool.cpp
src/motion/blur/tst_shutter.cpp
src/motion/blurcontrols/MotionBlur.qml
src/motion/blurcontrols/MotionBlurSections.cpp
src/motion/blurcontrols/concurrentqmltests/tst_concurrent.qml
src/motion/blurcontrols/groupqmltests/tst_groupblur.qml
src/motion/blurcontrols/module.cmake
src/motion/blurcontrols/qmltests/tst_motionblur.qml
src/motion/border/module.cmake
src/motion/border/oracle.mjs
src/motion/border/oracle.test.mjs
src/motion/capacity/ScratchPool.h
src/motion/capacity/module.cmake
src/motion/capacity/pixels.mjs
src/motion/capacity/tst_effectscratch.cpp
src/motion/capacity/tst_scratchpool.cpp
src/motion/capturedeadline/CaptureDeadline.h
src/motion/capturedeadline/CaptureIntegration.cpp
src/motion/capturedeadline/capture-integration.cmake
src/motion/capturedeadline/module.cmake
src/motion/capturedeadline/render.mjs
src/motion/capturedeadline/tst_capturedeadline.cpp
src/motion/conformance/README.md
src/motion/conformance/module.cmake
src/motion/conformance/oracle.test.mjs
src/motion/controls/AdvancedMotion.qml
src/motion/controls/AdvancedMotionSections.cpp
src/motion/controls/BorderRadius.qml
src/motion/controls/FollowPathControls.cpp
src/motion/controls/FollowPathControls.h
src/motion/controls/GroupMotion.qml
src/motion/controls/module.cmake
src/motion/controls/qmltests/tst_advancedmotion.qml
src/motion/controls/qmltests/tst_borderradius.qml
src/motion/controls/qmltests/tst_followpath.qml
src/motion/controls/qmltests/tst_groupmotion.qml
src/motion/controls/qmltests/tst_motiondiagnostics.qml
src/motion/controls/tst_followpathcontrols.cpp
src/motion/controls/tst_followpathui.cpp
src/motion/dof/fixture.mjs
src/motion/dof/module.cmake
src/motion/dof/oracle.mjs
src/motion/dof/oracle.test.mjs
src/motion/gesture/ClipDelta.cpp
src/motion/gesture/ClipDelta.h
src/motion/gesture/module.cmake
src/motion/gesture/tst_clipdelta.cpp
src/motion/gesture/tst_previewmodel.cpp
src/motion/maskoutsets/fixture.mjs
src/motion/maskoutsets/module.cmake
src/motion/maskoutsets/oracle.mjs
src/motion/maskoutsets/oracle.test.mjs
src/motion/mattes/MatteResolver.cpp
src/motion/mattes/MatteResolver.h
src/motion/mattes/module.cmake
src/motion/mattes/tst_mattecarrier.cpp
src/motion/module.cmake
src/motion/oracle.mjs
src/motion/orientation/module.cmake
src/motion/orientation/oracle.mjs
src/motion/orientation/oracle.test.mjs
src/motion/pixels/README.md
src/motion/pixels/module.cmake
src/motion/pixels/oracle.mjs
src/motion/pixels/oracle.test.mjs
src/motion/prism/README.md
src/motion/prism/fixtures/chroma-444.jpg
src/motion/prism/module.cmake
src/motion/prism/oracle.mjs
src/motion/prism/oracle.test.mjs
src/motion/prism/placement-oracle.mjs
src/motion/prism/tst_prism.cpp
src/motion/shipped/README.md
src/motion/shipped/audit.mjs
src/motion/shipped/audit.test.mjs
src/motion/shipped/golden-audio.mjs
src/motion/shipped/golden-audio.test.mjs
src/motion/shipped/module.cmake
src/motion/shipped/oracle.mjs
src/motion/shipped/oracle.test.mjs
src/motion/tracking/TrackBinding.h
src/motion/tracking/TrackBinding.qml
src/motion/tracking/TrackBindingSection.cpp
src/motion/tracking/module.cmake
src/motion/tracking/oracle.mjs
src/motion/tracking/pixels.mjs
src/motion/tracking/qmltests/tst_tracking.qml
src/motion/tracking/reference-contract.mjs
src/motion/tracking/reference.mjs
src/motion/tracking/tst_tracking.cpp
src/motion/tst_motion.cpp
src/motion/wipe/Wipe.h
src/motion/wipe/module.cmake
src/motion/wipe/oracle.mjs
src/motion/wipe/oracle.test.mjs
src/motion/wipe/tst_wipe.cpp
src/preview/SceneEval.cpp
src/preview/effects/EffectPlan.cpp
src/preview/effects/tst_effectplan.cpp
src/render2d/Rasterizer.cpp
src/render2d/reference.mjs
src/render2d/tst_render2d.cpp
src/scene/Animation.cpp
```
