# Native timeline motion parity

## Ownership

This F11 change owns motion evaluation, raster text, motion-specific controls and tests. F10 owns generation, providers, prompts, jobs, takes, agents, transcripts, scripts and storyboards. Caption rendering is F11. Caption generation is F10. Existing matte rendering is F11. Matte generation and shared asset resolution are outside this change.

Existing files changed by F11:

- `src/scene/Animation.cpp`
- `src/preview/SceneEval.cpp`
- `src/render2d/Rasterizer.cpp`
- `src/render2d/tst_render2d.cpp`
- `src/preview/effects/EffectPlan.cpp`
- `src/preview/effects/tst_effectplan.cpp`
- `qml/Inspector/KeyframeClipAnimationEditor.qml`

New implementation and tests live under `src/motion/`. Its recursive `module.cmake` files register core tests, QML types, resources and inspector sections. `FollowPathControls` and its unit test belong to `src/motion/controls/`. Mounted tests use `tst_followpathui.cpp` and `qmltests/`. Advanced motion controls register through `InspectorSectionRegistry`. No shared host or top-level build edit is needed.

The initial audit also inspected the dedicated `TextBlock`, `TextAnimation`, `SvgPath`, `ClipScene`, `FlexLayout`, effects, crop and composition modules. Those unchanged files remain outside the resulting patch.

F11 does not edit `main.cpp`, top-level CMake, `TimelineModel`, `TimelineEditor.qml`, `TimelineInspector.qml`, shared bars, menus, panel hosts, assets, server clients, protocol, web sources or the gap tracking documents. Concurrent changes in those files and in `ai/` or `aiassist/` belong to other work.

New files:

```text
docs/motion-group-integration.patch
docs/motion-parity-integration.patch
docs/motion-parity.md
docs/motion-secondary-integration.patch
src/motion/beat/Beat.h
src/motion/beat/module.cmake
src/motion/beat/oracle.mjs
src/motion/beat/tst_beat.cpp
src/motion/controls/AdvancedMotion.qml
src/motion/controls/AdvancedMotionSections.cpp
src/motion/controls/FollowPathControls.cpp
src/motion/controls/FollowPathControls.h
src/motion/controls/GroupMotion.qml
src/motion/controls/module.cmake
src/motion/controls/qmltests/tst_advancedmotion.qml
src/motion/controls/qmltests/tst_followpath.qml
src/motion/controls/qmltests/tst_groupmotion.qml
src/motion/controls/tst_followpathcontrols.cpp
src/motion/controls/tst_followpathui.cpp
src/motion/module.cmake
src/motion/oracle.mjs
src/motion/pixels/README.md
src/motion/pixels/module.cmake
src/motion/pixels/oracle.mjs
src/motion/pixels/oracle.test.mjs
src/motion/tst_motion.cpp
```

## Continuation boundary

3D is deferred at the user’s request. The continuation owns new beat-timing code and tests under `src/motion/beat/`, pixel comparisons under `src/motion/pixels/`, and dedicated `src/motion/controls/GroupMotion.qml` with its mounted test. The existing owned controls module and UI harness may register and exercise that component. Beat evaluation may change the already owned `Animation.cpp` and `SceneEval.cpp`. Shared hosts and compositor files remain excluded. Group-host integration is delivered as the separate, unapplied `docs/motion-group-integration.patch`. Repeated-media source-pool integration is delivered as the separate, unapplied `docs/motion-secondary-integration.patch`. Neither artifact changes the shared files in this checkout.

## Behavior audit

The references are the current shared functions in `packages/timeline/src/animation/`, `render/sceneModel.ts`, `render/temporal.ts`, `render/textLayout.ts` and the web timeline inspector. Catalog entries and exclusion records were checked against those implementations.

