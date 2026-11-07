# A44 and A41.2: Originals and delivered pixels

A44 and A41.2 are met for the inspected final server-export paths and current
default delivery codecs. This records delivery measurements, not FP16 rollout
approval or precision/parity qualification. FP16 remains opt-in internally.
No public property, codec choice, BT.709 behavior or known-failure test changed.

## A44: Inspected paths

A1. `packages/video-nodes/src/nodes/timeline.ts`: `RenderTimelineNode.process`
passes clip asset references through `AssetFiles` to the Node compositor and
browser driver. Final rendering now rejects explicitly named managed preview
sidecars (`<32-hex-id>_proxy`, optionally `.mp4`, `.webm` or `.json`) and local
files with those names. Browser resolver misses are collected and rejected
before storing or returning the artifact. Its intermediate render may finish
before the rejection. The node's temporary directory is removed in `finally`.

A2. `packages/video-nodes/src/nodes/timeline/assetFiles.ts`: local originals
are used in place. Non-local originals are materialized through
`ProcessingContext.resolveAssetBytes`. Neither branch reads `proxy_url`.
`packages/runtime/src/context.ts`: `localPath`, `resolveAssetBytes` and
`findListedAsset` exclude preview sidecars from fallback listings. The
byte resolver's asset-row branch reads the stored original filename. Its
metadata HTTP fallback follows `get_url` or `uri`, not `proxy_url`.

A3. `packages/video-nodes/src/nodes/timeline/compositeRender.ts` resolves the
active layer's asset ID and reports `unavailable_media` when no file resolves.
`rawFrames.ts` reads that file through the in-process decoder. Neither source
selects a preview proxy. No changes were made to either file for these tasks.

A4. `packages/video-nodes/src/nodes/timeline/browserRender.ts` serves the
resolved original through its loopback asset endpoint. A missing original
returns HTTP 404. `browserSources.ts` may transcode the resolved original to
VP9 when Chromium lacks its decoder. That compatibility conversion is separate
from stored preview sidecars. This work does not qualify its color parity.
`web/src/components/timeline/render/headless/renderPage.ts` turns 404 into an
undefined URL. `TimelineRenderer.ts` omits the unavailable layer. Before the
fix, that omission reached the public node as a successful blank MP4. The
new public-node check rejects that result.

A5. `packages/websocket/src/lib/video-proxy.ts` creates local preview sidecars,
normally for sources with a long side of at least 1920 pixels, downscaled to
960 pixels. H.264 CRF 26, or VP9 CRF 34, uses yuv420p and all-intra frames.
`packages/asset-services/src/asset-paths.ts` names the sidecars and manifest.
`packages/websocket/src/lib/asset-response.ts` publishes `get_url` separately
from `proxy_url` and `proxy_status`. `web/src/utils/assetHelpers.ts` selects a
ready proxy only through `getAssetPreviewUrl`. The live
`web/src/components/timeline/preview/PreviewCompositor.tsx` uses that helper.

A6. `web/src/hooks/timeline/useTimelineExport.ts` uses `getAssetUrl`, which
selects the original `get_url`, rather than `getAssetPreviewUrl`. Browser
server export uses the loopback resolver described in A4. Neither final path
inherits the live preview's chosen proxy URL.

A7. The restricted `renderRoughCut` in `timeline.ts` still uses `AssetFiles`
directly, normalizes and concatenates sources, and does not select preview
metadata. Missing clips are skipped with
`RenderTimeline: skipping clip "<name>" — asset <id> not found`. With no
remaining video, image or audio clips it throws
`Timeline has no clips to render. Add at least one video, image or audio clip before rendering.`
It remains restricted to opaque MP4 after `CompositorUnavailableError`, with
its existing warning about unapplied transforms, effects, transitions,
captions and overlay tracks. Its behavior was not changed. This degraded
path cannot satisfy precision/parity gates.

## A44: Executed evidence

`packages/video-nodes/tests/timeline-export-originals.gpu.test.ts` uses real
`ProcessingContext`, local file storage and in-memory storage. A clip names
the original by its 12-character ID prefix. A black H.264 proxy and its manifest
are inserted before the white H.264 original, exercising listing order.
Both real public-node renderers are exercised, without mocking GPU, codecs or
Chromium. Metadata HTTP is deliberately offline in the fixture.

