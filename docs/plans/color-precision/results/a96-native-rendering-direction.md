# A96: Native rendering direction

Recommend retaining Qt RHI for the native precision work. Dawn is obtainable as a C++ SDK and has relevant interop extensions, but this investigation supplies no measured replacement benefit. The owner makes the final decision. A96 is partly met: acquisition and feasibility were investigated, but the required effect execution, end-to-end bridge and measured comparison were not done.

## Scope and stopping point

Work was confined to `film/color-n0`, starting at `33963a5d7111bda52f116392d1b7c34eab7e3430`. The user confirmed `feat/native-timeline` as the intended integration branch. The local ref of that name points to `3df7fc227bba42a325f15b2668d62d87a20ba0b5` and does not contain the requested starting commit. Findings below concern the requested starting commit, not an assumed up-to-date local integration ref. No merge, reset or rebase was performed.

Read N0/A96 and F14 from the owner's `color-plans` worktree. Those files were not edited. Production rendering, CMake and shaders were not changed. No proof code was added, and no default build dependency was introduced.

Stop before implementing the bridge. A representative proof needs decoded-frame import, effect hosting, Qt presentation, export, two-runtime completion/retirement and backward-seek handling. There is no existing C++ Dawn bridge in the inspected native compositor/build path. Windows qualification cannot run on this Linux host. Implementing and validating that work exceeds the approximately 90-minute proof allowance in my engineering judgment. This is an estimate of integration scope, not a measured build duration. SDK acquisition itself is inexpensive. No memory-intensive source build was attempted.

## Acquisition and environment evidence

Observed on 2026-11-04. Host: Omarchy 4.0.6, Linux x86-64, AMD Ryzen 5 3600, 6 cores/12 threads. `free -h` reported 31 GiB RAM, 16 GiB available and 10 GiB swap used at sampling time. `df -h .` reported 65 GiB available. Other builds were active, so these are transient observations and timings are noisy.

`nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader` failed with `Failed to initialize NVML: Driver/library version mismatch` and reported NVML library 615.78. GPU model and active rendering adapter were not established. This error does not prove Vulkan is unusable. No adapter request was made.

| Item | Observation |
|---|---|
| Existing native SDK | No matching headers found by `rg --files /usr/include /usr/local/include -g '*webgpu*' -g '*dawn*'`. `pacman -Q dawn` reported no installed package. `pkg-config --list-all` had no Dawn/WebGPU entry. These checks are not an exhaustive filesystem search. |
| Existing npm package | `node_modules/webgpu/package.json`: `webgpu` 0.4.0, MIT package metadata. `du -sb node_modules/webgpu`: 71,146,728 bytes. It contains platform `.dawn.node` addons, not an installed C++ CMake SDK. Its presence does not establish C++ linkage or Qt device sharing. |
| Upstream C++ package | Official release `v20261103.174204`, Dawn revision `dc5320f3ebebe9d42023c24d0ee76828412b66b4`. Linux Release archive downloaded successfully. |
| Download | 36,441,612 bytes, 1.675 seconds, one sample. |
| Extraction | 0.560 seconds, one sample. `du -sb build/a96-sdk/unpacked`: 122,032,142 bytes including directory metadata. This is SDK tree size, not application size. |
| SDK contents | C/C++ headers, `lib64/libwebgpu_dawn.a`, Tint libraries/tools and `lib64/cmake/Dawn/DawnConfig.cmake`. Exported target is `dawn::webgpu_dawn`, a static library. |
| Link prerequisites | Exported target references `Threads::Threads`, `dl` and `rt`. It also contains a conditional `EXECINFO_LIBRARY-NOTFOUND` expression. Consumer CMake configuration, ABI compatibility and linking were not tested. |
| Source build | Not run. Build time, peak RSS, dependency download size and build-tree size are unmeasured. Do not infer them from the prebuilt SDK size. |

