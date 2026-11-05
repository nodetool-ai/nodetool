# A40: Server encoder boundary

A40 is met for the opt-in Node compositor boundary on lavapipe and RTX 3060.
This does not close S3's server qualification or enable FP16 for RenderTimeline.

## Change

Implementation and boundary test commit: `08a59f46a1`.

`renderTimelineComposited` previously constructed `HeadlessFrameCompositor`
without precision options. Its internal options now accept `workingFormat`
and forward it to that existing compositor. Omitted settings still select
RGBA8. The public node, browser selection, output formats and runtime encoder
are unchanged. No new codec or routing infrastructure was added.

The S2 compositor retains FP16 working textures and resolves to straight-alpha,
full-range RGBA8 with its existing Bayer dither. `compositeRender.ts` passes that
buffer to `openFrameEncoder`. The wrapper passes it unchanged to
`openVideoFrameEncoder`, which wraps it as `AV_PIX_FMT_RGBA`. Its filter combines
the existing requested scaler with the encoder pixel layout. H.264 therefore
still converts to limited-range BT.709 yuv420p once at that filter boundary.
There is no additional RGBA quantizer, range scaling or alpha multiplication in
the bridge. Codec colour-layout conversion remains necessary and is not a
second working-frame resolve.

BT.709 tags and transfer behavior were not changed. This test does not resolve
Q22 or certify those tags against sRGB transfer. The six `it.fails` cases in
`render.colorBoundary.gpu.test.ts` remain untouched.

## Test and measurements

`packages/video-nodes/tests/timeline-precision-encode.gpu.test.ts` renders two
64×16 frames at 10 fps. Four bars cover black, white, coloured half coverage and
zero coverage, with an inverse exposure pair to expose byte intermediates.
It runs omitted settings, explicit RGBA8 and explicit FP16 for each delivery.

The test observes the real GPU output texture format and the actual buffer
passed to the real runtime encoder. Every encoder input is the same object as
the compositor's final RGBA8 result, with 4096 bytes per frame. Repeated frames
are byte-identical, including FP16 dither. No GPU or codec is mocked out or
skipped. The wrappers only record calls and invoke the real implementations.

FFV1/BGRA is a lossless diagnostic using the existing encoder, not a new product
output. It checks opaque and straight-alpha bytes after real encode/decode.
The MP4 case uses unchanged production arguments. Each decoded result is also
compared against a direct runtime encode of the same compositor bytes. This
separates the bridge from codec/layout errors. The tests use runtime media
helpers and do not spawn ffmpeg or ffprobe.

Errors below are absolute RGBA code differences across the first frame.
Both frames are checked for exact equality to their reference.

| Measurement | Lavapipe llvmpipe | NVIDIA RTX 3060 |
|---|---:|---:|
| Encoder input vs final compositor bytes, max / mean | 0 / 0 | 0 / 0 |
| FFV1 opaque and alpha decode vs input, max / mean | 0 / 0 | 0 / 0 |
| MP4 decode vs direct runtime encode, max / mean | 0 / 0 | 0 / 0 |
| Default MP4 decode vs RGBA input, max / mean | 10 / 0.163086 | 10 / 0.163086 |
| FP16 MP4 decode vs RGBA input, max / mean | 9 / 0.160156 | 9 / 0.160156 |
| RGBA8 vs FP16 opaque delivery, max / mean | 2 / 0.115723 | 2 / 0.115723 |
| RGBA8 vs FP16 alpha delivery, max / mean | 3 / 0.175293 | 2 / 0.133789 |
| FP16 half-covered pixel, straight RGBA | 88, 131, 172, 128 | 88, 131, 172, 127 |
| FP16 half-covered pixel over black, RGBA | 44, 65, 86, 255 | 44, 65, 86, 255 |

Half coverage is 127.5 codes. Either nearest byte is accepted. Transparent
pixels are exactly zero with alpha export, and opaque black without it. The
white bar is within one code of full range after FP16 storage and dither.
These checks reject premultiplying straight output again or compressing RGBA
to video range before the encoder. MP4 stream inspection reports H.264,
yuv420p, limited range and BT.709 matrix, primaries and transfer on both adapters.

## Default byte identity and negative control