With both files present, exported pixels are white, not proxy black, for both
storage adapters and both renderers. With only the proxy present, the resolver
returns null and final export rejects. Explicitly naming the managed proxy URI
also rejects even while the original exists. An explicit source URI can name
arbitrary externally supplied content. These checks reject recognizable
managed sidecars, not establish provenance for all external bytes or renamed
files. The server's automatic proxy generation path was read, not run.

Messages to a person in the missing-original fixture:

- Node: `Timeline export is incomplete: clip (0–100ms): Media asset has no readable file`
- Browser: `Timeline export is incomplete: media asset "0123456789ab" has no readable original. Restore the original media and export again.`

The same messages apply when an explicit managed proxy is refused, with the
browser message naming its supplied URI. Missing originals never trigger a
rough-cut retry because the error is not `CompositorUnavailableError`.

The first browser reproduction failed because the promise resolved with a
successful blank MP4 instead of rejecting. A separate negative run with an
explicit proxy URI failed in both renderers because each promise resolved
instead of rejecting. These were ordinary tests, not `it.fails`. The retained
regressions pass after the checks were added.

Node runs used Mesa llvmpipe (Mesa 26.2.5-arch1.1, LLVM 23.1.3) and NVIDIA
GeForce RTX 3060 (610.57.04). Chromium ran `/usr/bin/chromium`. On lavapipe its
WebGPU canvas read back `rgba(0, 0, 0, 0)`, so the real browser export used
Canvas 2D. Browser GPU and codec behavior are not inferred from the separate
Node adapter name.

## A41.2: Measurement definition

`packages/video-nodes/tests/timeline-delivery-checks.gpu.test.ts` renders four
64×16 frames at 10 fps. Sixteen grayscale stripes cover the 0–255 source ramp.
Half have full coverage, half have 1/16 coverage. A 300 ms fade-in covers zero,
intermediate and full coverage across frames. An inverse exposure pair
(-5 then +5) exposes intermediate quantization. This is a diagnostic fixture,
not a claim that FP16 and RGBA8 ought to produce the same picture.

Each delivery runs omitted precision, explicit RGBA8 and explicit FP16. Omitted
and explicit RGBA8 compositor bytes match exactly. The inverse exposure chain
must produce a measurable byte/float difference. The real compositor output
is captured immediately before encoding. The test does not quantize it again.
Video output is decoded and compared exactly against a direct encode of those
same bytes with the same production arguments. PNG frames are extracted from
the production ZIP and decoded through the runtime helper.

All errors below are max / mean absolute RGBA byte-code differences, aggregated
across every pixel of every frame, including alpha. Codec/layout error is
actual decoded delivery versus encoder-input bytes. It includes conversion,
codec loss and decoder conversion, not just compressed-bitstream loss.
Working-precision error is FP16's final RGBA8 bytes versus RGBA8's bytes before
encoding. It is identical across delivery containers with the same alpha mode.
Video delivery versus direct encode is exactly 0 / 0 in every case.

Bounds are structural rather than calibrated to observations: equal encoder
inputs and settings require exact decoded equality. The low-alpha witness
allows one byte code for alpha rounding. Its zero-coverage frame must remain
zero, while opaque deliveries must have alpha 255. White source versus black
proxy allows one code at white for video conversion. Codec and working errors
are reported measurements, not tolerances fitted to make a parity gate pass.

## Stream formats and alpha

These stream fields match across RGBA8, FP16 and both Node adapters. For PNG,
the fields describe the first extracted frame, not the ZIP container.
ProRes uses the already offered codec, not a new high-bit-depth option.

| Delivery | Codec | Actual stream pixel format | Range | Matrix / primaries / transfer | Alpha |
|---|---|---|---|---|---|
| MP4 opaque | H.264 | yuv420p | tv | bt709 / bt709 / bt709 | 255 |
| WebM opaque | VP9 | yuv420p | tv | bt709 / bt709 / bt709 | 255 |
| WebM alpha | VP9 | yuv420p | tv | bt709 / bt709 / bt709 | `alpha_mode=1`, readable with libvpx |
| MOV opaque | ProRes HQ | yuv422p10le | tv | bt709 / bt709 / bt709 | 255 |
| MOV alpha | ProRes 4444 | yuva444p12le | tv | bt709 / bt709 / bt709 | retained |
| PNG opaque | PNG | rgba | pc | gbr / bt709 / iec61966-2-1 | 255 |
| PNG alpha | PNG | rgba | pc | gbr / bt709 / iec61966-2-1 | retained |