Archive: [official Linux Release asset](https://github.com/google/dawn/releases/download/v20261103.174204/Dawn-dc5320f3ebebe9d42023c24d0ee76828412b66b4-ubuntu-latest-Release.tar.gz).
SHA-256 measured locally: `02cacf29a28cdf450901142edcda7fe874d739103094ffb37034ed8e153945a0`. This is a recorded download hash, not independent signature verification. Ignored acquisition files remain under `build/a96-sdk/` in this worktree.

Reproduction from this worktree, using Python's standard library:

```python
import pathlib, tarfile, time, urllib.request
root = pathlib.Path('/home/mg/Projects/nodetool-film/wt/color-n0/build/a96-sdk')
root.mkdir(parents=True, exist_ok=True)
archive = root / 'dawn-release.tar.gz'
url = ('https://github.com/google/dawn/releases/download/v20261103.174204/'
       'Dawn-dc5320f3ebebe9d42023c24d0ee76828412b66b4-ubuntu-latest-Release.tar.gz')
start = time.monotonic()
urllib.request.urlretrieve(url, archive)
print('download_seconds', time.monotonic() - start, 'bytes', archive.stat().st_size)
start = time.monotonic()
with tarfile.open(archive) as bundle:
    bundle.extractall(root / 'unpacked', filter='data')
print('extract_seconds', time.monotonic() - start)
```

The [CMake quickstart](https://dawn.googlesource.com/dawn/+/refs/heads/main/docs/quickstart-cmake.md) describes source fetching and installation. For this selected revision, trust the [actual CMake file](https://github.com/google/dawn/blob/dc5320f3ebebe9d42023c24d0ee76828412b66b4/CMakeLists.txt) over the quickstart's older minimum: CMake 3.22 and C++20. Source acquisition can fetch dependencies through Python or use gclient/depot_tools. The configuration names Abseil, Jinja2/MarkupSafe, Khronos/WebGPU headers and backend-dependent components such as SPIR-V tools, GLFW and platform SDKs. Selected options determine the closure. No source dependency installation was attempted.

## Existing Qt route and Dawn comparison

Paths below are relative to the repository and refer to the investigated revision. This is code inspection, not runtime qualification.

| Boundary | Existing Qt RHI route | What a Dawn replacement must establish |
|---|---|---|
| Windows decode | [D3D11Interop.cpp](../../../../native/timeline/src/preview/hw/D3D11Interop.cpp) shares Qt's D3D11 device with FFmpeg, serializes context access, copies the visible NV12 decoder-array slice to a reusable texture and wraps R8/RG8 plane views. `cacheCopy` makes a separate GPU cache copy. This route is not universally zero-copy. | Validate same-device D3D11 import or explicitly shared resources. A default Dawn D3D12 device is not Qt's D3D11 device. Shared handles, plane access and copy counts need measurement. Do not rewrite the decoder/cache as a prerequisite. |
| Software decode | [FfmpegSource.cpp](../../../../native/timeline/src/preview/FfmpegSource.cpp) uploads decoded planes through QRhi batches. Queued frame bytes are retained or copied when no retirement context exists. | Upload into Dawn, preserve YUV matrix and alpha interpretation, and count any additional output download and Qt upload. |
| Processing | [PreviewCompositor.cpp](../../../../native/timeline/src/preview/PreviewCompositor.cpp) records QRhi passes, with effects using QRhi resources. Shared web effects are TypeScript/TypeGPU host definitions. | Consume resolved WGSL with explicit binding layout and packed parameters. TypeScript execution, bind-group construction and pass scheduling cannot simply be linked into C++. |
| Qt presentation | QQuickRhiItem draws its canvas into its item target, which Qt then composites. | Wrap a compatible native output texture or use readback plus upload. Native texture wrapping alone supplies neither cross-device ownership nor completion ordering. |
| Export | [OffscreenFrames.cpp](../../../../native/timeline/src/export/OffscreenFrames.cpp) drives the same PreviewCompositor through QQuickRenderControl, waits for exact capture, then returns straight RGBA8. [ExportEngine.cpp](../../../../native/timeline/src/export/ExportEngine.cpp) converts RGBA through swscale for encoding. | Preserve the same evaluation, exact-frame wait, cancellation and delivery conversion. A standalone shader image written to PNG would not exercise this export route. |
| Lifetime and seek | [RetireQueue.h](../../../../native/timeline/src/preview/RetireQueue.h), [FrameCache.cpp](../../../../native/timeline/src/preview/FrameCache.cpp) and FfmpegSource retain frames through GPU use and distinguish current decode generations from cached picks. Hardware cache copies release decoder-pool pressure. | Keep the independent cache. Hold shared frames until both runtimes finish. Qt FramesInFlight alone cannot prove Dawn completion. Discard obsolete seek results without destroying resources still in flight. |
| Cost | No new playback/export benchmark was run. | Readback correctness could add GPU-to-CPU transfer, completion wait and CPU-to-Qt upload on each displayed frame. Those are structural extra stages, not measured milliseconds or proof that the route is too slow. |

[QQuickRhiItem](https://doc.qt.io/qt-6.12/qquickrhiitem.html) integrates rendering with Qt's QRhi and render-thread lifecycle. [QRhiTexture](https://doc.qt.io/qt-6.12/qrhitexture.html) supports native wrapping and requires readback usage declarations before creation. These are integration opportunities, not evidence of a working bridge.

### One concrete shared effect candidate

Inspected [color.brightnessContrast@1](../../../../packages/gpu/src/shaders/color/brightnessContrast/v1/module.ts). It contains a WGSL fragment body with TypeGPU `layout.$` references, not standalone resolved WGSL. A bounded future host can assign group 0 bindings 0–3 to the uniform, source float texture, mask float texture and filtering sampler, respectively. That numbering is a proposed explicit mapping, not captured TypeGPU output.

The parameter fields are `brightness: f32` at byte 0 and `contrast: f32` at byte 4. A C++ host should assert those offsets, allocate a conservatively padded 16-byte uniform block, and distinguish its size from any device-specific dynamic-uniform-offset alignment. The WGSL body must be resolved consistently with that layout. An absent mask needs full coverage, not a missing binding. Sampling uses linear filtering and clamp-to-edge. Preserve the existing premultiplied formula, including its `1/255` safe-alpha floor, for a reuse comparison. Do not silently turn the proof into a precision or color-semantics migration.

This is a host-contract inspection only. No WGSL was resolved, compiled or executed. No bindings or packing were validated on a device.

### Metal and Vulkan feasibility

The selected Dawn SDK exposes platform sharing features. [Shared texture memory](https://github.com/google/dawn/blob/dc5320f3ebebe9d42023c24d0ee76828412b66b4/docs/dawn/features/shared_texture_memory.md) requires explicit access scopes and synchronization. [Shared fences](https://github.com/google/dawn/blob/dc5320f3ebebe9d42023c24d0ee76828412b66b4/docs/dawn/features/shared_fence.md) includes Vulkan, DXGI and Metal event routes. Extension names do not prove adapter support.

- **F1: Metal.** [VideoToolboxInterop.mm](../../../../native/timeline/src/preview/hw/VideoToolboxInterop.mm) makes plane textures using Qt's MTLDevice and CVMetalTextureCache, retains the pixel buffer and tracks MTLCommandBuffer completion. Dawn's IOSurface/shared-event features suggest a possible path. Validate plane formats, device identity, access scopes and handoff in both directions. No Metal host or test was used.
- **F2: Vulkan.** [VulkanInterop.cpp](../../../../native/timeline/src/preview/hw/VulkanInterop.cpp) imports VAAPI DMA-BUF planes, checks modifiers and format support, submits foreign-queue acquire/release barriers and retains resources until release fences complete. Dawn exposes DMA-BUF/opaque-FD memory, semaphore sharing and Vulkan image-layout state. This does not make a VkImage from one device usable by another. Verify exportable output allocation, usage, modifiers, queue ownership, layouts and semaphore interoperability with Qt. No Vulkan import/export was exercised.
- **F3: Windows.** Dawn exposes D3D11 texture and DXGI-handle sharing features. These justify further investigation, not a D3D11VA compatibility claim. No Windows hardware, WARP or D3D11/D3D12 bridge was exercised.

## Licence and separate distribution

The [Dawn licence at the selected revision](https://github.com/google/dawn/blob/dc5320f3ebebe9d42023c24d0ee76828412b66b4/LICENSE) is BSD-style for the general source, with separately identified Apache-2.0 file sets. Its notice and non-endorsement conditions do not themselves require replacing the existing LGPL packaging model. This is a preliminary dependency assessment, not a complete binary licence audit.

The native [packaging plan](../../../../native/timeline/docs/PLAN.md) keeps FFmpeg LGPL and dynamically linked. The [macOS packager](../../../../native/timeline/scripts/package-macos.sh) includes LGPL texts, corresponding-source information and notices for bundled dependencies. Preserve those obligations and Qt replacement rights if Dawn is added. A BSD Dawn static library is distinct from statically linking Qt or FFmpeg.

The inspected SDK archive contained no files matching `*LICENSE*`, `*license*` or `*NOTICE*`. Shipping it would require assembling Dawn and transitive notices from the exact build inputs. The archive is not a ready compliance bundle. Its final linked dependency closure was not audited.

For the user's separate native-download plan, keep Dawn with the separately delivered native artifact if selected. Do not add it to the web/default npm install or make an ordinary project load download it. Pin platform artifacts, hashes and notices in that delivery process. Separate downloading does not remove redistribution obligations. No downloader, installer or packaged artifact was changed or validated here.

## Qt RHI FP16 alternative, without starting N1

The existing renderer already allocates `m_blurTexture` as RGBA16F at PreviewCompositor.cpp:751 and uses additive One/One color and alpha blending at :798–802. Nothing in the inspected capture path reads that texture back. This establishes an existing float accumulation pass, not end-to-end FP16 processing or a measured frame-budget cost.

Keeping Qt RHI would still require the following planned work:

- **A1: Working resources and contracts.** Upgrade `m_canvas` (:670), group surfaces (:704), `m_previousCanvas` (:782) and [ScratchPool.h](../../../../native/timeline/src/motion/capacity/ScratchPool.h):49 from RGBA8. Include format in pool identity and render-pass compatibility. [SurfacePool.h](../../../../native/timeline/src/preview/SurfacePool.h) currently accounts for four bytes per pixel. RGBA16F storage is eight bytes per pixel, a calculated doubling for each changed resource, not measured total GPU memory or bandwidth. Update [LayerSource.h](../../../../native/timeline/src/preview/LayerSource.h), [LayerRegistry.h](../../../../native/timeline/src/preview/layers/LayerRegistry.h) and [ComposeRegistry.h](../../../../native/timeline/src/preview/compose/ComposeRegistry.h), whose frame contracts currently name byte RGBA.
- **A2: Shader boundaries.** Remove storage-driven rounding and byte alpha bridges in the qualified float path. [composite.frag](../../../../native/timeline/shaders/composite.frag):38 explicitly rounds to 255 levels, and [ClipEffects.cpp](../../../../native/timeline/src/preview/effects/ClipEffects.cpp):279–291 records straight/premultiplied bridge passes. Retain intentional artistic operations and existing float resources. Use the existing qsb pipeline. Changing texture allocation alone is insufficient.
- **A3: Capture and delivery.** Current capture reads `m_canvas`, before item presentation, and interprets bytes as `QImage::Format_RGBA8888_Premultiplied` (:1610–1620). A float canvas needs typed working capture or an explicit final GPU delivery conversion, with row layout, orientation and completion preserved. Unpremultiply in float before final quantization. OffscreenFrames' straight byte conversion and ExportEngine's byte encoder seam must agree. The outer Qt presentation target can remain RGBA8. Preserve opaque capture background and full-resolution capture behavior.
- **A4: Qualification.** Recheck float filtering/blending, pools, temporal state, resize, backward seeking, device loss, preview/export parity and native delivery on each supported backend. Measure FP16 playback, seeking, export and peak allocations on actual Windows hardware and a constrained target. Existing RGBA16F allocation does not answer those performance questions.

No items above were implemented.

## What was and was not exercised

Measured only SDK download/extraction time, downloaded and unpacked size, npm package size and host availability. Inspected native code and pinned upstream APIs. No source build, C++ link smoke test, native test or binary run was performed. No native files were changed, so no native test target was selected. No TypeScript tests, typecheck, lint, affected tests, harness gate or full ctest suite ran.

Unmeasured: Dawn initialization, WGSL numerical output, decoded-frame processing, Qt presentation, actual export, copy bandwidth, synchronization latency, frame lifetime under GPU load, backward-seek correctness/cost, device loss, CPU/GPU playback time, export throughput, FP16 overhead and peak runtime memory. Neither the Qt baseline nor Dawn received a new performance measurement. No claim of relative speed or numerical parity follows from this report.

The N0 recommendation follows the plan's default because a worthwhile replacement has not been demonstrated. It does not claim that Dawn failed a performance test. Reopen a separately budgeted proof only if the owner wants to pursue shader reuse despite the unqualified platform bridge. The later N1 work retained Qt RHI, as recorded in the [working-resource result](n1-native-working-resources.md). That implementation does not complete the missing Dawn evaluation.
