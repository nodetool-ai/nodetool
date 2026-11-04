# Plan 2: Native timeline precision and export

Deferred companion to [Plan 1](high-precision-media-processing.md). Activate this work when native integration is scheduled. P1 can proceed independently, sharing numerical vectors with native code. Working precision is a renderer choice, with no saved profile, document copy flow or new precision setting.

**Scope:** existing supported 8-bit SDR decoding, FP16 processing and ordinary 8-bit delivery. Reuse compatible frame/alpha contracts where useful. Do not make native integration a dependency of browser/server work or let native monitor settings determine web UI scope.

N1–N3 preserve existing effect meanings and adopt P1's A97/A98 color declarations and boundary checks. N4 separately adopts [linear-light SDR](high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery). Neither P1's nor native FP16 delivery waits for N4.

**Implementation direction:** C++ with the existing Qt/QML UI. Qt RHI remains the baseline. Evaluate Dawn only as a C++ rendering alternative with demonstrated shader-reuse and operational benefits. Rust, language-neutral host abstractions and a UI rewrite are outside this plan.

## Integration prerequisite

Native source links refer to `feat/native-timeline` at `c5d79c397959666b962c9a7647d89adb5a0dd5fc`. Confirm the intended integration branch before scheduling these tasks. Recheck its implementations and existing tests at that point.

