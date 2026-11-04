# S5 agent rendering qualification

A91 is in progress. No production caller has switched yet. A92 is excluded.

## Qualification limits

For the existing small agent preview fixtures, set these trial limits before
measurement: cold render under 10 seconds, two concurrent render passes under
10 seconds, peak RSS below 512 MiB, and growth below 64 MiB across twenty
create/render/dispose cycles. A one-shot process must exit within 10 seconds
without a forced exit. These limits do not qualify 4K server exports or hardware.
Preserve existing correctness assertions. Record any changed pixel expectations
with their semantic cause before enabling the replacement.

## Runtime and CI audit

The GPU package already declares `webgpu` as an optional peer and imports it
inside device acquisition. No dependency or document schema change is needed.
Rendering requires the Dawn addon and a hardware adapter or Mesa lavapipe.
Non-rendering tool registration must remain independent of device acquisition.
D7.1 requires missing-addon and missing-adapter errors with installation guidance.

`quality-checks.yml` supplies Mesa for the agent package matrix, core, node and
harness jobs. Its setup action installs the matrix's `extra-apt` packages.
`quality-guard.yml` runs root tests after plain `npm ci` without an explicit Mesa
install. `quality-assurance.yaml` and `mutation-testing.yaml` invoke setup-build
without `extra-apt`. These alternate test entry points now receive explicit Mesa setup
in this change. No render tests may skip for absent adapters.

The retained Dawn instance in `packages/gpu/src/node.ts` intentionally keeps its
runner alive to avoid a native use-after-free. Device disposal alone cannot
establish one-shot completion. Qualification must measure process exit separately
from obtaining pixels.

## Resumed lifetime investigation

Node 24.22.1, installed `webgpu@0.4.0`, Linux lavapipe selected by
`VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json`.

The installed `webgpu/README.md` Lifetime section says references to `create()`'s
result keep Node alive and recommends releasing them. The GPU package instead
retains instances to avoid a previously diagnosed native use-after-free.
`HeadlessFrameCompositor.dispose()` releases textures, buffers and effect state,
not the cached device or retained Dawn instance. The server's
`video-nodes/src/nodes/timeline/compositeRender.ts` uses the same cached device
and compositor disposal. CLI workflow runners explicitly exit. That does not
satisfy an agent library's completion contract.

Reproduction fixtures live in `packages/agents/tests/fixtures/`:

- `shared-preview-completion.mjs`: renders and disposes twenty successive
  compositors, then two concurrent compositors. With built workspace exports,
  cold render took 1.05 s, concurrent rendering 21 ms, peak RSS 297 MiB and
  growth 2.6 MiB. Pixels arrived, but `timeout 12s node ...` returned 124.
- `shared-preview-release.mjs`: bypasses the cache, renders, disposes the
  compositor, waits for submitted work, destroys the device, clears references
  and forces GC. Run with `node --expose-gc`. Pixels arrived, but the 10-second
  timeout returned 124. The otherwise equivalent unused-device experiment
  exited 0. This does not establish that every Dawn use fails to release.
- `shared-preview-worker-completion.mjs`: renders in a worker, then calls
  `worker.terminate()`. The native binding raised
  `FATAL ERROR: Error::ThrowAsJavaScriptException napi_throw` during
  `processImmediate`. Worker isolation is not safe on this installed binding.
  Run this diagnostic with core dumps disabled and an external timeout.
- `shared-preview-child-completion.mjs`: renders in a child, delivers results
  over IPC, then the parent sends SIGTERM and waits for child exit. Parent exits
  normally, without `process.exit`. Completion took 2.99 s, cold render 0.76 s,
  concurrent rendering 19 ms, peak child RSS 296 MiB and cycle growth 2.5 MiB.
  These numbers pass the small-fixture limits only. They exclude parent RSS,
  source rasterization, full agent imports and IPC frame-payload transfer.

Re-run probes from the repository root after sourcing
`/home/mg/Projects/nodetool-film/bin/ntenv` and exporting the ICD path above.
The completion fixtures use built dependency exports. Source-condition runs
have additional import cost and did not qualify cold process startup.
Local command logs are in `/home/mg/Projects/nodetool-film/tmp/color-s5/`.

## Correctness and installation checks

