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