Omitted precision and explicit RGBA8 match exactly in all three cases on each
adapter. A second run temporarily restored the pre-change `compositeRender.ts`
from HEAD. Its default hashes match the changed implementation. That run fails
all three FP16 cases specifically because it observes rgba8unorm instead of
rgba16float. The source was restored afterward. There are no new expected-fail
tests and no missing-binary errors.

SHA-256 of each 4096-byte default frame, identical before and after:

| Fixture | Adapter | SHA-256 |
|---|---|---|
| Opaque, both lossless and MP4 input | Both | `7fd9555f9ac0144f5425f31d733b3d21b15bbf971cb741a23a6a7e2346a185ac` |
| Straight alpha | Lavapipe | `04d9da27c205895117ecadda7740380a00975206359cf18ccf434c5b898aa2e8` |
| Straight alpha | RTX 3060 | `b87a06c25bf039a882fba3ee5c7cccfbdff0b87e3e7ca27aa6419efa40c6c2d5` |

Identity is established for these fixtures, not every possible scene. Default
alpha output already differs across adapters. This work does not change or
claim to resolve the hardware differences recorded in
[B218](../../../../native/timeline/docs/gaps-backlog.md).

## Verification and limits

Lavapipe reports llvmpipe, Mesa 26.2.5-arch1.1, LLVM 23.1.3. NVIDIA reports
GeForce RTX 3060, driver 610.57.04. Each adapter passes the three new cases and
nine existing cases across `timeline-render-frames.gpu.test.ts`,
`timeline-alpha-render.test.ts` and `timeline-motion-blur-render.test.ts`.
The new file was rerun after correcting its half-code alpha expectation.
The video-nodes package typecheck exits zero. A temporary package-scoped
configuration including the new test also typechecks successfully.

Commands ran from `packages/video-nodes` with `npx vitest run <files>
--maxWorkers=1`. They sourced `/home/mg/Projects/nodetool-film/bin/ntenv`, unset
DISPLAY, and set TMPDIR under `/home/mg/Projects/nodetool-film/tmp`. Lavapipe
set both VK_ICD_FILENAMES and VK_DRIVER_FILES to
`/usr/share/vulkan/icd.d/lvp_icd.json`, with LP_NUM_THREADS=2. NVIDIA sourced
`/home/mg/.local/nvidia-610/env.sh`. Typecheck used
`node scripts/run-tsc.mjs -p packages/video-nodes/tsconfig.json --noEmit`
from the root.

Initial runs found stale GPU/timeline build output and missing presets linkage
plus stale storyboard declarations. Only those dependency outputs were rebuilt,
and the missing local workspace link was restored. No dependency manifests
changed. Logs are under `/home/mg/Projects/nodetool-film/tmp/a40-*`, including
`a40-{lvp,nvidia}-final.log`, `a40-baseline-negative.log`,
`a40-nvidia-baseline-negative.log` and `a40-typecheck.log`.

Not run: test:affected, root typecheck, root lint, harness gate, /verify or any
full suite. Other existing tests were not run. This does not qualify browser
WebCodecs, node/browser selection, agent export, ProRes/VP9 delivery, motion-blur
FP16 encoding, HDR/10-bit inputs, full-resolution budgets, cancellation under
load or deployed hardware. A42, A41.2, A43.2, A44, A49 and A50 remain open.

# A42: Server qualification checkpoint

A42 remains unchecked. Adapter diagnostics and the missing-driver exit test
are implemented. Qualification stopped at the concurrency-control decision
below, as requested. This is not approval to enable FP16.

Diagnostic change: `3bd21c8141`. The public node has no new property, and the
internal working format still defaults to RGBA8. BT.709 behavior and the six
colour-boundary expected failures were not changed.

## Selection and diagnostics

`timeline-browser-path.test.ts` exercises RenderTimeline with mocked renderers.
Normal selection calls Chromium first. Its result logs WebGPU and the reported
adapter, or Canvas 2D, plus encoding and transcode information. Only
`BrowserRenderUnavailableError` selects Node as a fallback. An ordinary browser
render failure propagates. `NODETOOL_TIMELINE_RENDERER=node` directly selects
Node. Both Node cases now log Node/Dawn and the actual device's adapter info.
The existing `render_mode` metadata stays `browser`, `composited` or `rough_cut`.
These tests qualify selection and reporting, not actual browser rendering.

`timeline-composite.test.ts` now pins the full existing rough-cut warning and
its `rough_cut`/MP4/opaque metadata. `timeline-render-formats.test.ts` verifies
that an alpha WebM request fails instead of falling back to opaque MP4.
Production fallback behavior and warnings are unchanged.