That revision requires Qt 6.12. Reuse its build setup and preserve the working renderer during evaluation. See [research notes](research-notes.md#f14-native-planning-stays-with-c-and-qt) for evidence.

## N0: Confirm the C++ rendering direction

Run this bounded investigation when native integration is scheduled. It does not block P1 or require implementing a second production renderer.

- [ ] **A96: Evaluate C++/Dawn against the existing Qt renderer.** Reuse one existing WGSL effect with explicit bindings and parameter packing. Exercise a decoded frame through processing, Qt presentation and export. Compare copying, synchronization, frame lifetime, backward seeking and playback/export cost with the current Windows route. Readback is acceptable for initial correctness, not proof of a viable playback path. Check Metal/Vulkan integration feasibility before selecting a replacement. Preserve the UI and decoding/cache fixes. No new general shader compiler or host framework.

**Exit gate:** retain Qt RHI unless the proof demonstrates a worthwhile replacement. N1–N3 below describe the Qt RHI implementation. If Dawn is selected, revise their backend-specific steps before implementation and retain the numerical, ownership and export requirements. Do not implement both precision paths first. No Rust evaluation is required.

## N1: Upgrade working resources and effects

Owner role: native renderer maintainer. Reuse the current compositor and resource pools.

- [ ] **A30: Upgrade named color resources and frame contracts.** Cover m_canvas, size-keyed surfaces, m_previousCanvas and effect ScratchPool. Keep m_blurTexture and LUT storage float where they already are. Update LayerSource, LayerRegistry and ComposeRegistry contracts so float frames are not tagged as byte input. Include working format in allocation identity, render-pass compatibility and byte budgets. Use internal renderer configuration, without changing timeline schemas. Test resize, reuse, eviction and release.
- [ ] **A31: Update native shader passes.** Remove storage-driven byte rounding and byte alpha bridges in the current GPU path. Update sampling/pass selection with A30's frame metadata. Preserve effect parameters, ordering and deliberate Posterize behavior. Compile through the existing qsb pipeline and compare shared numerical vectors. Do not add a new shader compiler.
- [ ] **A33: Cover ancillary and temporal paths.** Exercise text, shapes, groups, masks, transitions, blur accumulation and previous-frame reuse. Byte-generated sources are promoted at a declared input seam. Later color processing remains float. Test reset on seek, source change and working-format change.
- [ ] **A35: Recheck frame ownership and scrubbing.** Stress backward seeks, source switches and repeated effect edits. Preserve the existing independent hardware-frame cache and retirement rules. Measure peak allocations and verify no new decode failures or unbounded growth. Do not rewrite NV12 interop as part of this task.

Primary modules: [PreviewCompositor.cpp](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/preview/PreviewCompositor.cpp), [SurfacePool.h](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/preview/SurfacePool.h), [ScratchPool.h](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/motion/capacity/ScratchPool.h), [ClipEffects.cpp](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/preview/effects/ClipEffects.cpp).

**Exit gate:** the actual native effect/compositing chain passes the inverse-Levels and alpha checks with FP16 working resources. Frame lifetime and scrubbing behavior remain sound.

## N2: Presentation and native export

Owner roles: native renderer and export maintainers. Preview and export must use the same compositor evaluation. Only the final output conversion differs.

- [ ] **A32: Separate working pixels from window presentation.** Keep internal working resources FP16. The QQuickRhiItem presentation target may remain RGBA8 with P1's final SDR conversion/dither. Do not require a float outer Qt scene target for export. Keep numerical working capture undithered. Test paused redraw stability and GL readback orientation.
- [ ] **A45.2: Qualify existing native resolution controls for FP16.** Reuse playback/paused Full/Half/Quarter/Eighth controls, project-space transforms and forced full-resolution capture. Preserve existing full-canvas exceptions for group effects/backdrop adjustments across motion-blur samples. Measure actual canvas/scratch allocations and extend geometry, mask/outset and capture-isolation checks for float resources. Do not add another selector or make optimizing those conservative exceptions a release prerequisite.
- [ ] **A84.1: Make internal canvas capture format-aware.** PreviewCompositor captures m_canvas before its final item blit. Replace its hardcoded RGBA8888-premultiplied interpretation and OffscreenFrames' byte conversion with a typed working capture or an explicit final GPU delivery pass. Preserve dimensions, row layout, orientation and completion lifetime. The outer RGBA8 scene target is not the export source. Test exact frame capture and undithered numerical readback.
- [ ] **A84.2: Connect ExportEngine to the qualified delivery conversion.** Keep existing codecs, layouts and opaque capture background for video/PNG. For the straight-RGBA conversion seam, unpremultiply in float before quantization and define alpha-zero handling. Convert once and avoid repeated display/delivery dithering. Retain bounded memory, cancellation and streaming. No new float encoder ABI or transparent-export feature is required.
- [ ] **A84.3: Verify native frame and still capture paths.** Exercise video output and existing PNG/ZIP delivery. Make each quantization point explicit. Check low-alpha edges over the existing capture background, cancellation, cleanup and pixel layout. Test alpha-zero/straight-alpha conversion separately at the internal helper. Preserve existing output alpha behavior.
- [ ] **A41.3: Qualify the existing 8-bit native delivery profile.** Decode the actual output and inspect pixels, format and color tags. Compare codec error separately from working precision. Do not claim higher-depth delivery merely because source processing is float.
- [ ] **A43.3: Compare native preview and export before encoding.** Render the same original-source frame, background, parameters and deterministic seeds. Compare undithered working pixels from preview and offscreen evaluation. Extend existing capture-isolation checks so zoom, alpha/grid display and resolution preferences cannot enter exported pixels. Apply separate tolerances for final dithering and encoded output.

Primary modules: [OffscreenFrames.cpp](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/export/OffscreenFrames.cpp), [ExportEngine.cpp](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/export/ExportEngine.cpp), [capture code](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/main.cpp).

**Exit gate:** native export preserves the precision improvement through the last intentional conversion. Window formatting cannot alter export evaluation, and reduced preview resolution cannot reduce export quality.

## N3: Qualify the supported release

Owner role: native release maintainer. Qualify the concrete Windows route first, then other backends independently. Do not claim untested support.

- [ ] **A34: Run numerical checks on supported backends.** Reuse the native branch's Metal, Vulkan/lavapipe and D3D11/WARP CI. It has no explicit OpenGL precision job; run the orientation/render checks on an actual GL backend before claiming GL support. Check FP16 targets, filtering, low alpha and row orientation. A backend is not qualified by another backend's pass.
- [ ] **A49.2: Measure the Windows hardware route.** Record the actual adapter and run P1's playback, seek and memory gates, including decode cache and export. Include a constrained supported target before broad performance claims. Software CI does not establish hardware speed or decode interop. No new P010/platform interop work is required.
- [ ] **A50.2: Enable FP16 on qualified native routes.** Use internal renderer configuration. Test existing documents without migration, unavailable capabilities, full-resolution export, repeated sessions and cleanup. Qualify platform software adapters such as WARP with the same native shaders before relying on them. Do not introduce a separate CPU effect renderer, require lavapipe on Windows or add a document-level device gate.

**Exit gate:** a named native backend meets numerical, export and resource criteria. Diagnostics identify actual processing. Unsupported-device behavior follows the explicit route policy without changing document access incidentally.

## N4: Adopt the shared linear-light SDR contract

- [ ] **A103: Qualify native linear-light SDR after N3.** Reuse P1 S6's transfer/alpha rules, effect-domain inventory and fixtures on the renderer selected by N0. Verify the actual decoded RGB interpretation, including the distinction between YUV matrix conversion and transfer decoding. Cover filtering, compositing, effect exceptions, Qt presentation and offscreen export without missing or double transfer conversion. Compare shared reference vectors and preview/export output, then rerun playback, backward-seek and resource gates on each supported backend. Keep the existing FP16 behavior until this separate gate passes. No new Qt UI controls, decoding interop or HDR output are required.

**Exit gate:** the selected native renderer implements the shared SDR semantics with qualified presentation/export and unchanged frame-lifetime guarantees.

## Explicitly deferred

High-depth native source preservation, P010 import, new hardware interop, 10-bit codecs, HDR presentation and exact legacy pixel compatibility are outside this cut. Preserve originals and record known source-depth reductions. Existing decode paths and backward-scrubbing fixes must keep working.

The [source/frame pool tests](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/tests/tst_framecache.cpp), [surface tests](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/tests/tst_surfacepool.cpp), [YUV tests](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/tests/tst_yuvformat.cpp), existing export tests and [orientation oracle](https://github.com/nodetool-ai/nodetool/blob/c5d79c397959666b962c9a7647d89adb5a0dd5fc/native/timeline/src/motion/orientation/oracle.mjs) are starting points. Add precise numerical assertions to existing interfaces rather than creating another native renderer for tests.
