# Plan 3: Sketch precision and GPU editing

Follow [P1's decisions](high-precision-media-processing.md#decisions) and [server/browser policy](high-precision-media-processing.md#server-and-browser-policy). I0 can run in parallel with P1. Sketch does not wait for S3 or agent timeline migration; it qualifies its own operations on hardware and Dawn/lavapipe. I1–I3 start only after I0 passes and reuse the shared interfaces they need. P1 can ship without Sketch. Browser fallback retirement additionally requires A95's packaged Linux desktop qualification and P3's own editing/save checks.

## Motive and limits

The GPU direction needs evidence beyond a texture-format upgrade: less copying during editing, useful latency improvements, or reuse of the same effect implementation for display, commits and export. Measure those benefits against the existing editor. Do not assume most projects require preserved 16-bit source codes or collect new product analytics just to justify the work. Use representative actual workloads, including ordinary 8-bit images and generated gradients.

The current WebGPURuntime delegates committed pixels and saves to Canvas2DRuntime. Requiring WebGPU does not replace that pixel authority. Keep those internals until their editing, history and save replacements pass. Canvas2D can be accelerated and some implementations support float16. First decide the source-depth requirement. FP16 cannot preserve every 12/16-bit code, so skip a float16 alternative if that identity is required. Otherwise a bounded comparison may establish whether narrower editing changes meet the need more cheaply.

GPU editing remains the preferred direction for sharing processing modules. Broader migration is conditional on I0. Do not build multiple production renderers or expose precision modes while evaluating the alternatives.

I0–I3 preserve existing color/effect semantics while using P1's A97/A98 declarations and unchanged-color checks. I4 separately adopts [linear-light SDR](high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery) on the selected editing path. Neither the precision proof nor PNG16 delivery waits for I4. FP32 working storage does not imply linear-light samples.

## Working pixels, storage and access

| Concern | Contract |
|---|---|
| Originals | Keep encoded/integer source assets unchanged. Materialize edited pixels only when necessary. |
| Working pixels | Use FP32 for the GPU high-depth proof. Live textures own the latest working revision, with bounded snapshots outside GPU memory. The document remains independent of GPU handles. |
| Durable edited layers | Prefer standard 16-bit PNG for bounded SDR raster samples, through existing asset/document storage. Preserve content bounds and alpha/color metadata. No custom FP32 disk serializer by default. |
| Precision at save | PNG16 preserves stored integer samples, not arbitrary FP32 bits. Saving is an explicit quantization boundary. Keep in-session undo exact for captured working samples. Test save/reopen separately against its declared integer error bound. |
| Unsupported operations | Do not silently clamp out-of-range working values just to fit PNG16. Define the intended SDR bake/commit behavior. If a required persistent result cannot fit, defer that operation or make a separate storage decision using an existing suitable format. |
| Headless access | Move qualified `render_sketch`, CLI rendering and agent raster edits to shared shaders on Node/Dawn, including lavapipe. Migrated rendering needs an adapter. Keep document/asset inspection and unrelated tools usable without initializing it. Successful PNG decoding does not prove 16-bit processing. Qualify writes separately. |

A 16-bit PNG is a storage encoding, not a requirement for `rgba16unorm` GPU textures. Decode into the selected working representation. Its raw samples use fewer bytes than FP32, but compressed file sizes and codec cost must be measured.

Retain the existing document structure, history and autosave. Add only the representation metadata needed for correct decoding and loss prevention. Use existing version snapshots before a persistent format change if needed. Do not create a new identity for every upgraded sketch or add a general compatibility framework.

Save/undo/export wait for completed revisions, reject stale results and never serialize the viewport. Checkpoints support device-loss recovery; durable saves support process-loss recovery. Do not claim unsnapshotted GPU edits survive device loss. Keep existing editor behavior during the proof. Before new raster defaults, qualify supported operations and block unsupported writes with an explanation. Preserve existing saved data, downloads and unaffected document access when rendering is unavailable. No automatic CPU or remote-rendering fallback is added.

## I0: Compare a small proof before migrating tools

- [ ] **A36.1: Establish the image requirement and I/O route.** Select ordinary 8-bit editing examples and one real 16-bit still workload. Identify the required visible benefit and any source-code identity requirement. Verify one existing decoder/encoder path preserves sample depth, scaling, alpha and metadata. Keep original assets. A float cast or successful Canvas2D decode is not evidence of preserved source depth.
- [ ] **A85: Compare bounded editing proofs after A36.1.** Compare the current editor with one FP32 GPU brush using existing modules on browser hardware and Node/Dawn/lavapipe. Include low-opacity strokes, undo/redo, PNG16 save/reopen, export, checkpoint recovery and agent/CLI readers. Check identity only on opaque unchanged-encoding fixtures and test edited values/low alpha separately. If full source-code identity is unnecessary and the result could reduce migration cost, add one supported float16 Canvas operation in browser and isolated headless tests. Verify actual context/readback precision and premultiplication. Do not require a repository-wide Canvas dependency upgrade or ship a second renderer for this comparison.
- [ ] **A89: Choose the smallest justified implementation.** Set latency, memory and save-size budgets before measuring. Record adapter/features, readbacks, uploads and codec costs. Compare visible quality and module reuse, not just arithmetic. Confirm that required headless edits can preserve the selected data. Continue the GPU migration only if its benefit justifies the tool/history changes. Otherwise defer it or narrow the first release. Do not add a tile engine, custom float storage or multiple precision modes to rescue a failing proof.

**Exit gate:** a chosen approach has demonstrated user value, recoverability, headless access and acceptable cost. I1–I3 describe the GPU migration and are scheduled only if it passes this gate. The Canvas2D experiment is not a commitment to ship a second new path.

## I1: Reuse raster interfaces and standard storage

Primary modules: [raster types](../../../packages/image-editor/src/raster/types.ts), [document types](../../../packages/image-editor/src/types.ts), [runtime](../../../web/src/components/sketch/rendering/WebGPURuntime.ts), [serialization](../../../web/src/components/sketch/serialization/index.ts) and [headless renderer](../../../packages/image-editor/src/render/document.ts).

- [ ] **A51.1: Separate document data from live rendering.** Extend existing raster/SketchRuntime interfaces with explicit representation, dimensions, stride, alpha/color interpretation and layer revisions. Reuse content-sized layers and document-space origins. Avoid exposing GPU handles as document data or keeping a second mutable canvas as the new path's pixel authority. Preserve agent access to document and raster operations.
- [ ] **A51.2: Save edited SDR layers through PNG16.** Reuse existing codecs and storage with explicit 16-bit output and completed revision snapshots. Bound in-flight readbacks, process changed layers and reject stale completions. Preserve bounds and separate previews. Test actual encoded depth, straight alpha, malformed input, negative origins and transformed layers. Stop if the proof cannot meet the storage contract without silent loss. No custom binary serializer.
- [ ] **A52.1: Implement working allocation, copy and crop.** Use existing GPU modules and FP32 where the high-depth contract requires it. Identity copies preserve working samples. Test strides, offsets and transparent pixels. Source decoding and I/O may run on the CPU.
- [ ] **A52.2: Qualify transforms/resampling.** Check actual sampling requirements on hardware and lavapipe and enable optional features only when used. Do not require fixed-function FP32 blending for shader compositing. Test missing capabilities and prevent unsupported writes with clear operation-specific errors. WebGPU presence alone does not qualify FP32 operations.
- [ ] **A52.3: Qualify composition and masks.** Reuse existing modules. Cover low alpha, blends, masks and resulting range. Define any intentional SDR bake boundary explicitly. Do not silently pass new rasters through byte-oriented writes.

**Exit gate:** existing document/storage interfaces carry the chosen representation and agent/CLI readers handle it as declared. No new persistence engine is required.

## I2: Migrate justified editing operations

Keep existing editing controls. A renderer's capabilities must not become a precision-mode menu.

- [ ] **A53.1: Extend brush and eraser commits.** Build on the proof. Test repeated low-opacity strokes, commit/cancel and viewport-only redraws. Byte color controls can remain, but accumulated working pixels must not round to bytes after each stroke.
- [ ] **A53.2: Preserve fill and gradient precision.** Test smooth gradients and geometric boundaries before display conversion. Reuse existing tool geometry.
- [ ] **A53.3: Qualify sampling, selection and merging.** Sample working data, not display dithering. Preserve selection behavior and cancellation. Test merge range and its declared save boundary. No new high-depth inspector is required.
- [ ] **A54.1: Connect shared sketch processing.** Reuse the same qualified effect/compositing modules for preview, commits, export and headless rendering. Adapt `render_sketch` and CLI rendering to Node/Dawn/lavapipe with lazy initialization, documented prerequisites and missing-runtime/adapter tests. Enumerate and qualify agent raster writes before replacing their Canvas2D implementations. Remove only unused CPU code after caller checks, preserving source rasterization. No broad workflow-image or provider rewrite.
- [ ] **A54.2: Separate working pixels from presentation.** Save/history/export never use an 8-bit viewport capture. Keep ordinary display conversion. Do not add a separate FP16 sketch-preview mode or lower-precision cache framework without measured need.
- [ ] **A55.1: Preserve undo/redo samples.** Adapt changed-layer history to completed working snapshots. Replace canvas-only assumptions for the chosen path and reject stale completions. Test immediate undo after strokes, effects, transforms and merging. Exact in-session recovery is separate from PNG16 save quantization.
- [ ] **A55.2: Bound history and transfers.** Keep existing delta history and baseline carry-forward. Add byte accounting for working textures, snapshots and pending readbacks. Release safely under budget. Do not build tiles or a new history engine before measuring the existing mechanism.

**Exit gate:** enabled UI and headless edits obey the chosen precision and completion contracts. Preview changes cannot mutate saved content.

## I3: Save, recover and deliver across clients

- [ ] **A56.1: Qualify PNG16 save/reopen.** For opaque same-encoding samples in [0,1], nearest rounding contributes at most 0.5/65535 per channel at the save boundary. Require exact stored integer codes after decoding and no further drift across repeated no-edit save/reopen cycles. Check alpha/color conversion separately. Test mixed original-backed and edited layers, plus a stroke followed immediately by save, undo or export.
- [ ] **A56.2: Preserve recovery on interruption.** Reuse existing history snapshots and autosave. Keep bounded completed checkpoints outside GPU memory and acknowledge only durable saves. Test device loss during edits/readback, stale completions and interrupted replacement. Preserve the last valid save and report newer lost edits. Restore through a qualified adapter or retain the recoverable data without a lossy fallback write. No command-replay engine or new CPU renderer.
- [ ] **A56.3: Prevent destructive handling of unsupported data.** Handle corrupt/missing layers without overwriting the last recoverable version. Test current browser, agent and CLI writers against new raster data. A display approximation must never silently replace authoritative saved samples.
- [ ] **A57: Reuse existing document versions.** Preserve originals and take an existing version snapshot before a persistent format change when needed. Keep document identity unless a real incompatibility requires a copy. No reverse converter or historical-client compatibility matrix.
- [ ] **A41.1: Qualify still export.** Verify actual 16-bit PNG output, integer identity fixtures and edited-image tolerances. Check straight-alpha edges separately. Ordinary 8-bit export remains an explicit final conversion. Do not promise hidden RGB recovery from a premultiplied composite.
- [ ] **A43.1: Compare UI and headless output.** Exercise `render_sketch`, CLI rendering and agent edits on the same document. Compare shared-shader working output on hardware and lavapipe with declared tolerances. Test missing adapters and device loss separately. An 8-bit screenshot cannot certify 16-bit output.
- [ ] **A59: Enable only the qualified scope.** Measure painting, effects, undo, save/reopen/export and memory against A89's budgets on hardware and the server software adapter. Apply P1's contention test method to headless sketch workloads, setting Sketch budgets independently if P1 is unfinished. Qualify headless replacements, clean CLI completion and browser editing before new persistence defaults. Retire alternate Canvas2D selection only after A95 and Sketch's own browser/Electron format and editing tests pass. Otherwise retain the existing path without enabling unsupported new writes. Test errors and recoverable data when rendering is unavailable. Software batch rendering has separate throughput targets.

**Exit gate:** the chosen editing path and standard storage improve image work without losing headless operation or silently reducing saved precision.

## I4: Adopt linear-light SDR on the qualified editing path

- [ ] **A104: Qualify shared SDR semantics after I3.** Apply P1 S6's transfer/alpha rules to supported brush composition, transforms/resampling, blur and layer composition. Preserve declared domains for artistic blends, grading, LUTs and gradient tools. Convert color-picker and rasterized source colors at explicit boundaries. Keep saved PNG layers in their declared SDR encoding with straight alpha, encoding linear working pixels before save quantization. Undo snapshots retain their working interpretation. Recheck save/reopen drift, low-opacity strokes, transparent edges, merge results and UI/headless parity. Reuse A89's budgets and existing version snapshots where needed. Do not claim unchanged integer codes across transfer conversions or add a user color-space switch, alternate renderer or HDR persistence.

**Exit gate:** the selected editor and headless path use the same qualified SDR behavior while saved layers remain correctly readable by existing image viewers. Exact same-encoding fixtures remain separate from conversion error bounds.

## Verification and deferred work

Extend [raster tests](../../../packages/image-editor/tests/raster.test.ts), [serialization tests](../../../web/src/components/sketch/serialization/__tests__/serialization.test.ts), [runtime tests](../../../web/src/components/sketch/__tests__/WebGPURuntime.test.ts), [agent rendering tests](../../../packages/agents/tests/capabilities-sketch-render.test.ts) and existing history/edit harnesses. Expected-value calculations may run on the CPU without creating another production renderer.

Defer HDR/wide gamut, high-depth PSD, custom float disk storage, a new tile architecture, mobile float editing and broad Python/provider transport changes. Exact FP32 disk round trips are not a requirement for the PNG16 SDR release. Keep performance, storage and source-depth claims limited to the measured workloads.