## Missing driver and process exit

The new `timeline-server-qualification.test.ts` starts the real compositor in
a child with both `VK_DRIVER_FILES` and `VK_ICD_FILENAMES` set to
`/nonexistent/a42-icd.json`. DISPLAY is empty. No adapter is selected.
The child reports `CompositorUnavailableError`, names Node/Dawn, and includes
`mesa-vulkan-drivers` and `VK_DRIVER_FILES` guidance. The measured rejection
took 12.50 ms, excluding imports. A preliminary standalone run took 38.11 ms.
The tested child exits naturally with code 0 after handling the expected error.
It does not call `process.exit`. A kill, crash, wrong error or missing guidance
fails the test. There is no expected-fail test.

The 30-second child deadline bounds native hangs and allows module startup on
busy CI. It is not fitted to the measured rejection time or used as a renderer
latency target. The outer test allows five more seconds for child cleanup.

This differs from successful rendering: all four fresh-process render probes
printed results but remained alive until an external `timeout` terminated them
with exit status 124. Lavapipe RGBA8 used 30 seconds, the other probes 15 seconds.
Those observation windows are not performance assertions. The retained Dawn
instance and its runner are documented in `packages/gpu/src/node.ts`. The S5
results on `film/color-s5` describe the same lifetime issue. No device cache or
process-lifetime policy was changed here.

## Fresh-process 1080p measurements

`tests/_fixtures/server-qualification.mjs measure <format>` renders two 1920×1080
frames at 10 fps, with one opaque solid shape, through the real MP4 encoder.
It then repeats the render and cancels a 100-frame render after the first
encoded frame's progress callback. Each table row is a separate process.
Cold time includes device acquisition and encoding but excludes module imports.
Warm time includes a fresh compositor and encoder using the cached device.
These single observations on a shared machine are not comparative benchmarks.

Lavapipe identifies as `mesa / llvmpipe-llvm-23-1-3-256-bits-`, Mesa
26.2.5-arch1.1, LLVM 23.1.3. Hardware identifies as
`nvidia / nvidia-geforce-rtx-3060`, NVIDIA 610.57.04.

| Adapter | Working format | First render ms | Warm render ms | Abort to rejection ms | Process peak RSS MiB |
|---|---|---:|---:|---:|---:|
| Lavapipe llvmpipe | RGBA8 | 458.71 | 516.32 | 3.44 | 1056.84 |
| Lavapipe llvmpipe | FP16 | 1307.88 | 466.72 | 2.50 | 1049.06 |
| RTX 3060 | RGBA8 | 1964.21 | 112.89 | 3.06 | 1153.00 |
| RTX 3060 | FP16 | 743.23 | 429.63 | 6.30 | 1034.29 |

RSS is Linux `process.resourceUsage().maxRSS`, covering source imports, driver,
encoder, both full renders, cancellation and a one-second cleanup observation.
It is not GPU VRAM or a per-render allocation bound. FP16 appearing smaller in
some runs does not establish a memory saving. No memory assertion was added.

Every row returns the same cached device object before and after the warm and
cancelled renders. No output file descriptors remain open under the fixture's
directory one second after cancellation. However, a zero-byte `cancel.mp4`
remains both at rejection and one second later. The probe removes its entire
temporary directory afterward. This cleanup does not qualify production cleanup.
RenderTimeline itself has a temporary-directory cleanup, but direct compositor
callers do not receive a no-partial-output guarantee.

Existing `timeline-cancellation.test.ts` passes its mocked blocked-GPU,
blocked-write and active-decode cases, checking compositor disposal and encoder
abort calls. The real probe measures cancellation between frames, not while a
native encode or GPU submission is blocked. File-descriptor closure does not
prove that every native encoder or GPU allocation has been released. Those
stronger cancellation requirements remain unqualified.

## Numerical output and byte identity

The existing A40 `timeline-precision-encode.gpu.test.ts` passes all three cases
before and after the diagnostic change on each adapter. It observes actual
RGBA8/FP16 textures and verifies that final compositor bytes reach the runtime
encoder unchanged. Lossless decode and MP4 decode against a direct encode have
zero max/mean error. MP4 versus input has max/mean code error 10/0.163086 for
RGBA8 and 9/0.160156 for FP16 on both adapters. These repeat the A40 table above.

