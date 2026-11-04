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