| Capability | Evaluation and rendering | Native authoring | Preview/export evidence | Differential and pixels |
| --- | --- | --- | --- | --- |
| Text, shapes and captions | Existing raster styles retained. Mixed scripts now use itemized fallback runs, and color emoji retain intrinsic color. | Existing dedicated text and caption style sections remain. | Raster sources feed the compositor. Full export agreement is not established by raster tests alone. | Shared TypeScript text/shape raster references pass. Arabic measurement and color emoji failed before the fix and pass afterward. |
| Transform, keyframes, easing and presets | Existing animation retained. Beat-anchored delays now resolve clip or sequence scope, tempo offset and authored delay without changing document fields. Follow-path now flattens paths and samples arc length, normalized boxes, reverse traversal and tangents. | Existing animation editor gains “Use shape clip”, which copies geometry once and preserves other parameters. | Scene evaluation is shared by preview/export. No claim of whole-export pixel equality. | Unequal segments, curved path, orientation, reverse and box tests. Native path samples are compared to shared pure functions. |
| Wrapped stagger | Compilation counts measured lines, including flex-resolved text width. Raster unit enumeration already matched shared blank-line, word and grapheme behavior. | Existing stagger editor retained. | Evaluation and raster layout use the effective wrap width. | Plain wrap and narrow flex-child regressions failed before their fixes. |
| Animation links | Sources sample authored animation state without recursively resolving their own links. Wiggle respects stepped follower time. Linked opacity retains fade, transition and parent coverage. | Native advanced controls are additions for existing render fields on non-group clips. The shared inspector host hides registered sections for selected groups. The web inspector has no corresponding link controls. | Seek and group propagation tests exercise evaluation without document writes. | Shared source-link and seeded-wiggle samples, loops, time offsets, cycles and parent/fade coverage. |
| Repeaters and echoes | Copies clear layout, keep distinct IDs and names, and carry wrapped hue/brightness effects. Existing clocks and expansion limits retained. Repeated media with a secondary source exposed a compositor/source-pool integration failure, documented in R8. | Native advanced controls expose existing fields. The web inspector has no corresponding repeater or echo controls. | Copy evaluation tested. Complete repeated-secondary pixel fixtures retain a failing source-pool reproduction pending the separate integration patch. | Shared temporal effect/name comparison and identity/timing regression. |
| Effects, adjustments, masks, mattes and blends | Existing implementations retained. Integral crop origins now survive float storage before effect sampling. | Existing dedicated effect sections retained. | GPU blend, matte, adjustment, crop, spread and group-alpha tests exercised headlessly. Export agreement remains a separate check. | Effect-plan tests pass. One posterize color assertion fails identically on the original binary on this host. |
| Existing 3D | Native evaluates model3d layers and 2.5D transforms, but no registered glTF/model3d pixel renderer was found. | Existing camera and spatial transform controls remain. | No model3d pixel/export parity claim. | Geometric plan coverage does not establish model rendering. |

Fallback uses installed fonts. This host resolves Arabic to Noto Naskh Arabic and emoji to Noto Color Emoji. The implementation retains the existing Latin HarfBuzz path. Bitmap color fonts bypass outline extraction because Qt/FreeType outline loading poisoned the subsequent color glyph cache in the reproduction. Cross-platform fallback glyph pixel equality and bitmap emoji outline strokes are not established.

## Conformance exclusions

Plan conformance compares active layers, timing, transforms, matrices, groups and crop source rectangles. It globally omits effect payloads, masks, matte contents, border radius and text, shape, caption and 3D payloads. Existing pixel fixtures cover individual cases, not every omitted combination.

The explicit per-clip exclusions were inspected individually in complete shipped documents:

| Example | Excluded records and behavior |
| --- | --- |
| Prism | `S3_s9` copies `shoe` positionY with a 360 px offset. `shoe` applies seeded rotation wiggle at 0.7 Hz. |
| Serein | `S4c_s26` follows an oriented cubic path over 733 ms with easeInOut. |
| Northstar | `broadcast_v4` is video with four source-time keyframes, including a held segment and eased final segment. This is a time-remap exclusion, not a follow-path case. |
| Tidewater | `S1_t8`, `S1_t9`, `S1_t13`, `S1_t14`, `S3_t8`, `S3_t9`, `S4_t12`, and `S4_t13` use 6 Hz rotation wiggle on text with distinct seeds. `S3_g14`, `S3_g23`, `S3_g32`, and `S4_g22` use seeded 6 Hz group rotation wiggle. Their explicitly excluded children are `S3_s15`, `S3_s16`, `S3_t17`–`S3_t20`; `S3_s24`, `S3_s25`, `S3_t26`–`S3_t29`; `S3_s33`, `S3_s34`, `S3_t35`–`S3_t38`; and `S4_g27`, `S4_s23`, `S4_s24`, `S4_t25`, `S4_t26` respectively. `S4_t25` and `S4_t26` are nested under `S4_g27`. |
| Voltra | `S5_t13` contains the two explicit lines “SILENT.” and “VIOLENT.” with an offsetY line stagger. A soft-wrapped fixture is also needed to test the general line-count contract. |

Northstar already has native time-remap parsing and evaluation. Its exclusion is not evidence that the feature is absent. No shared exclusion file is changed by F11. The original cases must pass their complete comparison before an integration owner removes their entries.

## Reproduction and verification

The regression sequence records failures before fixes for missing follow-path sampling, authored source links, echo naming/effect inputs, wrapped and flex-wrapped stagger, mixed-script width, color emoji, integral crop origins, stepped wiggle and linked-opacity coverage. The controls test exercises production edit registration and preserves unknown animation parameters with one undo command. Mounted QML tests cover the actual picker and advanced section.

Relevant commands, from the repository root:

```sh
nice -n 10 cmake --build native/timeline/build-f11 -j 2
QT_QPA_PLATFORM=offscreen ctest --test-dir native/timeline/build-f11 -j 2 --output-on-failure -R 'motion|followpath|render2d|tst_sceneeval|tst_easing|tst_masks|tst_effectplan|tst_effectresources'
node native/timeline/src/motion/oracle.mjs native/timeline/build-f11/tst_motion
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a ctest --test-dir native/timeline/build-f11 -j 2 --output-on-failure -R '^tst_effects(blend|clip|matte|adjustment)'
```

`render2d_reference` generates the shared raster fixtures. The full raster suite passed, including the new fallback regressions. The focused scene, easing, masks, effect-plan and effect-resource suites passed. The pure motion oracle asserts it inspected samples and rejects deliberately altered results. `shippedExamplesEvaluateUnchanged` enumerates complete shipped timelines, evaluates multiple seeks and verifies raw clip fields remain unchanged. It is an evaluation audit, not a full-media pixel comparison.

On this host, GPU tests require Xvfb with Vulkan. Qt's offscreen plugin cannot create a Vulkan instance, and its GLX fallback fails. The posterize sample returns green 128 where its assertion expects 127, identically in the existing native binary and the F11 build. That baseline failure remains unchanged.

The final mounted-control checks passed, including numeric preview, selection cancellation, typed edits after cancellation, schema-invalid input rejection, unknown-field preservation and undo. A temporary source snapshot was made from `HEAD` plus only the owned F11 files. Its application, controls and motion targets built successfully. The snapshot's owned source bytes matched the delivered checkout. Its motion/control/oracle CTest selection passed, as did the existing scene, easing, masks, effect-plan, effect-resource, keyframe and composition registry checks. The headless composition hooks also passed preview/export equality, effect outsets and secondary-source checks under Xvfb/Vulkan.

The earlier repository typecheck, lint and harness gate passed. That earlier `test:affected` run did not pass: the CLI registry test found unclaimed `packages/godot` and `packages/godot-templates` directories. They contain existing local build artifacts and are outside this change. The Turbo log reports the CLI test exiting 1, and the enclosing tool process ended with status 143. The aggregate check is not green. These checks used Node from `.nvmrc`; the missing `lsof` executable was provided temporarily on PATH for the port tests. No registry or artifact cleanup is included.

