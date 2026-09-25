# Timeline rendering performance measurements

These measurements use the generated fixtures in [`web/tests/benchmarks/`](https://github.com/nodetool-ai/nodetool/blob/main/web/tests/benchmarks/TIMELINE_PREVIEW_PERF.md). They describe specific paths on an Apple M4 Pro Mac. Browser, codec, resolution, cache state, and sample counts matter; the figures do not predict performance for other projects.

## Preview scheduling

The 24 fps steady-playback fixture ran for five seconds in Chromium. Before decoded-frame scheduling, the cold run observed 115 hidden source-video frame callbacks with 515 source uploads and 519 compositor submissions. Afterward, the matching cold run observed 117 callbacks with 117 uploads and 122 submissions. The warm run changed from 119 callbacks, 515 uploads, and 518 submissions to 122 callbacks, 122 uploads, and 127 submissions. This measures redundant preview work. The callbacks do not measure preview-canvas presentations or cut latency; those presentation counters remain unavailable in the report.

The final headed L3 matrix used fixture version `timeline-preview-l3-v1`. Each cold and warm run passed all 11 added named scenario oracles: one and four streams at 1080p and 4K, dissolve, animated text, matte, effect-heavy video, scrub, reverse remap, and motion blur. Its separate trimmed-cut oracle also passed in both runs against an independently decoded FFmpeg frame at the paused playhead; the preview matched 21 of 25 sampled pixels in the focused cut check. The effect-heavy scenario confirms rendering but does not isolate GPU effect cost, so it does not justify source-effect downscaling yet.

A review reproduced stale motion-blur shutter textures: `seeked` could fire before the decoded-frame callback updated the upload generation. The shutter path now marks the sought frame ready before compositing and ignores late callbacks from the old frame. The focused headed motion-blur scenario passed after requiring every completed shutter seek to have a matching source upload and subsequent compositor submit. This remains a signal diagnostic; it does not compare each shutter sample's output pixels to an independent reference.

The prepared-cut check started before the 30-second lookahead, observed the incoming source prepared, and verified that the same element reached the cut without another `load()`. Headed runs matched the first visible incoming frame to the decoded source and its playhead-derived frame index. Boundary-to-matching-screenshot upper bounds were 157.9 and 190.6 ms in two runs; this is not a p95 cut-latency estimate.

## Headless alpha resolve

The single-sample alpha path now resolves straight-alpha pixels on the GPU before readback. A resident premultiplied RGBA8 texture with alpha values 0, 64, 128, and 255 produced byte-identical output to the old CPU scan. Each path had one warmup and ten alternating timed samples per run. Timing includes GPU resolve where applicable, copy, map, and row copy, plus the old CPU scan. It excludes upload, scene composition, and encoding.

| Resolution | Run | CPU scan p50 / p95 | GPU resolve p50 / p95 |
|---|---:|---:|---:|
| 1920 × 1080 | 1 | 4.78 / 6.32 ms | 1.24 / 3.08 ms |
| 3840 × 2160 | 1 | 18.57 / 20.61 ms | 4.10 / 5.20 ms |
| 1920 × 1080 | 2 | 5.87 / 8.18 ms | 2.26 / 4.89 ms |
| 3840 × 2160 | 2 | 18.74 / 21.07 ms | 4.15 / 5.14 ms |

An earlier 4K four-stream server fixture completed 24 frames in 3.11 s (7.7 fps), with sampled Node process RSS of 2.39 GB. That fixture used four identical full-frame clips, so it could not detect missing layers. The corrected fixture uses four distinct clips in visible quadrants and checks independent first, middle, and last frames. Its 24-frame runs took 408 ms for one 1080p stream, 903 ms for four 1080p streams, 1215 ms for one 4K stream, and 2642 ms for four 4K streams. An alpha ZIP case took 910 ms and passed RGBA pixel checks. A deliberately missing-layer renderer failed the corrected oracle. The corrected timings establish a new baseline and are not directly comparable with the earlier fixture. FFmpeg child RSS was unavailable.

## Two-frame server pipeline decision

The proposed two-frame headless pipeline did not improve the representative export with real codecs. In isolated comparisons on the same machine, serial then pipeline took 3.53 s and 3.61 s; reversing run order gave 3.07 s and 3.19 s. The pipeline was removed. Encoder drain/error settlement and serial cancellation fixes were retained and covered by abort tests.

## Browser export decoding

The headed Chromium 1080p H.264 fixture exported 48 frames in ABBA order. Seek decoding took 2305 / 791 ms; sequential timestamped decoding took 398 / 355 ms. All 48 sequential MP4 output frames were nearest their source oracle at the same time. The seek path was nearest the previous frame for 32 of 48 frames. Headless Chromium produced visually blank MP4 output for both decoder paths, so the visual claim uses the headed run. Native decoder memory was unavailable; peak JS heap was about 20.4 MB sequential and 15.7 MB seek.

The fallback element decoder now waits for decoded data when the requested time is zero and the element has metadata but no current frame. A failing test reproduced the premature return. Export pool disposal also aborts concurrent pending seeks; its failing test had left two promises unsettled until timeout.

The final browser PNG export produced 48 frames at 1920 × 1080 in 2.36 s. An independent FFmpeg reference matched the first, middle, and last output frames at checked pixels.

## Reverse server decoding

The 320 × 180, 60-frame GOP-15 fixture changed from 59 FFmpeg reopens and 2833 ms to one reopen and 156 ms using bounded reverse windows on aligned source frames. The final figure includes the source-grid eligibility probe. Peak retained frame bytes were 13.6 MB. A 4K five-frame window retained 132,710,400 bytes under the 128 MiB configured cap. A second backward descent after a forward jump exposed a stale forward-only decoder cursor; its failing test was added, then the cursor fix passed.

A review found that a reverse window starting between source frames could select the next frame at fractional timestamps. A lossless 30 fps fixture reproduced this at 1.69 s, where the cached path returned frame 52 and a fresh FFmpeg seek returned frame 51. Another fixture found wrong frames when a 24 fps source was sampled on a 30 fps timeline, plus near-boundary differences from FFmpeg seek rounding. The decoder now uses bounded windows only for verified regular, matching-rate source grids and frame-aligned requests. Other requests use fresh FFmpeg seeks; both independent review probes passed all 31 comparisons. The compositor keys uploads to decoded array identity so adjacent source times cannot collide through rounded version numbers. Fractional reverse requests consequently do not receive the one-reopen speedup.

## Preview bitmap cache

Text and shape bitmaps now use byte budgets and remain pinned until the current frame consumes them. A headed preview fixture with two 4096 × 4096 shape layers held 134,217,728 bytes while rendering. The cache reported zero resident bytes after frame release. The 687 × 687 preview matched the top track's red shape at the checked pixels. Browser export of the same fixture produced one 4096 × 4096 PNG in 1.53 s with the expected pixels; cache residency again returned to zero.

Caption bitmaps use the same frame scope. A failing 65-caption test had shown the first bitmap closing before the frame consumed it; the scoped version keeps it alive until release.

## Rapid scrub baseline

The headed 1080p fixture requested source times 417, 833, 417, 833, and 1250 ms through the preview's keyboard controls. Each of three runs completed five seeks and uploads, and the final 5 × 5 pixel grid matched the last request. Last-request-to-matching-frame latency was 137.3, 127.9, and 148.9 ms (p50 137.3 ms, p95 148.9 ms). Requests were about 58 ms apart, which allowed each seek to complete; a denser request sequence is needed to measure the value of coalescing while decode is pending.

With the seek coordinator, three matching runs again completed five seeks and passed the final pixel oracle. Latencies were 131.1, 128.7, and 128.9 ms (p50 128.9 ms, p95 131.1 ms). The sample is too small and the request spacing too wide to attribute the difference to coalescing.

In a denser five-request sequence (10–15 ms spacing), native Chromium seeking completed one seek and passed all three final pixel oracles, with latencies 166.0, 175.4, and 153.3 ms. The added coordinator completed three seeks per run and also passed the pixel oracles; observed latencies ranged from 154.3 to 165.8 ms. The browser already coalesced more work than the coordinator, and the latency samples did not establish a gain. The coordinator was removed under the plan's retention gate.

## Preview quality

A headed 1080p visual fixture includes crop, placement, an ellipse mask, and a timed caption. Its Full preview measured 1219 × 685 backing pixels. Half measured 609 × 342 and matched the Full 5 × 5 pixel grid at all 25 points; Quarter measured 304 × 171 and matched 19 points. Paused Auto restored the 1219 × 685 backing and matched all 25 points. The Full reference also passed an independent decoded-source geometry check at 15 of 25 grid points. A broad 4K browser transition run timed out at 120 s. A smaller headed 4K probe confirmed the Auto backing changed from 1219 × 685 while paused to 609 × 342 while playing and returned to 1219 × 685 when paused again. The probe observed a 4K source upload, so the smaller backing does not imply source effects run at half resolution.

## Pending decision gates

Source-effect downscaling remains deferred until an effect-heavy trace isolates its cost and a reduced-resolution implementation passes visual parity. A repeated cut-latency distribution is still needed before setting a latency target. After the final code changes, `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main` all passed.