MP4 also reports `language=und`, `handler_name=VideoHandler`. MOV reports
`handler_name=VideoHandler`, `vendor_id=FFMP`. WebM reports duration 0.4 s and
its alpha case reports `alpha_mode=1`. PNG has no extra stream tags.
The BT.709 tags are reported as found. This measurement did not settle the
transfer question. The later [A101 owner decision](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
keeps pass-through with those tags (O1). Q27 replaces the three transfer expected
failures with O1 assertions and qualifies VP9 alpha with libvpx.

## Mesa llvmpipe, Mesa 26.2.5-arch1.1 / LLVM 23.1.3

| Delivery | Codec error RGBA8 max / mean | Codec error FP16 max / mean | Working-precision error max / mean |
|---|---:|---:|---:|
| mp4 opaque | 1 / 0.029297 | 2 / 0.033325 | 8 / 0.138977 |
| webm opaque | 6 / 0.279968 | 6 / 0.257996 | 8 / 0.138977 |
| webm alpha | 5 / 0.290100 | 4 / 0.235352 | 35 / 0.838257 |
| mov opaque | 0 / 0.000000 | 1 / 0.004578 | 8 / 0.138977 |
| mov alpha | 1 / 0.007812 | 1 / 0.009460 | 35 / 0.838257 |
| png_sequence opaque | 0 / 0.000000 | 0 / 0.000000 | 8 / 0.138977 |
| png_sequence alpha | 1 / 0.002930 | 18 / 0.491455 | 35 / 0.838257 |

## NVIDIA GeForce RTX 3060, driver 610.57.04

| Delivery | Codec error RGBA8 max / mean | Codec error FP16 max / mean | Working-precision error max / mean |
|---|---:|---:|---:|
| mp4 opaque | 1 / 0.026367 | 2 / 0.033325 | 8 / 0.145203 |
| webm opaque | 6 / 0.283447 | 6 / 0.257996 | 8 / 0.145203 |
| webm alpha | 5 / 0.272888 | 4 / 0.235352 | 35 / 0.795410 |
| mov opaque | 0 / 0.000000 | 1 / 0.004578 | 8 / 0.145203 |
| mov alpha | 1 / 0.007812 | 1 / 0.009460 | 35 / 0.795410 |
| png_sequence opaque | 0 / 0.000000 | 0 / 0.000000 | 8 / 0.145203 |
| png_sequence alpha | 1 / 0.011719 | 18 / 0.491455 | 35 / 0.795410 |

## B216 and PNG low alpha

On both adapters and both working formats, the VP9 low-alpha witness is 16
before encoding. `readRgbaFramesWith(..., "libvpx-vp9", ...)` reads 17, while
`readRgbaFrames` reads 255 from the same file. At zero coverage, libvpx reads
zero. The real WebM carries alpha. B216 is a default-decoder read problem for
these deliveries, not evidence that the encoder discarded alpha. This does
not qualify every player or change the runtime's decoder choice.

PNG alpha has up to 18 codes of decoded RGB error for FP16's low-alpha fade.
The PNG path uses canvas storage and straight-alpha extraction. Low-alpha
premultiply/unpremultiply rounding can amplify RGB differences even though
PNG compression itself is lossless. This is delivery-path loss, not additional
working-precision error, and is not hidden behind a loose parity tolerance.
No PNG writer change was made. The cross-adapter differences in these tables
are measurements, not a resolution of B218.

## Verification and limits

Final lavapipe selection: 35 passes in six files. Final RTX 3060 selection:
nine passes in the two new files. Neither new file skips tests or uses
`it.fails`. Package source typecheck and a temporary package-scoped config
including both new tests exit zero. The temporary config was removed.
The source and both new tests were checked for whitespace and control bytes.

Chromium's NVIDIA run also selected Canvas 2D because WebGPU reported
`A valid external Instance reference no longer exists.` Thus neither browser
run qualifies browser WebGPU. The adapter-backed delivery tables above are
Node/Dawn results. The browser checks qualify original selection and missing
media rejection on the actual Canvas 2D path, not browser FP16 delivery.

Commands use Node 24 from `/home/mg/Projects/nodetool-film/bin/ntenv`,
`TMPDIR=/home/mg/Projects/nodetool-film/tmp`, DISPLAY unset and one worker.
Lavapipe sets both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to
`/usr/share/vulkan/icd.d/lvp_icd.json`, with `LP_NUM_THREADS=2`. NVIDIA sources
`/home/mg/.local/nvidia-610/env.sh` after `ntenv`. Chromium uses
`CHROME_PATH=/usr/bin/chromium`.

From `packages/video-nodes`, the final lavapipe command was:

```bash
npx vitest run tests/timeline-export-originals.gpu.test.ts \
  tests/timeline-delivery-checks.gpu.test.ts tests/timeline-browser-path.test.ts \
  tests/timeline-composite.test.ts tests/timeline-rough-cut-output.test.ts \
  tests/timeline-render.test.ts --maxWorkers=1
```

The final NVIDIA command selected only the two new files with the same worker
limit. Package typecheck ran from the root:

```bash
node scripts/run-tsc.mjs -p packages/video-nodes/tsconfig.json --noEmit
```

The first real browser run found the existing dependency tree lacked
`@trpc/react-query`. Its manifest-declared version 11.17.0 was unpacked into
ignored `node_modules` without editing a manifest or lockfile. No ffmpeg or
ffprobe binary was spawned. Every fixture directory is deleted by its test.
Logs remain in the designated TMPDIR as `a44-before3.log`,
`a44-explicit-before.log`, `a4144-lvp-final.log`, `a4144-rtx-final.log` and
`a44-test-types.log`. No large output remains from these tests.

No test:affected, root typecheck, root lint, harness gate, /verify, full suite,
CI, deployment, native delivery, long render, audio delivery, new codec or
codec override qualification was run. HEVC remains deferred and its known
mux failure was not revisited. No source in `compositeRender.ts`,
`host-binaries.ts` or `s3-server-export.md` was edited for this work.

## A43.2 prerequisite: locate the 35-code difference

The delivery test now reports RGB error grouped by the pair of RGBA8/FP16
alpha codes, with frame and pixel witnesses. Both alpha codes agree in every
pixel on each adapter. These are Node/Dawn RGBA8 versus FP16 pre-encode
delivery bytes, including the existing FP16 delivery dither, not browser parity.

| Alpha code, both formats | Pixels across four frames | llvmpipe RGB max / mean | RTX 3060 RGB max / mean |
|---|---:|---:|---:|
| 0 | 3328 | 0 / 0 | 0 / 0 |
| 5 | 128 | 35 / 15.125000 | 35 / 12.937500 |
| 11 | 128 | 19 / 7.875000 | 19 / 7.875000 |
| 16 | 128 | 11 / 4.929688 | 11 / 5.054688 |
| 85 | 128 | 7 / 2.375000 | 7 / 2.734375 |
| 170 | 128 | 9 / 2.968750 | 8 / 2.718750 |
| 255 | 128 | 8 / 2.492188 | 8 / 2.617188 |

The 35 occurs only at alpha 5/255 (1.96% coverage), in frame 1 at 100 ms.
A llvmpipe witness is (42,4), red 204 in RGBA8 versus 169 in FP16.
An RTX witness is (54,4), red 255 versus 220. Coordinates are zero-based.
This straight-RGB difference contributes only 35 × 5/255 = 0.6863 codes
when composited over black at that alpha. It is not a 35-code discrepancy at
meaningful coverage.

Above alpha 5 the maximum is 19 at alpha 11 on both adapters. Above the
fixture's entire low-alpha range, 5–16/255 (1.96–6.27%), the maximum is 9
on llvmpipe and 8 on RTX. The next sampled alpha is 85. No conclusion about
unsampled alpha values is implied. The inverse exposure pair deliberately
amplifies RGBA8 intermediate quantization, so these higher-coverage
byte-versus-float differences are not a server/browser defect.

All seven delivery cases pass on each adapter. The alpha formats share the
same grouped measurements. Logs: TMPDIR/a432-alpha-lvp.log and
TMPDIR/a432-alpha-rtx.log. No production code changed.