## Remaining gaps and integration work

- R1: `src/server/FieldAudit.cpp` still classifies animation links as unsupported. After the original linked examples pass plan conformance, the integration owner can apply this exact classification change:

  ```diff
  -    QStringLiteral("animationLinks"), QStringLiteral("trackBinding"),
  +    QStringLiteral("trackBinding"),
  ```

  Follow-path and line-stagger reports call the now-supported animation evaluator. No exclusion removal is proposed before complete original-case comparison. Northstar's time-remap report belongs to the separate speed implementation.
- R2: Authored and animated `borderRadius` are absent from native final blending. A shape mask's `radiusPx` is a different field. Existing blend hooks receive already placed canvas surfaces, and normal blend bypasses the handler registry. Exact final-layer SDF clipping needs compositor/shader uniform plumbing, followed by crop, mask, rotation and effect-outset pixel comparisons. No approximation is added through an earlier effect stage.
- R3: 3D is deferred at the user’s request. Model3d rendering needs a registered layer source, a glTF loader, asset resolution and sampled camera/animation channels. The layer registry is available, but the necessary renderer and asset integration are not present. This remains an implementation gap, not a completed feature.
- R4: An existing generated matte with only `assetId` has no native source resolution in `Masks.cpp`. Fixing this crosses the user's explicit asset-resolution boundary. Media-path matte rendering remains covered.
- R5: Whole-document web/native pixel and export agreement, including repeated secondary sources and all missing fields above, remains incomplete. Existing stripped example-still checks are not used as evidence of complete-document parity.

- R6: Beat-anchored animation evaluation is implemented. Native regressions and the shared TypeScript oracle cover clip and sequence scope, repeated and echoed copies, linked sources and inherited group transforms. Resolved definitions are cached by source revision, clip start and tempo so repeated seeks reuse compiled animation inputs.

- R7: The shared inspector host hides registered sections and transform/animation controls for groups. The owned `GroupMotion.qml` component now composes the existing transform, advanced motion and animation controls. Mounted tests cover cancellation, one undo command, undo/redo, unknown fields and seeks without model changes. The unchanged shared host was mounted separately to reproduce the missing entry point. `motion-group-integration.patch` is an exact, unapplied host import and component insertion. The component is runtime-tested, but group access in the delivered application still requires the integration owner to apply the patch.

- R8: Repeated media layers keep distinct identities, but the shared compositor originally looked up decoder and secondary-source inputs only among authored clips. Complete moving-matte fixtures with three image copies and 32 video copies reproduce an exact-frame timeout. `motion-secondary-integration.patch` retains evaluated copy records and adds only prepared copy IDs to the pool input. It does not parse ID suffixes or collapse clocks. Review rejected an earlier variant that could let dropped copies exhaust the decoder cap. The revised patch excludes those copies. This patch is unapplied in the checkout and requires integration-owner review.

## Continuation verification

The owned-only snapshot built the application and relevant native test targets with `nice -n 10` and two build jobs. The final native selection passed all 14 registered tests, including beat differential samples, group controls, the motion oracle, existing scene/easing/mask/effect/keyframe checks and the pixel-oracle contract. The headless Vulkan composition hook checks passed preview/export agreement. The pixel contract rejects missing cases, missing renders and deliberately negated pixels. It runs without generated video fixtures. Actual pixel renders require `scripts/make-fixtures.sh` media. Run them headlessly with `QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a node native/timeline/src/motion/pixels/oracle.mjs <application-binary>`. The unpatched application intentionally retains the repeated-media failure until the integration patch is applied.

Beat timing failed before the fix. Current tests compare six repeated/echoed copy positions and the parent-group matrix against the shared pure TypeScript functions. Cache tests verify reuse and invalidation by tempo and start time. Mounted group tests retain unknown fields and exercise preview cancellation, one undo entry, undo/redo and six seeks with no document-model notifications.