A script parsed all three default fixture hashes from each before/after log,
asserted that each list contained three entries, and compared the lists exactly.
Default and explicit RGBA8 also match inside the test. SHA-256 values before
and after are:

| Default fixture | Adapter | SHA-256 |
|---|---|---|
| Opaque lossless and MP4 encoder input | Both | `7fd9555f9ac0144f5425f31d733b3d21b15bbf971cb741a23a6a7e2346a185ac` |
| Straight alpha | Lavapipe | `04d9da27c205895117ecadda7740380a00975206359cf18ccf434c5b898aa2e8` |
| Straight alpha | RTX 3060 | `b87a06c25bf039a882fba3ee5c7cccfbdff0b87e3e7ca27aa6419efa40c6c2d5` |

These are final RGBA frame hashes, not whole-container hashes. They establish
identity for the fixtures, not arbitrary scenes or cross-adapter identity.
The pre-existing alpha difference and B218 are unchanged.

## Decision and remaining work

F1. No timeline-render admission limit was found in the inspected Node and
browser render paths, `gpu/node.ts`, runtime media implementation, or execution
actor/runner. The renderer serializes frames within a call, but that does not
limit concurrent calls. `runtime/src/host-binaries.ts` has a private render-class
gate, default one, controlled by `NODETOOL_BLENDER_CONCURRENCY`. It is acquired
by host-binary spawning, including Blender and ManimGX. The timeline renderer
runs in process and does not call it. The runner's same-instance run guard does
not establish a host-wide render limit. This is a scoped source audit, not a
claim about every deployment entry point.

D1. The owner must identify the intended existing admission control and its
scope, or authorize adapting the host-binary gate for in-process timeline jobs.
That adaptation would make timeline jobs contend with other render-class jobs
and requires an explicit policy choice. No new scheduler, routing service,
arbitrary concurrency cap or concurrency stress run was added. Therefore this
checkpoint cannot report behavior at a configured maximum timeline concurrency.

F2. Cancellation leaves a zero-byte file for direct compositor callers and
full native-resource release remains unverified. Successful rendering keeps a
one-shot process alive. These are recorded gaps, not waived requirements.

F3. CI uses Mesa lavapipe, but CI was not run. The deployed adapter is absent
from this machine. These local Mesa and RTX results do not qualify deployed
memory, contention, driver behavior or throughput. Browser delivery, complex
1080p media and long-duration rendering were not measured.

## Verification and reproduction

Lavapipe selection set both Vulkan variables to
`/usr/share/vulkan/icd.d/lvp_icd.json`, with DISPLAY unset and LP_NUM_THREADS=2.
Hardware runs sourced `/home/mg/.local/nvidia-610/env.sh` after
`/home/mg/Projects/nodetool-film/bin/ntenv`, with DISPLAY unset. TMPDIR was
`/home/mg/Projects/nodetool-film/tmp`. No ffmpeg or ffprobe binary was spawned.

From `packages/video-nodes`, `npx vitest run <files> --maxWorkers=1` passed
39 tests in six files on lavapipe: `timeline-server-qualification`,
`timeline-browser-path`, `timeline-composite`, `timeline-render-formats`,
`timeline-cancellation`, and `timeline-precision-encode.gpu`. The composite
file was rerun successfully after pinning the exact rough-cut warning.
The precision file passed its three cases before and after on RTX 3060 too.
Only the video-nodes package was typechecked, with
`node scripts/run-tsc.mjs -p packages/video-nodes/tsconfig.json --noEmit`.

Run the measurement fixture from the repository root with
`timeout 30s node --import tsx packages/video-nodes/tests/_fixtures/server-qualification.mjs measure rgba8unorm`,
or replace the last argument with `rgba16float`. The external timeout cleans
up the documented retained-Dawn lifetime. It must not be interpreted as a
successful natural exit. The missing-driver test separately requires natural
exit and has no output-path leak.

Logs are `/home/mg/Projects/nodetool-film/tmp/a42-{before,after}-{lvp,rtx}.log`,
`a42-measure-{lvp,rtx}-{8,16}.log`, `a42-rough-pin.log`, and `a42-typecheck.log`.
No full suite, test:affected, root typecheck, root lint, harness gate, /verify,
CI, deployment check or other test files ran. No push, rebase or PR was made.
