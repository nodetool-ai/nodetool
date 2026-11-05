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

A42 remains unchecked. Admission and partial-file cleanup are implemented and
pass on lavapipe and RTX 3060. Repeated cancellation still shows growing RSS,
and the CLI tool-call lifetime needs an owner decision. These are local gaps,
not a request for deployed hardware. FP16 remains off by default, with no new
public node property. BT.709 and the six colour-boundary `it.fails` cases are
unchanged.

## Admission and cleanup

The existing gate in `runtime/src/host-binaries.ts` has an independent
`timeline` class. `NODETOOL_TIMELINE_RENDER_CONCURRENCY` selects its cap.
Unset, invalid or non-positive values mean unlimited. Positive values are
rounded down. No default cap was chosen. A50 owns that decision. The variable
uses runtime bracket access and is documented alongside
`NODETOOL_BLENDER_CONCURRENCY` in the
[host-binary configuration table](../../../blender-headless-integration-design.md).

Both `renderTimelineComposited` and `renderTimelineInBrowser` acquire the gate
before preparing resources and release it in `finally`. This includes direct
Node/Dawn callers, browser WebGPU/Canvas 2D calls, still callbacks and PNG
sequence export. Browser fallback releases its slot before acquiring a Node
slot. Rough-cut rendering and later audio muxing are outside this gate.
Blender and ManimGX continue using their separate `render` class.

Queued aborts reject without acquiring a slot. An admitted failure or abort
releases its slot. The Node encoder wrapper now waits for an in-flight write
before closing native objects and awaits encoder cleanup. The compositor then
removes the partial output before rejecting, preserving the original error
if cleanup also fails. Browser PNG encoder cleanup is awaited too. This does
not interrupt a stalled native call. Cancellation waits for that call to drain.
The cached GPU device remains available to long-lived servers.

## Configured-maximum measurements

Each row is a fresh Vitest process running one case from
`timeline-admission.gpu.test.ts`. Three jobs each render two 1920×1080 frames
at 10 fps through the real compositor and MP4 encoder. A fourth queued job is
aborted. Instrumentation records real encoder opens/closes and asserts the
peak equals the selected cap, all three jobs complete with nonempty files,
the queued job creates no file, and no encoder remains active.

Elapsed time includes cold device acquisition, rendering and queued completion,
excluding imports. RSS is process-wide Linux maxRSS, including imports, driver
and encoder. These shared-machine observations are not performance assertions.

| Adapter | Format | Cap | Elapsed ms | Peak RSS MiB |
|---|---|---:|---:|---:|
| Mesa lavapipe / llvmpipe | RGBA8 | 1 | 1271.66 | 885.13 |
| Mesa lavapipe / llvmpipe | RGBA8 | 2 | 733.81 | 892.32 |
| Mesa lavapipe / llvmpipe | FP16 | 1 | 1351.59 | 885.75 |
| Mesa lavapipe / llvmpipe | FP16 | 2 | 1155.97 | 981.02 |
| NVIDIA RTX 3060 | RGBA8 | 1 | 1158.05 | 854.61 |
| NVIDIA RTX 3060 | RGBA8 | 2 | 739.38 | 843.84 |
| NVIDIA RTX 3060 | FP16 | 1 | 896.87 | 839.57 |
| NVIDIA RTX 3060 | FP16 | 2 | 908.86 | 842.07 |

Actual adapter strings are `mesa / llvmpipe-llvm-23-1-3-256-bits-`,
Mesa 26.2.5-arch1.1 (LLVM 23.1.3), and
`nvidia / nvidia-geforce-rtx-3060`, NVIDIA 610.57.04.

## Cancellation during native encoding

The fifth admission test aborts inside the real `Encoder.encodeAll` call,
after submission and before awaiting its promise. It performs 30 renders in
one process, alternating RGBA8 and FP16 at 1920×1080. Neither GPU nor codec is
replaced. Wrappers observe and call the real implementations. Every attempt
rejects with AbortError after one native encode, leaves no output file and
closes its encoder. A successful render afterward reuses the same device.

