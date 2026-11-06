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
`render.colorBoundary.gpu.test.ts` were untouched by this work. The later
[A101 owner decision](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
chooses pass-through with the inaccurate tag (O1).

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

A42 is met on lavapipe and RTX 3060. Admission and partial-file cleanup pass on
both. The previously reported linear RSS growth comes from the measurement test
retaining aborted renders through Vitest async assertions. The deployed adapter
is not on this machine, and A49 and A50 own that qualification.

`nodetool tools call render_timeline` is outside A42's clauses and is recorded
as B223. It fails before rendering without the model-interface initializer, and
with the initializer it renders and then doesn't exit. FP16 remains off by default, with no new
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

The original measured series waited for the GPU queue, cleared spy call
records and ran GC between attempts. These historical numbers still included
retention by Vitest async assertions. They do not measure a production leak.
Production does not force GC.

| Adapter | RSS after abort 1 MiB | After 10 | After 20 | After 30 | Process peak MiB |
|---|---:|---:|---:|---:|---:|
| Mesa lavapipe / llvmpipe | 707.85 | 910.39 | 995.21 | 1074.98 | 1116.98 |
| NVIDIA RTX 3060 | 734.89 | 883.90 | 954.06 | 1034.14 | 1104.51 |

The retained `a42-encoder-memory.mjs` control opens, writes and aborts 30 real
1080p encoders without importing a GPU. With GC, RSS rises from 130.83 MiB to
241.43 MiB at attempt 10, then stays between 239.52 and 246.05 MiB through
attempt 30, ending at 244.00 MiB. The follow-up below distinguishes test retention from renderer lifetime.

### Memory investigation follow-up

Extending the original test to 200 aborts grew lavapipe RSS from 694.70 MiB
at iteration 1 to 1040.82 at 30 and 2434.21 at 200. Replacing only the repeated
`expect(renderPromise).rejects` assertion with `node:assert`'s `rejects`
stopped that linear growth. The corrected 200-abort test ended at 868.80 MiB,
with a process peak of 1046.61 MiB. Its post-warmup RSS varied rather than
increasing by one frame per abort. The test runner's `recordAsyncExpect`
retains an `onFinished` callback for each async assertion until the test ends.
The A/B measurement identifies this assertion path as the source of the
reported growth. It does not identify the exact native allocation retained
by each callback.

The corrected RTX 200-abort test measured 735.55 MiB at iteration 1,
809.73 at 30, 811.17 at 100 and 814.23 at 200, with a 999.39 MiB peak.
Samples 100–200 were 811.14–823.63 MiB.

The fix is in `timeline-admission.gpu.test.ts`, not the production renderer.
It preserves the real native encode, AbortError assertion, partial-file checks
and device-reuse check. No device lifetime, compositor pool, forced production
GC or allocator workaround was added. There is no RSS regression threshold:
driver allocation, import overhead and memory pressure make an absolute bound
in this shared environment unsuitable for CI.

`packages/video-nodes/tests/a42-memory-probe.ts` retains the independent
reproduction. Run it from the video-nodes package with
`node --expose-gc --import tsx tests/a42-memory-probe.ts <mode> 200`.
Modes are `abort`, `success`, `frames` (full render without an encoder),
`compositor` (empty layers, no canvas or encoder work), `rasterizer` and `fonts`.
Every render is 1920×1080. GPU modes alternate RGBA8 and FP16. Successful
renders encode two frames, while aborts cancel during the first real native
encode. Each iteration drains the queue, runs GC and records RSS, heap,
external memory and arrayBuffers. Temporary outputs are removed in `finally`.
The font control uses the same shape-only document, which requests no Google
font faces. The rasterizer control includes bundled font registration.

All long probes used `systemd-run --user --scope -p MemoryMax=6G` and waited
when MemAvailable fell below 5 GiB. Memory pressure caused pauses and RSS
reductions, so these numbers are observed ranges, not exact allocator budgets.
The first concurrent RTX probes were stopped to release memory, then rerun
serially. No other process or output was removed.

| Adapter | Mode | RSS 1 MiB | RSS 30 | RSS 100 | RSS 200 |
|---|---|---:|---:|---:|---:|
| Lavapipe | Abort | 680.33 | 759.61 | 767.61 | 761.89 |
| RTX 3060 | Abort | 639.71 | 854.92 | 857.68 | 857.91 |
| Lavapipe | Success | 921.53 | 944.41 | 1509.60 | 1520.83 |
| RTX 3060 | Success | 652.03 | 1507.91 | 1781.69 | 1793.09 |
| Lavapipe | Compositor only | 593.59 | 600.02 | 600.44 | 601.28 |
| RTX 3060 | Compositor only | 599.83 | 607.89 | 609.36 | 609.29 |
| Lavapipe | Render without encoder | 678.17 | 646.69 | 646.27 | 647.68 |
| CPU | Rasterizer only | 477.45 | 468.34 | 468.52 | 468.20 |
| CPU | Font preparation | 474.38 | 474.38 | 285.39 | 285.39 |

At iteration 200, the standalone abort probes used 156.75 / 156.61 MiB of
JS heap (lavapipe / RTX), 51.82 MiB external and 26.39 MiB arrayBuffers each.
Successful renders used 156.91 / 156.76 MiB heap, 43.91 MiB external and
18.48 MiB arrayBuffers. These categories stayed stable through the warmed
samples. ArrayBuffers are included in external memory, not an additional
category to sum. The higher RSS of successful encoding is outside the live
JS heap/buffer accounting and reaches a plateau. These controls support native
allocator/driver retention rather than a per-compositor or cancellation leak.
They do not distinguish the allocator from driver caches or qualify arbitrary
scenes and unbounded runs.

Across samples 100–200, standalone abort RSS was 761.34–769.61 MiB on lavapipe
and 857.24–871.04 MiB on RTX. Successful lavapipe encodes were
1509.60–1575.77 MiB, ending at 1520.83. RTX success ended at 1793.09 MiB.
No production leak was established, so production code was left unchanged.


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

`tools call` remains an exception to the explicit-exit pattern.
`packages/cli-chat/src/commands/tools.ts` awaits the tool, settles the cost
ledger and removes signal handlers. The entry point closes Python providers
but does not explicitly exit. The agreed policy is to finish all work started
by the call, then exit with its outcome. An unconditional exit at tool return
would violate that policy.

A real `tools call preview_timeline_frame` with an inline 64×64 shape document
renders through Canvas 2D and exits 0. This does not exercise Dawn.
An unmodified `tools call render_timeline` fails before rendering because the
new execution context lacks `getTimelineSequence`. The CLI returns a failed
job envelope but exits 0. That host-initialization and exit-status problem is
also unresolved. No provider keys are needed for these fixtures.

To separate initialization from lifetime, a temporary Node preload invoked the
existing `installLocalModelInterfaces` helper used by other CLI hosts. With
that initializer, the real command rendered two 64×64 frames on lavapipe,
reported `status: completed`, `render_mode: composited` and a saved asset, but
remained alive until the 60-second supervisor killed it (exit 124). This is a
qualified reproduction with a preload, not a claim that the unmodified command
successfully renders. The command used `node --import tsx --import
<initializer.mjs> packages/cli-chat/src/nodetool.ts tools call render_timeline
--args @<arguments.json>`, with Node renderer selection and both Vulkan
variables set to the lavapipe ICD.

The same preloaded command with `wait:false` returned a running-job receipt,
then completed the render in that same process. A subsequent real `tools call
get_job` read `status: completed`, composited MP4 output and no job error.
The original process still needed the 60-second timeout (exit 124). Background
jobs therefore survive the tool return, but do not detach into a separate
worker process. Exiting on the initial receipt would be unsafe.

`start_background_job` and `render_timeline` both call the existing
`runWorkflow({background:true})`. Execution continues in this process after
the tool returns its receipt. `active-runs.ts` stores a job ID, user ID and
cancel callback, unregistering on execution completion. It has no completion
promise or enumeration by originating tool call. Job finalization runs in a
detached async function after execution. The separate background-generation
registry does expose `whenBackgroundGenerationsSettle(context)`, but workflow
jobs use a different execution context and are not in that registry.

Polling a returned job ID could handle the ordinary receipt path. It would
not cover work started before a tool throws or loses its receipt. There is no
existing command-scoped drain covering both paths and both registries. Under
the instruction to stop if a new tracking mechanism is needed, no CLI exit,
new tracking mechanism or server device-cache change was made. That lifecycle
work and the model-interface initialization failure are recorded as B223.

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
The tool-call lifecycle is recorded as B223.

### Follow-up verification

Both adapters pass the eight cases in the changed admission and precision
files. The corrected abort test also passes when extended to 200 iterations
in a temporary copy, on each adapter. The default frame hashes in this section
are unchanged: exactly three default records per adapter were enumerated and
compared with the recorded values. `A42_EXPECTED_OPAQUE_HASH` and
`A42_EXPECTED_ALPHA_HASH` make those per-adapter checks executable in the
precision test without imposing one adapter's alpha rounding on another.
A deliberately invalid opaque hash fails the selected opaque test (exit 1),
confirming that the new byte-identity check detects a mismatch.

The video-nodes package typecheck and a temporary package-scoped configuration
including all changed tests and the retained probe pass. No production source
changed. There is no new public property, and FP16 still defaults off. BT.709
and the six expected-failure colour-boundary tests were not edited.

Follow-up logs are `/home/mg/Projects/nodetool-film/tmp/a42-gap-*.log`.
The `abort`, `success`, `compositor`, `frames`, `rasterizer` and `fonts` logs
contain the standalone measurements. `vitest-lvp` is the original 200-abort
assertion control. `vitest-assert-lvp` and `vitest-assert-rtx-final` are the
corrected 200-abort tests. `final-lvp` and `final-rtx` contain the eight-case
runs and byte hashes. `cli-render-init`, `cli-background` and `cli-get-job`
contain the lifetime reproduction. Cached pack-catalog build assets were
regenerated from current manifests to resolve an initial version mismatch.
No catalog source or manifest was changed.

Not run: test:affected, root typecheck, root lint, harness gate, /verify,
full suites or CI. No ffmpeg or ffprobe binary was spawned. Large temporary
probe outputs and generated catalog staging files were removed. The deployed
adapter belongs to A49/A50.
