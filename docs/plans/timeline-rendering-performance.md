# Timeline Rendering Performance Plan

## Outcome and evidence

Make ordinary timeline playback, cuts, scrubbing, and export measurably faster without changing rendered frames. The starting analysis inspected commit `6cb1a6d1d3c78e5bc354baa3d070fa43aa87a748`. Its M4 Pro component measurements found 4K four-layer GPU compositing at 5.60 ms with resident textures and 25.46 ms with upload and readback. A two-frame headless experiment reduced one-layer 4K throughput time from 16.91 to 14.18 ms per frame when sources changed. These numbers exclude codec work, audio, browser presentation, and editor contention. They are not playback results or a claim of parity with Premiere or Final Cut.

This plan targets four separate costs: browser frame scheduling, decoder readiness at cuts, headless readback, and preview memory. Keep preview, browser export, server export, and agent frame preview on the shared scene and compositor rules in [`packages/timeline/AGENTS.md`](../../packages/timeline/AGENTS.md#rendering-srcrender-nodetool-aitimelinerender). Preserve the transient playback clock, scene change horizon, source texture reuse, batched frame compositing, and existing multi-sample GPU alpha resolve.

## Delivery rules

- Start each task from the current branch and read [`AGENTS.md`](../../AGENTS.md), the relevant area overlays, and [`docs/DEVELOPMENT_STANDARDS.md`](../DEVELOPMENT_STANDARDS.md). This plan describes work, not an exception to those rules.
- Use one agent per task and one small PR per task. Agents may work concurrently only when the ownership table gives them disjoint files. Integrate in dependency order, rebase, and rerun checks on the integrated branch.
- Before fixing an observed bug, make the reproduction fail. Before enforcing a new metric check, prove it fails on invalid input. Use the canonical playback or export path to confirm a harness finding, as required by [`docs/HARNESS_FIRST.md`](../HARNESS_FIRST.md#the-rules).
- Every code PR runs `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main`. Add the focused render parity or browser scenario named in its task. Attach before and after measurements from the same machine, fixture, browser, resolution, and cache state.
- Keep benchmark thresholds out of CI until the browser baseline is repeatable. Correctness gates can enter CI first. Document unsupported browser paths and preserve a working fallback.

## Measurement contract

L0 produces a repeatable browser scenario using checked-in or locally generated media with known frame timestamps and colors: steady 24 fps playback and a 60-second lead clip with a trimmed incoming clip. L3 extends the same fixture to 1080p and 4K, one and four H.264 streams, a dissolve, animated text, a matte, scrubbing, reverse playback, motion blur, and browser and server export. Record cold and warm cache runs separately. Compare each change with the matching baseline on the same machine, source files, codec, and preview quality. A separate manual comparison with commercial editors can follow; it is not a delivery gate for this plan.

The machine-readable report records source frame generation, uploads, composites, presented frames, intentionally held frames, dropped or duplicate source frames, cut-to-correct-frame and scrub-to-correct-frame latency, p50/p95/p99 presentation interval, main-thread time, GPU completion time where available, audio drift, queue depth, estimated allocated bytes, peak process memory, export frames per second, and cancellation time. Mark unavailable GPU or memory counters as unavailable, never zero. Count presentation separately from source decoding so a 24 fps clip on a 120 Hz display is not reported as dropping four frames out of five.

The fixture checks pixel identity at known cut and matte frames and includes alpha output. A report must state its sample count and fail if no frames or no relevant counters were observed. Performance results remain diagnostic until repeated runs establish useful thresholds. Correctness and resource bounds are release gates now: no wrong or reordered frames, no unbounded queue, no lost cancellation, no alpha or audio drift regression.

## Tasks and ownership

| ID | Owner | Depends on | Owned implementation files | Deliverable |
|---|---|---|---|---|
| L0 | Luna | none | New browser performance fixture and report files under `web/src/components/timeline/` or `web/src/perf/` | Core baseline, failure reproductions, report contract |
| L3 | Luna | L0 | The L0 fixture and report files | Extended scenario matrix and export baseline |
| S1 | Sol | L0 | `web/src/components/timeline/preview/PreviewCompositor.tsx`, `preview/gpu/compositor.ts` | Decoded-frame driven preview scheduling and uploads |
| S2 | Sol | L0, S1 | `preview/PreviewCompositor.tsx`, `preview/videoSlotPool.ts` | Live-clock lookahead and prepared decoder promotion |
| S3 | Sol | none | `packages/timeline/src/render/frameCompositor.ts` | GPU straight-alpha conversion for the single-sample headless path |
| S4 | Sol | S3, L3 | `frameCompositor.ts`, `packages/video-nodes/src/nodes/timeline/compositeRender.ts` | Bounded two-frame render/readback and ordered encoding |
| L1 | Luna | L0 | `preview/textRender.ts`, `preview/shapeRender.ts`, cache tests | Byte-bounded bitmap caches and measured allocation behavior |
| L2 | Luna | S2 | `preview/PreviewArea.tsx`, `preview/PreviewCompositor.tsx`, `web/src/stores/timeline/TimelineUIStore.ts` | Auto/Full/Half/Quarter control and correct backing resolution |
| S5 | Sol | L3, L2 | Shared compositor and preview source adaptation files, assigned after trace | Reduced source processing cost at lower preview quality |
| S6 | Sol | L3, S2 | Browser export and decode files, assigned after codec probe | Bounded timestamped decode for sequential browser export |
| S7 | Sol | L3, S6 | Browser scrub request files, assigned after trace | Coalesced scrub requests |
| S8 | Sol | L3 | `packages/video-nodes/src/nodes/timeline/rawFrames.ts` | Bounded server reverse GOP windows |

Luna owns the fixture and cache or UI changes; Sol owns scheduler, decoder, and GPU execution changes. Test files belong to the task that changes their behavior. Do not edit `PreviewCompositor.tsx` from L1 or L2 while S1 or S2 is active. If L2 requires that file, wait for S2 to merge and assign its exact diff before starting. S3 can run alongside L0 because its files do not overlap, but its performance claim waits for L3's export baseline. A workable two-agent order is L0 with S3, L3 with S1, L1 with S2, then L2 with S4.

### L0 — Browser baseline and reproductions

Build a runnable scenario against the real preview, with a JSON report and a short command documented next to it. Use `requestVideoFrameCallback` metadata and `getVideoPlaybackQuality` where available. Instrument source upload and compositor submission counts behind a diagnostic flag. Capture the current redundant-work behavior during steady 24 fps playback on a high-refresh display, then capture the 60-second cut and trimmed in-point. Keep the metric collector outside React state and disabled for ordinary playback.

**Acceptance:** The command runs the same fixture twice and produces nonempty, schema-checked reports. Deliberately invalid input fails the check. The cut case shows whether the first displayed incoming frame matches its requested source in-point. Report browser/OS, GPU adapter if available, codec, media dimensions, display refresh, preview dimensions, and warm or cold cache status. Do not assert a speedup before S1 or S2 lands.

### L3 — Extended fixture and export baseline

Extend L0 without changing its report schema. Add the four-stream, 4K, matte, animation, scrub, reverse, motion-blur, and export cases in separate named scenarios. Include a correct-frame oracle at the cut and an alpha reference for export. Record audio drift where the fixture has sound. Keep test media generation repeatable and report scenario-specific sample counts.

**Acceptance:** Each scenario runs independently and fails if it observes no frames. The browser and server export baselines include total elapsed time, frame count, and peak memory when available. A changed fixture records its own version in the report so numbers from different media are not compared as one experiment.

### S1 — Decoded-frame scheduling

Track a monotonically increasing decoded-frame generation per active `HTMLVideoElement` using `requestVideoFrameCallback`, with callback cleanup on slot reuse and unmount. Give the preview compositor a small source-version interface instead of reading `video.currentTime` as pixel identity. Reuse a GPU texture when a new bitmap has the same dimensions and format, but upload its changed pixels. Composite when a video generation changes or when scene changes, animation, transitions, motion, caption timing, or the playhead requires it. Keep an explicit fallback for browsers without the callback. A seek requests redraw when the correct decoded frame arrives, not merely when `currentTime` changes.

**Acceptance:** A held video frame causes no repeat upload or composite solely because rAF ticked. Animated overlays still composite on their own clock. Pause, seek, source replacement, loop, cut, matte, and callback-unavailable cases show a correct frame. L0 reports fewer uploads and submissions in steady video playback without more wrong, dropped, or duplicate source frames. Add focused tests near [`preview/gpu/__tests__/compositor.test.ts`](../../web/src/components/timeline/preview/gpu/__tests__/compositor.test.ts) and the preview tests.

### S2 — Live lookahead and decoder promotion

Use `getTimeMs()` at each preload tick, not the frozen `sceneTimeMs`, to select upcoming sources. Keep a prepared `(clipId, assetUrl)` element through activation by moving its binding into the active pool without setting `src` or calling `load()` again. Seek a prepared element to the incoming source in-point as metadata allows. Include matte sources. Keep the active slot cap and define eviction when a dissolve occupies multiple slots. Cancel stale listeners and pending seeks when a slot changes ownership.

**Acceptance:** A clip beginning at 60 seconds is prepared inside the configured lookahead while the lead clip plays. The prepared element is the one used after the cut; its source is not reloaded. The first correct frame, trimmed source in-point, matte, and overlapping dissolve are verified in a browser run. Compare p95 cut latency with L0 and report it even if decoder promotion brings no gain. Extend [`preview/__tests__/videoSlotPool.test.ts`](../../web/src/components/timeline/preview/__tests__/videoSlotPool.test.ts).

### S3 — Headless alpha resolve

Reuse the existing GPU unpremultiply shader pattern from the multi-sample motion-blur resolve for the single-sample headless path. Keep the public `renderFrame` output as straight-alpha RGBA8 for both opaque and alpha export. Preserve zero-alpha RGB behavior and match current rounding closely enough for the repository's pixel parity tolerance. Do not skip conversion solely because the output format is opaque: chroma key or another effect can lower alpha after the ground is seeded.

**Acceptance:** The single-sample output matches reference frames for opaque, translucent, zero-alpha, chroma key, masks, and generated mattes. Motion blur remains unchanged. The per-pixel CPU scan leaves the hot path. Report standalone readback and end-to-end export timings, separately. Run [`packages/timeline/tests/render.parity.gpu.test.ts`](../../packages/timeline/tests/render.parity.gpu.test.ts), [`packages/video-nodes/tests/timeline-alpha-render.test.ts`](../../packages/video-nodes/tests/timeline-alpha-render.test.ts), and output-format checks.

### S4 — Two-frame headless pipeline

After S3, split render submission/readback completion from encoder write through a small ordered frame result interface. Allow at most two frames in flight and one ordered encoder consumer. Honor encoder backpressure; on abort or error, stop scheduling, release mapped buffers and sources, abort encoding, and surface the original failure. Do not decode two samples from one forward-only FFmpeg stream concurrently. Verify whether the shared compositor's ping-pong textures are safe while a prior readback is pending before allowing a second submit. If they are not, add the required target ownership inside `HeadlessFrameCompositor` rather than exposing GPU buffers to the caller.

**Acceptance:** Alternating-color frames prove order and data ownership at 1080p and 4K. Cancellation works during decode, GPU mapping, and blocked encoder writes. Memory and queue depth stay bounded. Alpha, masks, changing scene content, and motion-blur output match the serial path. Measure total export throughput with real codec decode and encode as well as synthetic frame throughput; retain the pipeline only if the end-to-end result is non-regressing on the representative fixture.

### L1 and L2 — Preview cost controls

**L1:** Replace entry-count-only limits for sequence-sized text and shape bitmaps with eviction by estimated bytes, closing bitmaps on eviction. Measure resident cache bytes and texture allocations in the L0 scenario. S1 owns same-size GPU texture reuse in `preview/gpu/compositor.ts`; L1 verifies that changed bitmap content still uploads after S1 merges. A later cropped-raster change needs explicit offsets and visual parity for crop, placement, and source-pixel effects.

**L2:** Add Auto/Full/Half/Quarter preview quality using the existing UI primitives and design tokens. Size the preview backing surface to the selected scale and device pixel ratio; preserve sequence-space placement and restore a sharp paused frame where practical. Auto may choose a lower scale from measured pressure, but must have a deterministic initial rule and a visible current setting. This task does not claim to reduce 4K source effects until S5 changes source processing.

**Acceptance:** L1 demonstrates a byte cap with correct eviction and no stale bitmap or texture on a same-size content change. L2 demonstrates correct crop, placement, captions, masks, and paused-frame sharpness at every setting. Browser export and server export are unaffected. L0 reports backing and source texture sizes separately.

### S5–S8 — Decode and source-cost track

Start these only after L0 shows which cost dominates on the target machines.

- **S5, source cost:** At lower preview quality, downscale before expensive effects when their units and sampling semantics can be preserved. Compare with full-quality output at matched display size. If quality differs for an effect, keep its full-resolution path or label the preview approximation. Evaluate actual proxy files separately; a smaller canvas by itself is not a proxy.
- **S6, browser export:** Probe `VideoDecoder` support, decoder latency, queue behavior, and hardware acceleration on supported platforms. Build timestamped decoded-frame reuse and sequential decode behind the existing browser export interface. Keep a fallback to the current seek path for unsupported codecs or environments. Preserve exact frame times, trim, retime, matte, and motion-blur samples. Do not replace deterministic export with approximate playback frames.
- **S7, scrub:** Coalesce obsolete seeks during rapid browser scrubbing; a stale decode must never present over the latest request.
- **S8, reverse:** Decode bounded GOP windows with byte and duration limits instead of reopening FFmpeg for every descending server request. Preserve the current frame-at-time contract.

**Acceptance:** Each task has a before and after latency distribution from L0, bounded memory and queues, frame-accurate fixtures, cancellation tests, and a working fallback. Keep a change only when the representative end-to-end scenario improves without a correctness regression.

## Integration order and decision gates

1. **Baseline:** Merge L0, then L3. Record present bottlenecks and set machine-specific performance targets from repeated runs. S3 may be developed concurrently and measured after L3.
2. **First preview release:** Merge S1, then S2, then L1 and L2. Compare frame work, cut latency, and memory against L0. Release only when correctness fixtures and the four mandatory checks pass.
3. **First export release:** Merge S3, then S4. Compare pixel parity, queue depth, cancellation, synthetic throughput, and real export throughput. S3 and S4 are separate rollback points.
4. **Second wave:** Choose S5 through S8 from measured traces. Profile CPU effects and GPU pass cost again before considering premultiplied internal passes, effect-result caching, source-over fast paths, external textures, hardware codecs, workers, or background-rendered ranges. Each of those needs its own measurement and parity task.

Do not make scene-resolution rewrites or generic React memoization part of this effort without a new trace: the inspected simple-scene resolution was already below the measured media and CPU costs. Do not promise broad Premiere or Final Cut parity without same-machine, same-media editor comparisons across supported codecs and effects.