The failure case writes one real frame, confirms the output file exists, then
passes an invalid-sized second buffer to the real encoder. Its original
frame-size error survives cleanup, the partial file is absent, and the next
render succeeds under cap 1.

The measured series waits for the GPU queue, clears spy call records, and runs
GC between attempts to reduce observer retention. Production does not force
GC. RSS still grows. Measurements are not assertions or evidence of full release.

| Adapter | RSS after abort 1 MiB | After 10 | After 20 | After 30 | Process peak MiB |
|---|---:|---:|---:|---:|---:|
| Mesa lavapipe / llvmpipe | 707.85 | 910.39 | 995.21 | 1074.98 | 1116.98 |
| NVIDIA RTX 3060 | 734.89 | 883.90 | 954.06 | 1034.14 | 1104.51 |

The retained `a42-encoder-memory.mjs` control opens, writes and aborts 30 real
1080p encoders without importing a GPU. With GC, RSS rises from 130.83 MiB to
241.43 MiB at attempt 10, then stays between 239.52 and 246.05 MiB through
attempt 30, ending at 244.00 MiB. This narrows the investigation but does not
identify a leak or distinguish driver caches, allocator retention, rasterizer
allocations and unreleased GPU resources. Native encoder close and texture
destroy calls are not proof that all physical memory is returned. Full resource
release and a bounded steady-state render RSS remain unqualified.

The test deadlines allow three cold software renders (120 seconds) or 30
1080p native submissions (180 seconds) on shared CI. They bound hangs, not
render-latency targets. The missing-driver child retains its 30-second startup
and native-hang deadline plus five seconds for cleanup.

## Selection, missing driver and numerical output

`timeline-browser-path.test.ts` verifies Chromium-first selection, fallback only
on BrowserRenderUnavailableError, explicit Node selection and actual renderer
reporting. Ordinary browser errors propagate. Composite and format tests pin
the unchanged rough-cut warning and refuse opaque fallback for alpha WebM.

The missing-driver child sets both Vulkan variables to a nonexistent ICD.
It reports CompositorUnavailableError with Node/Dawn, mesa-vulkan-drivers and
VK_DRIVER_FILES guidance, then exits naturally with code 0. The measured
rejection is 23.68 ms excluding imports.

The real browser suite passes on the lavapipe-configured host. Chrome reports
Canvas 2D because its red WebGPU canvas reads back zero. It uses AVC without
transcode. Browser/Node mean frame differences range from 0.0147 to 0.0163.
This is Canvas 2D qualification, not browser FP16 or browser WebGPU qualification.

All three precision boundary cases pass on both adapters. Default and explicit
RGBA8 match. A script enumerated exactly three default hashes per adapter in
the retained pre-change `a42-before-{lvp,rtx}.log` files and the current logs,
and required exact equality. The hashes are:

| Fixture | Adapter | SHA-256 |
|---|---|---|
| Opaque lossless and MP4 input | Both | `7fd9555f9ac0144f5425f31d733b3d21b15bbf971cb741a23a6a7e2346a185ac` |
| Straight alpha | Lavapipe | `04d9da27c205895117ecadda7740380a00975206359cf18ccf434c5b898aa2e8` |
| Straight alpha | RTX 3060 | `b87a06c25bf039a882fba3ee5c7cccfbdff0b87e3e7ca27aa6419efa40c6c2d5` |

These are final RGBA frame hashes, not container hashes. Lossless and direct
encode reference errors remain zero. MP4 versus input max/mean errors remain
10/0.163086 for RGBA8 and 9/0.160156 for FP16. This establishes fixture identity,
not identity for arbitrary scenes or across adapters.

## One-shot command audit

Source inspection found these explicit exits after awaited command work:

| Entry point | Exit source |
|---|---|
| `run`, authored workflow execution | `packages/cli-workflow/src/index.ts:385` |
| Full `workflows run` | `packages/cli-workflow/src/index.ts:708` |
| `node run` | `packages/cli-workflow/src/commands/node.ts:142` |
| `debug` without watch | `packages/cli-workflow/src/commands/debug.ts:168` |
| `timeline render`, including stills and sheet | `packages/cli-timeline/src/commands/timeline-render.ts:364` |
| `timeline score --sheet` | `packages/cli-timeline/src/commands/timeline-score.ts:108` |
| `app debug` | `packages/cli-apps/src/commands/app.ts:165` |
| `js-script run`, `test`, `debug` | `packages/cli-script/src/commands/js-script.ts:222`, `:253`, `:303` |
| `agent run` | `packages/cli-chat/src/commands/agent.ts:658` |
| Piped and interactive chat completion | `packages/cli-chat/src/chat-entry.ts:273`, `:318` |

Lean `run` delegates authored sources to cli-workflow. Its direct JSON path uses
the core execution host, which does not admit video pack nodes. Lean
`workflows run` submits an HTTP request rather than rendering in its process.
Watch/server/MCP sessions intentionally remain alive.

A real `timeline render` command rendered two 64×64 frames using Node/Dawn on
lavapipe, reported complete, wrote MP4 and exited 0 within the 60-second
supervisor deadline. Reported render time was 159 ms. No provider key was used.
The command was `node --import tsx packages/cli-timeline/src/nodetool.ts timeline
render <fixture.json> --out <output.mp4> --json`. No CLI exit code was changed.

F1. `tools call` is an exception to the explicit-exit pattern.
`packages/cli-chat/src/commands/tools.ts:174` awaits a tool and sets exitCode
only on failure. `packages/cli-chat/src/index.ts:33` closes Python providers
but does not exit. Its toolbelt includes render_timeline, whose work can run
in the background (`packages/agents/src/tools/mcp-tools.ts:268`). Source
inspection cannot establish successful one-shot termination. The real
`timeline render` result does not qualify `tools call`. No real tool-call
render/exit reproduction has been completed.

D1. The owner must decide the CLI tool-call lifetime for background render jobs
before an unconditional exit is added. Exiting when the tool returns can kill
its active job. Leaving it alive can retain Dawn after the job completes.
No cache lifetime was changed, and no blanket exit or scheduler was added.

## Verification and remaining scope

`host-binaries.test.ts` passes 51 cases, including default-unlimited timeline
admission, class independence, queued abort and failure recovery. The new GPU
file passes all five cases on each adapter. The 30-abort case is rerun after
adding the partial-file encoder-failure check. Existing lavapipe checks pass:
server qualification, cancellation, raw frames, browser render and selection,
render frames, render formats, composite selection and precision encoding.
The raw-frame/browser rerun passes 23 tests after correcting the async abort
cleanup rejection. The initial browser bundle dependency failure was resolved
before that rerun. Runtime and video-nodes package typechecks pass.

All Vitest calls use explicit file paths and `--maxWorkers=1` from the package
directory. TMPDIR is `/home/mg/Projects/nodetool-film/tmp`. DISPLAY is unset.
Lavapipe sets both VK_ICD_FILENAMES and VK_DRIVER_FILES to
`/usr/share/vulkan/icd.d/lvp_icd.json`, with LP_NUM_THREADS=2. RTX runs source
`/home/mg/.local/nvidia-610/env.sh` after `bin/ntenv`. No ffmpeg or ffprobe
binary was spawned by these tests. Large generated outputs are removed.

Logs in that TMPDIR include `a42-{lvp,rtx}-rgba*-{1,2}.log`,
`a42-cleanup-final-{lvp,rtx}.log`, `a42-encoder-control.log`,
`a42-regressions-lvp.log`, `a42-regressions-recheck.log`,
`a42-aborts-precision-rtx.log`, `a42-runtime-final.log` and `a42-command.log`.
The admission test's `-t` selector runs each cap/format in its own process.
`NODE_OPTIONS=--expose-gc` enables the optional GC observation in the abort case.
Run the encoder-only control with `node --expose-gc`.

Not run: test:affected, root typecheck, root lint, harness gate, /verify,
full suites or CI. Other existing tests were not run. The deployed adapter
is absent. A49/A50 own that qualification, which alone would not block A42.
The local RSS investigation and tool-call lifecycle are still open. No push,
rebase or PR was made.