The production web and native exporters compare complete synthetic documents derived from existing effect fixtures. Nested effect groups exceed 49 dB PSNR and crop plus blur/vignette exceeds 99 dB across the requested frames. Additional fixtures retain repeated moving mattes, repeated existing generated mattes and 32 repeated videos under the existing eight-video render cap. Native frame order is checked with a fresh-process same-frame comparison. The web exporter sorts frame requests, so these tests do not claim web backward-seek coverage. Complete shipped examples remain subject to the earlier comparison limits below.

The continuation’s backend build, typecheck, lint and harness gate passed. Its first `test:affected` run exited 1 after a script-test timeout in `mutation-ci.test.mjs`. That test passed when rerun directly. The complete affected-test retry exited 0 and passed the backend, script, web, Electron and mobile phases. Its output is `/tmp/f11-cont-test-affected-retry.log`. All four mandatory repository checks passed for the continuation.

F11’s final ownership enumeration is the existing-file list and new-file list above. It contains no F10 files or excluded shared source files. The integration patches remain artifacts only. Whitespace and control-byte checks passed. Concurrent F10 modifications remain in the shared checkout and are not included in the owned-only build evidence.

The exact secondary-source integration patch built and passed all five pixel fixtures in the temporary snapshot. All 15 web/native pairs exceeded the 40 dB PSNR threshold. The measured minima were 49.32 dB for nested groups, 99.76 dB for crop/effects, 62.14 dB for repeated moving mattes, 60.52 dB for capped videos and 63.46 dB for repeated existing generated mattes. All five native seek captures matched fresh-process frames exactly. The three temporal fixtures changed pictures in both renderers. The cap fixture verifies exactly 24 expected video-cap drops and eight retained video layers. Unexpected skipped IDs or incomplete render summaries fail the check.

The reference import temporarily stages generated mattes while importing local media, then restores the full ready treatment before rendering. The final reference-document audit deep-compares every field against the original, allowing only exact scratch asset-locator replacement. It rejects lost feather settings and a retained generating status. All five final reference documents passed that audit. The standalone pixel contract has five passing tests. Runtime results are in `native/timeline/build/motion-pixels-gzFWMx/report.json`. These results apply to the temporary patched application. The source-pool patch remains unapplied in the delivered checkout.

Integration patch commands, run from the repository root:

```sh
git apply --check native/timeline/docs/motion-parity-integration.patch
git -C native/timeline apply --check docs/motion-group-integration.patch
git apply --check native/timeline/docs/motion-secondary-integration.patch
```

## Complete-example comparison result

The F11-only application was run against every complete shipped example with `plan-conformance.mjs --examples --json`. A continuation rerun against the saved owned application returned the same 135592 layer comparisons and 268 reported discrepancies, with exit status 1. Its output is `/tmp/f11-cont-examples.json`. Cadence and Kite passed. Prism's two linked cases and Tidewater's linked groups and children matched every audited layer and surface. Serein's follow-path and Voltra's line-stagger case no longer report unsupported fields and have no case-specific comparison mismatch. Northstar's existing time-remap case also matched all audited layers.

The command still exits nonzero because the shared exclusion bookkeeping is stale and Voltra has crop-matrix differences. For example, `S2_i41` at 4967 ms reports matrix[0] 0.24 in both the original native binary and F11, while the plan oracle expects 0.6. The oracle computes its matrix from uncropped source dimensions. This is an existing comparison discrepancy, not proof of an F11 picture regression. Whole-document crop pixels remain a separate verification gap.

`motion-parity-integration.patch` is an unapplied integration-owner patch. It removes the now-stale link/time-remap field reports and the explicit exclusion entries after the original-case comparisons above. Northstar's cleanup concerns existing speed support, not new F11 code. The patch does not change the crop oracle or claim to make the whole example command pass. The group-host patch in R7 remains separately unapplied.