The three selected preview files passed 63 tests, including the inherited
CPU/shared variants. The new lifetime file passed three tests for child
completion/resource limits, missing-addon guidance and missing-adapter guidance.
Real rendering is mandatory in these tests. Only the Linux-specific invalid-ICD
probe is platform conditional.

`shared-preview-minimal.mjs` passed under `node --import tsx`: ordinary tool
registration performed zero native loads. Rendering attempted one load and
reported `nodetool packs add webgpu --yes`. This simulates an omitted addon with
an import hook, not a fresh package installation. The isolated invalid-ICD probe
reported `No WebGPU adapter` and `mesa-vulkan-drivers`, without fallback.
Agents-only `run-tsc.mjs --noEmit` passed. No dependency, schema or working-format
change was made. CPU code remains.

The CI audit found missing explicit Mesa setup in both quality-guard jobs,
quality-assurance and mutation-testing. This change adds that prerequisite.
The quality-checks matrix already supplies it. CI itself was not executed here.

## Exact remaining boundary

No production caller moved. `renderTimelineFrames(options, true)` is retained
only as a qualification seam. Its default stays on the original renderer.
There are no production output differences. The selected assertions passed
without changed pixel tolerances, but this is not exhaustive numerical parity.
The prototype still uses CPU unsupported-effect diagnostics and returns empty
compositor skipped/degraded lists, so diagnostics require further work.

Call sites enumerated with `rg renderTimelineFrames packages/agents/src` are
preview and comparison in `capabilities/timelines.ts`, reference and final renders
in `agentic-storyboard-finish.ts`, `storyboard-layout-check.ts`, and
`timeline-clip-frames.ts`. None supplies the qualification flag.

A91 remains incomplete. Next, implement a lazy child renderer with packaged
entry-point support, bounded concurrency, frame-payload transport, error
propagation, cancellation and awaited teardown. Re-run budgets on that complete
path, then qualify and switch one caller. A worker is excluded by the observed
native fatal error. No forced exit belongs in library code. Full numerical
coverage and output-difference accounting remain prerequisites to switching.

Per task instructions, test:affected, root typecheck, lint, harness gate,
/verify and full suites were not run.

## Changed files

- `.github/workflows/mutation-testing.yaml`
- `.github/workflows/quality-assurance.yaml`
- `.github/workflows/quality-guard.yml`
- `AGENTS.md`
- `docs/plans/color-precision/results/s5-agent-rendering.md`
- `packages/agents/src/timeline-preview/frames.ts`
- `packages/agents/src/timeline-preview/shared-compositor.ts`
- `packages/agents/tests/capabilities-timeline-preview.test.ts`
- `packages/agents/tests/timeline-preview-parity-regressions.test.ts`
- `packages/agents/tests/timeline-shared-preview.test.ts`
- `packages/agents/tests/timeline-preview-lifetime.test.ts`
- `packages/agents/tests/fixtures/shared-preview-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-child-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-worker-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-release.mjs`
- `packages/agents/tests/fixtures/shared-preview-runtime.mjs`
- `packages/agents/tests/fixtures/shared-preview-minimal.mjs`

## Child renderer implementation checkpoint

A91 remains incomplete. Production callers still use Canvas2D. The
`renderTimelineFrames(options, true)` qualification route now runs composition
in a child process. CPU code, working format and document schemas are unchanged.
This section supersedes the earlier next-step description.

### Process and transport

One child serves one render pass, including its frames and shutter samples.
It is terminated and awaited at pass completion. Reuse across calls would save
startup but retain a native process between calls and delay one-shot completion.
This implementation chooses predictable release and reports the latency cost.

Each parent permits two children and rejects further passes with a retryable
busy message. There is no retained request queue. Each child accepts one frame
at a time. V8 binary serialization and advanced IPC carry typed pixel buffers,
without base64. Source rasterization stays in the parent. Source and mask byte
budgets are checked before pixel extraction. Serialized requests and output
frames are limited to 64 MiB. This bounds transfer, not total renderer memory.

A frame has a 30-second deadline. Cancellation and timeout send SIGTERM, then
SIGKILL after 250 ms if necessary. Promise rejection waits for child close.
Errors include child exit status or the renderer's original error. An idle
child has a 60-second watchdog. Disconnect terminates the child, including a
startup connection check for a parent that disappeared before imports finished.
No worker termination or process.exit is used. AbortSignal reaches the
qualification renderer, with checks between frames and shutter samples.
Asset loaders and font/rasterization work do not yet receive that signal.

