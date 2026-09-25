# Timeline preview performance baseline

Run the controlled browser baseline from `web/`:

```bash
PERF_MEDIA_DIR="${TMPDIR:-/tmp}/nodetool-timeline-perf-media"
PERF_REPORT_DIR="${TMPDIR:-/tmp}/nodetool-timeline-perf-reports"
TIMELINE_PERF_FIXTURE_DIR="$PERF_MEDIA_DIR" TIMELINE_PERF_REPORT_DIR="$PERF_REPORT_DIR" SCREENSHOT_BACKEND_PORT=17784 PROXY_API_TARGET=http://127.0.0.1:17784 npm run test:benchmark -- tests/benchmarks/timeline-preview-perf.spec.ts
```

The test generates deterministic 640×360, 1080p, 4K and matte H.264 inputs
with FFmpeg in a process-specific temporary directory. Each file is written
under a temporary name and renamed only after FFmpeg finishes. This prevents
parallel browser fixtures from reading a partially written clip. Set
`TIMELINE_PERF_FIXTURE_DIR` to choose another media directory and
`TIMELINE_PERF_REPORT_DIR` to choose the JSON output directory.
For the standalone server-export baseline, use the same output directory that
contains `timeline-preview-cold.json` and pass the generated media directory:

```bash
PERF_MEDIA_DIR="${TMPDIR:-/tmp}/nodetool-timeline-perf-media"
PERF_REPORT_DIR="${TMPDIR:-/tmp}/nodetool-timeline-perf-reports"
node tests/benchmarks/timeline-perf-fixture.mjs "$PERF_MEDIA_DIR"
cd ..
TIMELINE_PERF_REPORT_DIR="$PERF_REPORT_DIR" node --conditions=nodetool-dev --import ./node_modules/tsx/dist/loader.mjs web/tests/benchmarks/timeline-server-export.mjs "$PERF_MEDIA_DIR"
```

The server script defaults to the production `renderTimelineComposited`
module. Set `TIMELINE_SERVER_RENDERER_MODULE` to another compatible module
exporting that function to compare a local serial variant against the same
fixture and scenario list.

The L0 run injects a 60-second lead clip and an incoming clip trimmed to 7.25
seconds, records 24 fps playback, and jumps to the cut through the editor's
clip-boundary control. It writes cold and warm JSON reports. A separate
prepared-cut check starts before the 30-second lookahead, confirms the incoming
clip is absent, plays across the threshold, then checks promotion at the cut.
The L0 cut check decodes the playhead-matched source frame independently with
FFmpeg and compares a preview pixel grid, because the temporary video element
may be removed before the paused screenshot is taken.
The L3 matrix records independent preview scenarios for one and four 1080p/4K
streams, dissolve, animated text, matte, blur/glow/drop-shadow clip effects,
scrub, reverse remap, and motion blur.
The dissolve clips share one track so the transition pairs them. Four-stream
fixtures use distinct colored sources and positions, and the scenario oracles
check the visible composition. The 4K Auto check records the preview backing
size while paused, playing, and paused again, and confirms a 4K source upload.
The prepared-cut check matches a captured preview to decoded incoming pixels
and checks the source frame index against the playhead-derived trimmed time.
The browser PNG export check compares frame count, dimensions, and first,
middle, and last pixels with an independent FFmpeg decode of the source.

Isolated scenario reports include `reportKind: "isolatedScenario"` and
`inheritedBaselinePath`. They contain only the measured scenario. Browser, OS,
GPU, and codec metadata are inherited from the named baseline; media and
preview dimensions are measured for the isolated scenario. The cold and warm
matrix reports measure their listed scenarios in the same run.
L0 baseline reports use `timeline-preview-l0-v1`; L3 matrix and isolated
reports use `timeline-preview-l3-v1` so results from the different fixtures are
not compared as the same experiment.

The Playwright global setup starts the screenshot backend on port 17784 and
routes the API proxy to it. Choose another free port and set both variables to
that port if 17784 is occupied.

The report is diagnostic. It includes the browser, OS, GPU adapter when
available, codec, media and preview dimensions, refresh estimate, cache label,
decoded video-frame callbacks, uploads, compositor submissions, and cut
source time. Missing browser counters are `null`. Browser-preview runs require
WebGPU compositor submissions. Export runs can report compositor counters as
unavailable.

`decodedVideoFrames` and `decodedFrameIntervalsMs` come from
`requestVideoFrameCallback` on hidden source videos. They are source decode
observations, not preview-canvas presentations. The fixture does not observe
canvas presentation or intentional frame holds, so `presentedFrames`,
`heldFrames`, and presentation intervals are `null`. The report uses schema
version 2 to keep these measurements distinct from the earlier report.

The benchmark opens Chromium headed by default because headless WebGPU canvas
screenshots are black on the current host. Set `TIMELINE_PERF_HEADLESS=1` only
for runs that do not rely on preview-canvas pixel captures.

The fixture's report schema and its invalid-empty-report check live in
`web/src/components/timeline/perf/report.ts` and
`web/src/components/timeline/perf/__tests__/report.test.ts`.
