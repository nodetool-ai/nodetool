# Color precision: evidence and design limits

This evidence was first collected at main `c09b1b81a9543cbfab05ee5cd4546bdf2f15448e` and native branch `c5d79c397959666b962c9a7647d89adb5a0dd5fc`. On 2026-11-04 the references moved to main `aad729d293fe930d463f6bc1b008c84305180031` and native branch `33963a5d7111bda52f116392d1b7c34eab7e3430`. At those revisions every pinned path exists, F1 and F3 were rechecked, and F2, F4, F12 and F18 were spot-checked. Recheck other sections before relying on them. The implementation scope is defined by [P1](high-precision-media-processing.md), [P2](native-timeline-precision.md) and [P3](sketch-precision.md).

## F1: Native integration is independent

The main snapshot lacks the native tree and its workflow. P2 is deferred until its integration is scheduled. P1 can reconcile the small numerical fixture with main's code without importing the editor. The pinned native [build configuration](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/CMakeLists.txt) requires Qt 6.12. Its [CI](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/.github/workflows/native-timeline.yml) exercises Metal, Vulkan/lavapipe and D3D11/WARP, with no explicit OpenGL precision job. These tests do not establish hardware speed.

## F2: FP16 is a runtime improvement, not a document capability

Core WebGPU supports the ordinary `rgba16float` usages needed by this work without shader-f16 arithmetic. FP32 filtering and fixed-function blending have distinct optional features. Request only what the chosen passes use and validate actual resources. See the [WebGPU specification](https://www.w3.org/TR/webgpu/).

The [shared context](../../../packages/gpu/src/context.ts) maps `f16Storage` to `shader-f16`, conflating texture storage with shader arithmetic. The [Node factory](../../../packages/gpu/src/node.ts) and editor device creation need consistent capability handling. The shared [compositor](../../../packages/gpu/src/compositor/compositor.ts) composites in its shader without fixed-function blend state, so FP32 work does not automatically require `float32-blendable`.

Keeping existing effect semantics makes timeline FP16 an internal renderer change. No document profile or copy flow is needed. Unsupported operations follow runtime capability checks, not a new document flag. P1 S6 separately schedules linear-light SDR, selected by a saved working color space version rather than by FP16, with explicit appearance changes and its own release gate. Do not use browser names or an adapter-survey percentage as a substitute for qualifying actual routes.

## F3: Native capture precedes presentation

[PreviewCompositor](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/preview/PreviewCompositor.cpp#L1609) captures `m_canvas` before its final item blit, interpreting it as byte-premultiplied QImage data. [OffscreenFrames](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/export/OffscreenFrames.cpp#L116) returns that capture converted to straight RGBA8. It does not read back the outer Qt scene target.

Upgrade internal working resources and typed capture. The presentation target may remain RGBA8. Capture disables monitor alpha/grid modes and uses opaque black, including existing PNG output. Preserve that behavior rather than adding transparent export as a precision prerequisite.

Qt composites the QQuickRhiItem texture into its scene and changing target format can invalidate compatible pipelines. See [QQuickRhiItem](https://doc.qt.io/qt-6.12/qquickrhiitem.html). Declare render/readback usages before resource creation as required by [QRhiTexture](https://doc.qt.io/qt-6.12/qrhitexture.html).

## F4: Native preview controls already exist

Native has playback/paused Full/Half/Quarter/Eighth settings. [Canvas selection](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/preview/PreviewCompositor.cpp#L552) separates document dimensions from working allocations and forces full-resolution capture. Group effects/backdrop stages retain full canvases across motion-blur samples.

Reuse those safeguards and [monitor tests](https://github.com/nodetool-ai/nodetool/blob/33963a5d7111bda52f116392d1b7c34eab7e3430/native/timeline/src/preview/tst_monitorcompositor.cpp) in P2. Web preview-resolution controls are separate, conditional performance work. Neither selector guarantees that every effect allocation shrinks.

## F5: Sketch migration needs its own justification

[WebGPURuntime](../../../web/src/components/sketch/rendering/WebGPURuntime.ts) delegates layer mutations, snapshots and export to `cpuRuntime`; [SketchRuntime](../../../web/src/components/sketch/rendering/types.ts) exposes canvas/byte-oriented interfaces. Changing viewport textures does not change saved pixels.

Canvas2D can be accelerated and its API includes float16 contexts. See [context attributes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext). The GPU direction is justified by measured editing cost or shared processing behavior, not by assuming all Canvas2D operations execute on the CPU. Resolve A36.1's identity requirement before the brush proof. A float16 context cannot satisfy every 12/16-bit working-storage identity requirement.

The [published @napi-rs/canvas 1.0.13 declarations](https://cdn.jsdelivr.net/npm/@napi-rs/canvas@1.0.13/index.d.ts) include a float16 context and raw premultiplied half-float output from `data()`. The repository's [agent dependency](../../../packages/agents/package.json) uses the older 0.1 line. These declarations justify an isolated headless comparison when it could narrow the migration, not a broad major-version upgrade or an assumption that codecs preserve depth. Verify actual drawing/readback behavior and browser support. Required WebGPU removes the need for a second browser renderer; it does not itself replace canvas-backed editing internals.

## F6: Reuse history and version storage

[Layer serialization](../../../web/src/components/sketch/rendering/canvas2d/layerIO.ts) preserves content bounds. [History](../../../web/src/components/sketch/state/slices/historySlice.ts) already stores changed-layer deltas and carries the baseline forward. [Undo](../../../web/src/components/sketch/hooks/useHistoryActions.ts) and [export synchronization](../../../web/src/components/sketch/hooks/useExportSyncActions.ts) currently assume synchronous flushing. Adapt these interfaces for completed revisions instead of adding a history engine or scheduler.

Existing [agent version APIs](../../../packages/agents/src/codeact/nodetool-api.ts) expose timeline/sketch snapshots. Use them if a persistent format actually changes. Renderer rounding improvements alone do not require new document identities.

## F7: Standard storage needs an honest precision contract

The [image decoder](../../../packages/image-nodes/src/nodes/image-io.ts) currently produces byte samples on its ordinary paths. Sharp defaults PNG output to 8-bit; its 16-bit route uses `rgb16`. Pipeline/output color-space handling must also be verified. See [Sharp output](https://sharp.pixelplumbing.com/api-output/) and [color handling](https://sharp.pixelplumbing.com/api-colour/).

PNG stores integer samples and unassociated alpha. See the [PNG specification](https://www.w3.org/TR/png/). PNG16 is a practical candidate for bounded SDR edited layers, not a lossless encoding of arbitrary FP32 working data. Preserve originals, separate save quantization from exact in-session undo, and test that repeated no-edit saves do not drift. Do not assume all float values are already clamped or that a Canvas2D reader preserves all 16 bits. Compressed file size is not a fixed fraction of FP32 storage.

## F8: Headless and software routes are part of the product

The [Dockerfile](../../../Dockerfile) installs lavapipe for image processing and timeline compositing without a physical GPU. Mesa identifies it as a [software Vulkan rasterizer](https://docs.mesa3d.org/sourcetree.html). It runs shared shaders through Dawn on the CPU. It must be included in numerical and operational qualification, not described as test-only.

[RenderTimeline](../../../packages/video-nodes/src/nodes/timeline.ts) can attempt browser rendering before Node compositing. Its rough-cut fallback is restricted to opaque MP4 and reports omitted effects/transforms. Inspect the selected route rather than assuming every server export uses the same backend. The Dockerfile is evidence of an intended deployment path, not a measurement of live production hardware.

[Agent timeline previews](../../../packages/agents/src/timeline-preview/frames.ts) use Canvas2D/CPU passes and currently work without a WebGPU adapter. Adapt them and [comparison](../../../packages/agents/src/timeline-preview/compare.ts) to the existing headless compositor after server qualification. Their main migration benefit is shared effect coverage, including 8-bit PNG previews. Keep A91/A92 separate from browser precision delivery and preserve their [regressions](../../../packages/agents/tests/timeline-preview-parity-regressions.test.ts).

The [agents manifest](../../../packages/agents/package.json) already depends on `@nodetool-ai/gpu`. The new runtime requirement is a working native Dawn addon and adapter for migrated render commands. The [GPU package](../../../packages/gpu/package.json) declares Dawn's `webgpu` package as an optional peer and [loads it dynamically](../../../packages/gpu/src/node.ts). Preserve that lazy boundary. Without an adapter, rendering should fail with setup guidance while ordinary agent tools continue to load. Test both cases. No-adapter CPU preview support is intentionally retired with each qualified migration, not accidentally lost during an FP16 toggle.

[Agent sketch rendering](../../../packages/agents/src/sketch-render/render.ts) and [CLI rendering](../../../packages/cli-sketch/src/commands/sketch-render.ts) share the [headless document renderer](../../../packages/image-editor/src/render/document.ts). They follow the shared-shader policy through P3's separate proof. Keep current behavior until the replacement preserves required data and operations. CPU codecs and text/shape source rasterization can remain.

Browser fallback adapters are not guaranteed by the platform. See [WebGPU adapter selection](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter#fallback_adapters). Required WebGPU is the selected direction, but existing Canvas2D selection remains until separate browser and Linux desktop gates pass. After retirement, an unsupported browser gets a clear rendering limitation, with documents and recoverable data preserved. Native Windows can qualify WARP with its existing Qt shader pipeline, as supported by [Qt graphics configuration](https://doc.qt.io/qt-6.12/windows-graphics.html). Neither requires a universal renderer or remote-rendering service.

Shared shaders reduce implementation drift, but do not prove bit-identical results or acceptable software-rendering speed. Start with server export and single-frame agent previews. Qualify numerical tolerances, cold start, bounded concurrency/memory, cancellation and completion budgets before switching callers.

## F9: Browser delivery needs an explicit release gate

[ExportVideoDialog](../../../web/src/components/timeline/ExportVideoDialog.tsx) checks browser encoding support through [canEncodeMp4](../../../web/src/components/timeline/render/canEncodeMp4.ts). [useTimelineExport](../../../web/src/hooks/timeline/useTimelineExport.ts) renders through TimelineRenderer. Server qualification does not prove this path works. A93 covers real browser preview/export, constrained-device latency, pre-encode parity and renderer diagnostics. A94 separately retires Canvas2D selection after A93/A95 pass. Encoder support is independent of WebGPU availability.

## F10: Software rendering must fit the API host

Lavapipe executes on the host CPU, so a render can contend with API requests in the same container. Existing render-job limits do not by themselves establish a driver-thread or CPU budget. A82/A49 compare representative API latency and error rates with and without 4K rendering, including configured maximum concurrency. Set budgets before measuring and adjust existing limits/process settings when needed. Do not add a queue, remote renderer or new service as a planning prerequisite.

## F11: Browser exclusions need a separate compatibility release

The [WebGPU implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) records OS/GPU-specific limits: Chromium Linux defaults cover selected hardware, Firefox Linux and Intel Mac support is Nightly-only, Windows ARM64 Chromium requires a flag, and Safari support requires newer OS releases. A browser-level support percentage cannot establish usable adapters for these configurations. Recheck the platform table at release time.

Required WebGPU was an explicit product choice in this discussion. Precision delivery does not require immediate Canvas2D removal. A94 is a separate compatibility change, gated on browser qualification, packaged desktop coverage and documented exclusions. Keeping the existing path during this interval avoids making a desktop issue block FP16 improvements. It does not commit to new CPU effects or indefinite renderer parity.

## F12: Linux Electron needs packaged-app evidence

No WebGPU/Vulkan startup switches were found in `electron/src`. The [main entry point](../../../electron/src/main.ts) and [pinned Electron dependency](../../../electron/package.json) are A95's implementation starting points. Their absence does not prove every Linux installation fails. Adapter availability must be reproduced on actual hardware, including AMD, with the display server and driver recorded. A backend Dawn addon is separate from the Chromium renderer's adapter.

Electron supports applying switches [before app readiness](https://www.electronjs.org/docs/latest/api/command-line-switches). The [WebGPU implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) lists Chromium Linux flag candidates, but those are not a verified NodeTool fix. A95 tests the minimum needed configuration against the shipped Electron version, preserves sandbox settings, and checks rendering plus GPU-process stability. It can ship independently before FP16. Later precision qualification still tests each new working format.

## F13: Reuse test hosts and verify their actual adapters

The [Playwright configuration](../../../web/playwright.config.ts) already requests Vulkan and SwiftShader through ANGLE. Chromium documents `use-angle=swiftshader` as an [OpenGL ES driver selection](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md), so that flag alone does not prove the WebGPU adapter is SwiftShader. A93 verifies adapter identity and real FP16 rendering, including SwiftShader coverage. Reuse this host rather than inventing another one. Software-adapter tests do not establish Linux hardware stability or interactive speed.

The [agent CI matrix](../../../.github/workflows/quality-checks.yml) already installs `mesa-vulkan-drivers`, and [agent render tests](../../../packages/agents/tests/capabilities-timeline-render.test.ts) already exercise WebGPU. A91 must align the [root prerequisite guidance](../../../AGENTS.md), check other test entry points, and ensure required rendering tests run rather than skip. Keep deliberate no-adapter contract tests separate from GPU qualification.

## F14: Native planning stays with C++ and Qt

The selected planning scope is C++ with Qt/QML. Qt RHI remains the baseline. [Dawn](https://github.com/google/dawn) exposes C/C++ WebGPU interfaces and is a candidate for sharing effect shaders, not a committed migration. Choosing shared processing does not require Qt's UI rendering to move to WebGPU. Rust is a possible long-term reconsideration and introduces no tasks, dependencies or abstractions here.

Shader reuse also needs binding layouts, parameter packing and pass execution. The existing [executor](../../../packages/gpu/src/executor.ts) and [compositor](../../../packages/gpu/src/compositor/compositor.ts) use TypeScript/TypeGPU. Native code cannot directly execute those host modules. A bounded proof should consume one existing WGSL effect with its bindings, rather than first inventing a cross-language renderer framework.

[QQuickRhiItem](https://doc.qt.io/qt-6/qquickrhiitem.html) uses Qt Quick's QRhi/device and supports native texture wrapping. That establishes possible integration points, not an automatic Dawn bridge. A useful proof covers hardware decode, an effect, presentation and export, including synchronization, frame ownership, backward scrubbing and device loss. Readback can establish correctness initially but does not establish acceptable playback cost. Qualify the actual Windows interop route first and examine Metal/Vulkan implications before committing to a replacement.

P2's A96 records the C++ renderer decision before backend-specific precision work. Keep Qt/QML and existing decoding/cache fixes. Continue with Qt RHI if the proof does not justify migration. If Dawn is selected, revise the implementation tasks before building precision support twice. Shared fixtures and explicit frame contracts remain useful with either renderer.

## F15: Software adapters are qualified configurations, not guarantees

The [WebGPU specification](https://www.w3.org/TR/webgpu/#dom-gpurequestadapteroptions-forcefallbackadapter) permits `forceFallbackAdapter` to return null when no fallback adapter is supported. It does not select SwiftShader by name or supply a missing implementation. Electron's pinned build can be tested for a software route, including formats, packaging, stability and throughput. Passing that test supports a declared configuration, not an unconditional promise across hosts. A server-export action remains a separate product feature and cannot restore interactive preview or Sketch editing.

## F16: Qualify the shipped rendering dependency combination

The [Dockerfile](../../../Dockerfile) selects Mesa from bookworm-backports without an exact package-version pin. The [GPU manifest](../../../packages/gpu/package.json) declares a compatible Dawn-addon range. Record resolved versions from the built artifact and qualify changes with the numerical software-renderer checks and packaged backend smoke test. Include image rebuilds that change Mesa without changing application source. Prefer existing lock/build/release mechanisms over a new dependency-management system. A permanent driver freeze is not the objective.

## F17: Mobile remains a reader of saved images

The [mobile Sketch renderer](../../../mobile/src/components/sketch/SketchRenderer.tsx) resolves saved layer images into React Native Image sources. The [timeline viewer](../../../mobile/src/screens/TimelineViewerScreen.tsx) reads sequence data without editing it. Include both in the reader inventory, and test new PNG16 payloads on actual Android/iOS image decoders, including alpha and layer bounds. An ordinary display conversion is acceptable for viewing and must not rewrite authoritative samples. This does not require adopting mobile WebGPU or promising compositor parity for the existing viewer.

## F18: Color declarations need enforcement before linear-light processing

The inspected [timeline uploads](../../../web/src/components/timeline/preview/gpu/compositor.ts) use `rgba8unorm`, and the [compositor shader](../../../packages/gpu/src/compositor/shaders.ts) combines sampled values directly. The [grade module](../../../packages/gpu/src/shaders/color/grade/v1/module.ts) declares sRGB inputs/outputs. These paths do not establish an end-to-end linear-light pipeline. WebGPU's [`-srgb` texture formats](https://www.w3.org/TR/webgpu/#texture-formats) provide transfer conversion during shader reads/writes. Ordinary unorm and float storage do not imply that conversion.

The [executor](../../../packages/gpu/src/executor.ts) bridges alpha association but defers color-space checks/conversion. [Texture metadata](../../../packages/gpu/src/texture.ts) defaults to `linear`, while the [image uploader](../../../packages/image-nodes/src/nodes/lib-shader-utils.ts) writes decoded bytes without transfer conversion in that function. Treat labels as claims to trace, not proof of linear pixels. Linear sampling and algebraic `linear-in-rgb` classification describe different properties. A97/A98 correct the contracts without changing the FP16 milestone's rendering behavior.

Encoded-space processing can be intentional for artistic operations. Linear light is the selected basis for normal composition, resampling and light-mixing effects. It is useful for SDR independently of HDR. P1 S6 gives these changes their own fixtures and release gate. P2 N4 and P3 I4 reuse that contract without delaying precision delivery.

## F19: vvvv demonstrates explicit effect-domain boundaries

vvvv's [Stride/TextureFX documentation](https://thegraybook.vvvv.org/reference/libraries/3d/texturefx.html#srgb-and-linear-color-space) describes a linear-light default, automatic conversion through sRGB texture formats, and explicit read/write exceptions for effects that expect encoded values. This supports declaring effect domains rather than blindly converting all shader operations. It does not establish the behavior of every Skia path.

The [7.3 release notes](https://thegraybook.vvvv.org/changelog/7.x.html#vvvv-gamma-73) describe Stride/Skia color-conversion fixes and GPU video sources moving to linear half-float texture formats. Boundary qualification remains necessary even with a shared working convention. NodeTool should reuse its existing interfaces and helpers, with one SDR working space and tested exceptions, rather than introduce a general color-management framework.

## Scalar storage check

Enumerating every code, normalizing by `2^bits - 1`, storing as .NET `System.Half` or `float`, then rounding back nearest-even gave:

| Input bits | FP16 changed codes | FP32 changed codes |
|---|---:|---:|
| 8 | 0 | 0 |
| 10 | 0 | 0 |
| 12 | 1,023 | 0 |
| 16 | 58,367 | 0 |

This checks scalar storage only. It does not qualify uploads, shader arithmetic, alpha conversion, filters, codecs or visible benefit. P1 requires realistic scenes and weak/server targets alongside numerical fixtures. Timings and adoption claims require measurements, not inference from these counts.
