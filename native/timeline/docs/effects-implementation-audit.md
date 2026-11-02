# Native timeline visual effects audit

The vignette concern has concrete causes: its control-card preview uses different math from the rendered effect, its falloff leaves a broad flat border, and track controls update the actual footage only on release. Remove the duplicate Canvas preview and make edits preview through the real renderer.

This audit covers visual clip/track effects, their controls, and the shared effect pipeline at `3df7fc227bba42a325f15b2668d62d87a20ba0b5`. It combines source inspection with Windows D3D11 still renders. Audio DSP and transitions are outside this audit. Individual stylize/generator modes, masks and blend modes were inspected as pipeline capabilities, not exhaustively validated visually.

**Render** means reproduced in native output. **Source** means established from code. **Design** means a proposed quality improvement, not a correctness failure. IDs continue from the [interaction plan](interaction-polish-plan.md). The original audit changed no production behavior. The checklist tracks subsequent implementation.

**Implementation guidance for these issues:** Effect implementations may closely follow [Filmcraft](https://github.com/storytold/filmcraft) or [EffectCraft](https://github.com/storytold/effectcraft), including their algorithms, parameter behavior and visual results. Adapt them to the native rendering pipeline and preserve compatibility with existing timelines. Carry this guidance into any implementation issues created from this audit.

## Implementation checklist

Check an item only after its implementation and relevant verification pass. Each item is committed separately. F39 precedes F35 so removing the decorative preview retains live feedback.

- [x] F35: Remove the duplicate Canvas effect preview. Vignette and Blur cards now use the live viewer feedback from F39. Native parameter-editor tests pass with the decorative component removed.
- [x] F36: Add a compatible gradual vignette falloff. The Soft centered oval preset extends feathering through the corners without changing existing documents or intensity. Native clip/track preset and undo tests, native pixels and CPU profile checks pass.
- [x] F37: Expose consistent vignette radius controls and units. The clip inspector now matches the track range/default. Catalogue regression passed after reproducing the missing control. Existing render geometry is unchanged.
- [x] F38: Add vignette center and roundness controls. Native, shared GPU and CPU tests verify shifted centers, circles at portrait/landscape aspect ratios and legacy defaults. Schema tests cover persistence and tool arguments.
- [x] F39: Preview track effects live with commit/cancel transactions. Native gesture tests verify model updates before release, cancel restoration and one undo entry. The preview entry-point regression also passes.
- [ ] F40: Make sharpen radius affect rendering.
- [x] F41: Apply glow color to the bloom contribution. Native D3D11, shared GPU and CPU halo tests pass. White/absent tint preserves source-colored glow, and the source image remains unchanged. GPU alpha checks pass.
- [ ] F42: Render authored tone curves faithfully.
- [x] F43: Remove gaps from large-radius blur kernels. Dense sampling replaces spaced taps within the supported 256-pixel radius. CPU, GPU and native impulse/line checks pass at 20/40/64/128, and checker patterns no longer alias. Large radii require more samples than the old fixed budget.
- [x] F44: Make processing order explicit and consistent. Fixed color/blur and video-track stages are displayed in processing order with explanations. Reordering is limited to ordered stages. Native row/reorder tests and independent ordering tests pass, including duplicate precedence and a large chain.
- [x] F45: Give clip effect controls explicit reset defaults. Every slider has an in-range reset value. Intensity controls can reset to neutral while new effects retain visible defaults. Catalogue regressions passed.
- [x] F46: Provide controls or specific explanations for imported effects. Pixelate, Posterize, Directional Blur and Lens Distortion have controls and Add entries. LUT, Stylize and Generator explain their editing limits. Catalogue and native add/edit tests pass.
- [x] F47: Edit imported Color effect instances. Inline controls target the authored ID and preserve other instances and unknown fields. Catalogue and native edit/undo/redo tests pass.
- [x] F48: Support exact numeric entry for track effects. Native keyboard tests cover live entry, Enter, Escape, invalid ranges, undo/redo and suppression of playback shortcuts while typing.
- [ ] F49: Add independent effect sensitivity and lifecycle checks.
- [x] F50: Evaluate and document precision and color-space behavior. The retained native ramp exposes shadow quantization. Shared GPU/CPU precision bounds and CPU translucent-edge checks pass. See the measured limits below.

## Vignette findings

| ID | Finding | Implementation recommendation |
| --- | --- | --- |
| F35 | **Source: the Canvas preview is misleading.** [VideoPreview] uses a linear radial gradient normalized to the corner and clamps stops to 1. The [shader] uses a smooth cubic falloff, different distance normalization, and supports radius above 1. | Remove the decorative Canvas approximation from the effect card. Preview the actual footage during editing. If a thumbnail remains necessary, generate it through the same effect renderer and parameter contract. Do not maintain a second hand-written vignette. |
| F36 | **Render + design: the falloff creates a flat dark outer region.** At radius 0.9, the shader reaches full darkening before the midpoint of every edge. Roughly 36% of the image lies outside that radius and gets the same maximum attenuation. | Review the intended visual profile on footage. Offer a gradual feather that can extend through the corners, with separate size and falloff controls. Preserve the current profile for existing documents rather than silently changing their appearance. |
| F37 | **Source: radius is inconsistently exposed and described.** [ClipCatalog] provides Amount/Softness only. Track controls expose Radius. The [type contract] calls radius relative to the half-diagonal, but actual normalized distance is 1 at edge midpoints and √2 at corners. | Expose Radius on clips and tracks with identical units/defaults. Correct the contract or version the geometry. Imported radius values must remain visible and editable. Verify square, landscape, portrait and cropped sources. |
| F38 | **Design: the vignette is limited to a centered, frame-shaped oval and black attenuation.** Center, roundness/aspect and highlight preservation are not parameters. Multiplication happens in the declared sRGB surface, so Amount is not an exposure-in-stops control. | After fixing preview fidelity, consider Center, Roundness and independent Feather. Add exposure or highlight protection only with an explicit color-space contract. Keep existing Amount semantics stable. These are enhancements, not proof that an oval vignette is mathematically wrong. |
| F39 | **Source: track effects do not preview against footage during a drag.** [EffectCard] updates a local draft; it commits to the timeline only on release. | Use a reversible render/model preview transaction for track effects, as clip effects already do. Update the program viewer while held, commit one undo entry on release, and restore on Escape/cancel. Removing the Canvas card must accompany this change. |

### What the current vignette actually renders

For a normalized pixel position `(u,v)`, the shader computes:

```text
d = length(2 * (u,v) - 1)
inner = max(0, radius - softness)
outer = max(inner + 0.001, radius)
t = clamp((d - inner) / (outer - inner), 0, 1)
gain = 1 - amount * t² * (3 - 2t)
RGBout = RGBin * gain
alphaOut = alphaIn
```

This is also the formula in the [shared vignette module][SharedVignette]. The native result is therefore not evidence of a Windows-only rendering divergence.

On a 640×360 white RGB image, Amount 0.5, Radius 0.9 and Softness 0.5 produced these channel values:

| Pixel | Measured RGB |
| --- | --- |
| Center `(320,180)` | `255,255,255` |
| Three-quarter width `(480,180)` | `241,241,241` |
| Near edge `(560,180)` | `155,155,155` |
| Edge midpoint `(639,180)` | `127,127,127` |
| Corner `(639,359)` | `127,127,127` |

![Current native vignette on a white image](effects-audit/vignette-current.png)

For the same parameters, the control-card formula predicts about **0.693 gain** at the exact edge midpoint, versus **0.5** in the shader. This comparison is calculated from source, not a captured card image. The no-op Amount 0 render stayed white at the sampled positions. Softness 0 produced the expected hard boundary, which should not be confused with a rendering defect.

## Other effect findings

| ID | Finding | Implementation and acceptance |
| --- | --- | --- |
| F40 | **Render: Sharpen Radius does nothing.** Radius 1 and 8 produced byte-identical PNGs. [ClipCatalog] writes radius, but [EffectPlan] supplies only amount/threshold and the shader uses a fixed 3×3 neighborhood. | Implement radius-dependent unsharp masking consistently across rendering paths, or remove the ineffective control and expose the supported threshold. A radius-only change must change halo width on an edge pattern. Amount 0 must remain neutral. |
| F41 | **Render: Glow Color does nothing.** Red and blue settings produced byte-identical PNGs. The glow recipe never reads the authored color. | Tint the bloom contribution before adding it, leaving the original image unchanged. Preserve source-colored glow when color is absent. Test halo chroma outside a bright source shape, not just the saved setting. |
| F42 | **Render: tone curves do not reproduce the drawn graph.** Raising a red-channel point at input 0.25 from 0.25 to 0.4, while leaving input 0.5 unchanged, produced identical output. [EffectPlan] keeps only each channel's midpoint. Master curves are reduced to a few fitted parameters. | Evaluate the authored transfer curves directly or bake transfer LUTs. Match the interpolation drawn by [ToneCurve]. Preserve endpoints, off-midpoint bends and nonmonotonic curves. Test pixels at control-point inputs and between them. |
| F43 | **Render: large blur radii create separated stripes.** Radius 40 spreads 41 taps two pixels apart and uses discrete texel fetches. A white line produces alternating bright/black columns. | Replace sparse sampling with a continuous blur strategy, such as a prefiltered image pyramid. Fix the shared primitive used by blur and related recipes. Test impulses, thin lines and checkerboards at radii 20/40/64/128, with energy and continuity assertions. |
| F44 | **Render + source: the reorderable stack does not express execution order.** Swapping Color and Vignette produced identical output. Color/blur aggregate at the end. Track processing also keeps only the first enabled sharpen and vignette. This behavior is intentional in the current planner. | Decide between an ordered stack and explicit fixed processing stages. Make UI, native render and export agree with that decision. Test noncommutative pairs and duplicate effects. Version changed semantics so existing documents do not unexpectedly render differently. |
| F45 | **Source: many clip sliders do not reset.** Catalog fields omit `origin`/`resetValue`; [SliderRow] falls back to the current value. Both vignette sliders are affected. | Give every resettable field an explicit default. Distinguish neutral values from the values used when adding an effect. Double-click must restore the declared value in one undo step. |
| F46 | **Source: several rendered effects have no native parameter editor.** Pixelate, Posterize, Directional Blur, Lens Distortion, Stylize, Generator and LUT are recognized but return no fields and are absent from the add menu. | Add supported controls from authoritative metadata, or show a specific read-only explanation. Remove the generic instruction to use Color for unrelated effects. Preserve imported parameters during other edits. |
| F47 | **Source: imported Color instances cannot be edited through the advertised section.** [ClipEdits] selects only the ID `inspector:color`; ordinary Color IDs receive the same “use Color” message. | Bind controls to the actual effect instance, or offer an explicit conversion that preserves data and processing semantics. Editing imported brightness must change that instance rather than append a separate adjustment. |
| F48 | **Source: track knobs lack exact typed values.** [KnobList] draws the value as text. Dragging, wheel, key nudging and reset exist, but numeric text entry does not. | Add click-to-type with units, shared range validation, Enter commit and Escape cancel. Keep one undo entry and prevent timeline shortcuts from consuming field input. |

### Rendered blur evidence

For a one-pixel white vertical line on black, these are the measured red-channel values at horizontal offsets 0–10 from the line:

```text
Radius 20: 15,15,15,14,13,12,10,9,7,6,5
Radius 40: 15, 0,15, 0,15, 0,14,0,13,0,12
```

![Current radius-40 blur of a white line](effects-audit/blur-radius40-current.png)

The shared Gaussian implementation and CPU fallback use the same sparse-sampling approach. Agreement between rendering paths therefore does not establish blur quality.

## Verification changes

| ID | Gap | Required check |
| --- | --- | --- |
| F49 | **Source: parity and data-edit tests miss shared defects.** Existing tests compare native output with export or assert that a control saved a value. Both paths can ignore the same parameter or share the same bad formula. | Retain parity tests, then add isolated parameter-sensitivity tests and independent pixel expectations. Cover neutral/disabled states, alpha, crop, clip versus track scope, order, reset, undo and canceled preview. A deliberately disconnected control must fail. |
| F50 | **Check: precision and color-space quality need targeted evaluation.** Effect intermediates use RGBA8. This limits precision but does not by itself establish visible banding in footage. | Test dark ramps and repeated grading for banding/clipping, plus translucent edges over light/dark backgrounds. Specify which operations use encoded versus linear-light values. Consider higher-precision intermediates only after measuring a failure and checking all rendering paths. |

The inspected vignette preserves alpha, and no new concrete defect was established in the examined chroma-key/spill or blend equations. Their broader quality remains a test question, not a clean bill of health for every configuration.

### Precision and color-space evaluation (F50)

The [precision ramp](effects-audit/precision-ramp.json) compares an untouched 256-level gray ramp with two inverse Levels adjustments, Gamma 0.5 followed by Gamma 2. The native D3D11 render exited 0 without a media fallback. The untouched result retained 256 distinct levels. The adjusted result retained 192, with a maximum error of 11 byte levels. Inputs 0–11 collapsed to black. This is measurable intermediate quantization, not a claim about all footage.

The [shared GPU test](../../../packages/gpu/tests/precision.test.ts) and [CPU tests](../../../packages/timeline/tests/render.precision.test.ts) enforce that precision floor while allowing improvements. The CPU edge test also verifies that hidden red pixels under zero alpha cannot contaminate a blurred white edge over black or white. The GPU glow tests separately check premultiplied alpha bounds.

Current timeline operations consume encoded RGB values. Vignette multiplies encoded RGB, Levels and Curves operate on encoded channel values, and blur/glow average their supplied values without a transfer-function conversion. A module's `linear` metadata does not perform that conversion. [Executor](../../../packages/gpu/src/executor.ts) currently defers color-space validation and bridges alpha representation only.

Retain current rendering semantics for existing documents. A future color-managed pipeline should version its working space, use floating-point intermediates across native/shared GPU and a float CPU reference, and convert/dither only at the display or export boundary. Recheck dark ramps, highlights, translucent edges, LUTs and compositing together. Changing only the texture format would improve precision but would not make current encoded-light operations physically linear.

## Reproduction assets and results

The retained fixtures use opaque RGB images to exercise the effect renderer without unsupported-alpha placeholders. All three render processes exited 0 and produced the expected 14 stills with no media fallback. The Windows executable's effect sources match the audited revision. This was a focused diagnostic run, not the full effects test suite.

Run from `native/timeline/` with the existing Windows dependency environment:

```powershell
. ./build-windows/environment.ps1
$env:QSG_RHI_BACKEND = 'd3d11'
# Use Start-Process -Wait when invoking this GUI executable from PowerShell.
Start-Process ./build-windows/Release/nodetool-timeline.exe -Wait -WindowStyle Hidden -ArgumentList 'docs/effects-audit/vignette-white.json --stills build-windows/audit-vignette --still-frames 0,30,60,90 --decode sw --audio none'
Start-Process ./build-windows/Release/nodetool-timeline.exe -Wait -WindowStyle Hidden -ArgumentList 'docs/effects-audit/parameter-pairs.json --stills build-windows/audit-pairs --still-frames 0,30,60,90,120,150,180,210 --decode sw --audio none'
Start-Process ./build-windows/Release/nodetool-timeline.exe -Wait -WindowStyle Hidden -ArgumentList 'docs/effects-audit/blur-line.json --stills build-windows/audit-blur --still-frames 0,30 --decode sw --audio none'
```

| Fixture | Frames and purpose |
| --- | --- |
| [Vignette](effects-audit/vignette-white.json) | 0: measured profile. 30: larger radius. 60: zero softness. 90: zero amount. |
| [Parameter pairs](effects-audit/parameter-pairs.json) | 0/30: sharpen radius. 60/90: glow color. 120/150: red curve. 180/210: color/vignette order. Each pair was byte-identical in this audit. |
| [Blur](effects-audit/blur-line.json) | 0: radius 20. 30: radius 40. Compare the middle scanline. |
| [Precision](effects-audit/precision-ramp.json) | 0: untouched ramp. 30: inverse Levels adjustments. Compare distinct levels and maximum byte error. |

## Implementation order

1. **A1:** Remove the fake card preview, add live track-effect preview, and expose consistent vignette radius controls. Retain current rendering semantics initially.
2. **A2:** Fix inactive parameters, curve fidelity and wide-radius blur with independent pixel tests. Coordinate changes with shared render/export implementations.
3. **A3:** Settle stack ordering, reset defaults and imported-effect editing. Add vignette shape/color-quality enhancements as explicit, compatible changes.

[VideoPreview]: https://github.com/nodetool-ai/nodetool/blob/3df7fc227bba42a325f15b2668d62d87a20ba0b5/native/timeline/qml/wiring/w/VideoPreview.qml
[shader]: ../shaders/effects/clip.frag
[EffectPlan]: ../src/preview/effects/EffectPlan.cpp
[ClipCatalog]: ../src/edit/clipeffects/ClipEffectsCatalog.js
[EffectCard]: ../qml/wiring/w/EffectCard.qml
[ToneCurve]: ../src/edit/clipeffects/ToneCurveEditor.qml
[SliderRow]: ../qml/Inspector/primitives/InspectorSliderRow.qml
[ClipEdits]: ../src/edit/clipeffects/ClipEffectsEdits.qml
[KnobList]: ../qml/wiring/w/KnobList.qml
[type contract]: ../../../packages/timeline/src/types.ts
[SharedVignette]: ../../../packages/gpu/src/shaders/filters/vignette/v1/module.ts

## Recommended additions after the audit fixes

These are proposed follow-up features, outside the F35–F50 implementation checklist. The current effect catalogue already covers LUTs, RGB curves, levels, lift/gamma/gain, chroma key, grain, masks and several stylized effects. Prioritize correction and repair capabilities before adding more decorative effects.

| ID | Priority | Missing timeline capability | Implementation direction |
| --- | --- | --- | --- |
| F51 | High | Exposure in stops and highlight roll-off. Brightness is not an exposure control. | Reuse the existing [exposure modules](../../../packages/gpu/src/shaders/color/exposureTone/v1/module.ts), define the working color space, and expose exposure, highlights and whites consistently in native preview/export. Preserve highlights in floating-point intermediates before display conversion. |
| F52 | High | Noise reduction with separate luminance/chroma controls. | Start with an edge-preserving spatial filter. Add motion-aware temporal reduction with bounded neighboring-frame caches, scene-cut resets and deterministic seeking. Test moving edges for trails and fine detail for excessive smoothing. [Temporal denoising reference](https://docs.opencv.org/4.10.0/d1/d79/group__photo__denoise.html). |
| F53 | High | Secondary color correction by hue/saturation/luminance range. | Add a range qualifier with soft boundaries, matte preview and hue/saturation/luma adjustments. Include hue-versus-hue and hue-versus-saturation curves. Preserve hue wraparound and avoid hard selection seams. RGB curves and chroma-key removal do not provide these controls. |
| F54 | Medium | Deflicker for unwanted temporal brightness changes. | Analyze luminance over a bounded frame window and compensate gradually. Detect scene cuts and preserve intentional fades. Cache analysis by source/settings so backward scrubbing and export agree. [Deflicker reference](https://ffmpeg.org/ffmpeg-filters.html#deflicker). |
| F55 | Medium | Debanding for gradients and compressed source footage. | Use thresholded edge-preserving smoothing with optional low-amplitude dither. Expose strength/range, preserve alpha and detail, and test dark ramps. Keep source repair separate from fixing precision loss in our own pipeline. [Debanding reference](https://ffmpeg.org/ffmpeg-filters.html#deband). |
| F56 | Medium | Camera stabilization with motion analysis and crop control. | Estimate camera motion, reject independently moving foreground objects, and store a smoothed transform path. Expose smoothing/crop limits and an analysis state. Treat it as a clip analysis operation with cached results, not a stateless shader. [Two-pass stabilization reference](https://ffmpeg.org/ffmpeg-filters.html#vidstabdetect). |

The implementation guidance above also applies to these proposed additions.