### Measurement

Budgets were stated before the run: cold and two concurrent passes below
10 seconds, peak RSS below 512 MiB, and twenty-cycle growth below 64 MiB.
`preview-child-full-path.mjs` renders two 160×90 shape frames per pass through
source rasterization, composition, IPC, PNG encoding and awaited child teardown.
It samples parent plus direct-child RSS every 25 ms on Linux. The measurement
includes the loaded agent modules but excludes initial module-import time from
call timings. It does not measure capability persistence or the complete tool
invocation. Other work was active on the host.

| Measurement | Result | Gate |
|---|---|---|
| CPU render call | 0.147 s | Baseline |
| First child render call | 4.534 s | Pass, but 4.387 s slower |
| Subsequent serial calls | 2.949–6.258 s | Small-fixture timing only |
| Two concurrent calls | 4.191 s | Pass |
| Combined sampled peak RSS | 968.8 MiB | Fail |
| Parent RSS growth over twenty cycles | 23.1 MiB | Pass for parent growth |
| Probe process completion | Exit 0 after all calls | Pass, no forced parent exit |

The twenty children are replaced, so parent growth is not a measurement of
one retained GPU process. The memory gate fails even for this small fixture.
Full tool startup, representative media, comparison workload and hardware
qualification remain unmeasured. No caller may switch on these results.

### Correctness and diagnostics

The selected preview suites passed without changing pixel tolerances. The
opaque-shape fixture still compares exact decoded pixels, geometry, timecodes
and reports. No production output differences were introduced because no
production caller moved.

Diagnostic parity is unfinished. The qualification route still uses the CPU
unsupported-effect classifier and returns empty compositor skipped/degraded
lists. The headless compositor does not expose those reports. Source-resolution
and dropped-layer reporting remain in the parent. Completing diagnostics needs
coverage for unknown effects and compositor omissions before caller migration.
The child transport does not establish exhaustive numerical parity.

### Packaging and verification

Source execution passed on Node 24 with lavapipe. Agents compilation passed,
and a real render through the compiled child entry passed. Entry lookup tests
cover the source file and a flattened `server.mjs` layout. The bundler now emits
`preview-render-child.mjs` beside `server.mjs`, using the existing external
package policy. The complete Electron artifact was not built or run. Addon
staging and packaged execution are therefore unqualified. No Electron source
files changed.

The missing-addon fixture now injects its import failure in the child. Ordinary
tool registration performs zero parent native loads, and rendering reports
`nodetool packs add webgpu --yes`. The invalid-ICD child test preserves Mesa
installation guidance without fallback. This simulates a missing addon and is
not a fresh-install test.

Selected preview tests passed 73 assertions. A later focused run passed 12
assertions, including source/compiled execution, entry lookup, timeout, crash,
cancellation, concurrency and transfer limits. Agents-only typecheck passed.
The final lifecycle run passed 11 tests, including a parent disconnecting
before child imports finish. Logs and measurements are under
`/home/mg/Projects/nodetool-film/tmp/color-s5/`.

Per the requested test scope, test:affected, root typecheck, lint, harness gate,
/verify and full suites were not run. The full backend packaging smoke was not
run. The bundler passed a syntax check only.

### Files changed in this checkpoint

- `packages/agents/src/timeline-preview/frames.ts`
- `packages/agents/src/timeline-preview/shared-compositor.ts`
- `packages/agents/src/timeline-preview/render-child-client.ts`
- `packages/agents/src/timeline-preview/render-child.ts`
- `packages/agents/tests/timeline-render-child.test.ts`
- `packages/agents/tests/fixtures/preview-child-failure.mjs`
- `packages/agents/tests/fixtures/preview-child-full-path.mjs`
- `packages/agents/tests/fixtures/preview-child-missing-addon.mjs`
- `packages/agents/tests/fixtures/preview-child-parent-exit.mjs`
- `packages/agents/tests/fixtures/shared-preview-minimal.mjs`
- `scripts/bundle-backend.mjs`
- `docs/plans/color-precision/results/s5-agent-rendering.md`

Implementation commit: `4048c0f3e1`. No changes were pushed.
