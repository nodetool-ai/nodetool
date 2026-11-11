# A82: FP16 cost

## Owner decision

The owner accepted the measured web cost and decided to start S1.
A82 measured +2.09 ms median on an RTX 3060 against a +2 ms trial budget.
The later [server probe](s3-operational-budgets.md) measured real health-route contention during rendering. It did not qualify representative full-API latency under 4K load, a no-growth soak, constrained GPUs or real browsers. A82 remains partly met and browser rollout remains gated.

## Budgets fixed before measurement

- D1: Discrete GPU, completed eight-pass 3840×2160 work: FP16 minus RGBA8
  at most +2 ms median and +3 ms p95.
- D2: Software server completion: FP16 at most 20% slower at median and p95,
  and at most +250 ms p95. Completion includes encoding and queue completion,
  excludes upload and readback. Cold start and transfers are reported separately.
- D3: Representative API latency during rendering: at most +5 ms p95 versus
  idle and no additional errors. Event-loop delay is an allowed diagnostic
  substitute, but cannot satisfy the API gate.
- D4: Twenty create/render/dispose cycles per format after warmup: zero live
  tracked textures/buffers after disposal and no persistent upward RSS trend
  larger than 64 MiB from the first five to the last five cycles. Driver GPU
  memory must be reported as unavailable if no trustworthy counter exists.
- D5: Native uses the committed budgets in native/timeline/budgets:
  60 Hz (16.667 ms frame interval), CPU p95 2 ms for baseline and 8 ms for
  effects/zero-copy. Completed wall frame time is a separate measurement from
  CPU recording. Compare FP16 overhead with D1 as an additional trial budget.

Reject and repeat a route run if its starting one-minute load exceeds 6
(half the machine's 12 logical CPUs), or available RAM is below 8 GiB.
Record load and available memory before every sample as well. Use
LP_NUM_THREADS=4 initially for lavapipe, reduced to 2 after the high-load discard. No builds or other agent work during measurement.
Five warmups per format, then twenty samples per format in alternating order.
Use nearest-rank p95 and the mean of the two central values for median.
The driver shader cache is not cleared, so cold means process/device/context
cold, not a cold OS or driver cache.

## Verdict

| Budget | Verdict |
|---|---|
| D1, RTX 3060 incremental completed cost | **Fail median**, +2.090 ms exceeds +2 ms. P95 passes at +1.876 ms versus +3 ms. |
| D2, software server completion | **Pass** for this headless executor workload. Median +9.18%, p95 +2.79% and +43.134 ms. This excludes server scheduling and delivery. |
| D3, API latency and errors | **Not qualified**. No production API was exercised. Timer delay is only a substitute. |
| D4, lifecycle | Zero tracked live textures/buffers after disposal passes. RSS allowance passes. Strict no-growth is **not established**, especially on hardware. |
| D5, native | **Pass measured frame/CPU timing budgets** on the tested scene. Other playback-budget fields were not qualified. |
| S0 | Owner accepted the RTX 3060 median overrun for starting S1. A82 remains partial because the API, strict no-growth and constrained-device gates are incomplete. |
| Browser rollout | **Blocked**. Constrained GPUs and actual browser qualification were not done. |

No production code changed. FP16 remains off by default. A bad timing result
is retained rather than changing the workload or budget.

## Environment and isolation

Web/Dawn base: `a94eb90742589a06477f3322182c6c2d931df3f2`,
`film/color-s0`. Native base: `94305d44b7314bdc84b6105c97c67e5064e5beb0`,
`film/color-n0`. Node 24.22.1. Linux x86_64, 12 logical CPUs, about 31.25 GiB
RAM. Native Release build, Qt 6.12.0. No dependency installation, full package
build, server startup or unrelated test was performed by this agent.
Only the new bench files and the native bench's preferences fixture ran.

The matching NVIDIA userspace environment is sourced by `bin/ntenv`.
Vulkan and both benchmark APIs successfully selected the physical adapter.
NVML also worked in this session: `nvidia-smi` reported driver 610.57.04,
12,288 MiB total VRAM. Its post-run 773 MiB usage is not a peak measurement.
The earlier NVML failure did not imply a Vulkan failure.

| Route label used below | Adapter actually selected |
|---|---|
| Dawn hardware | NVIDIA GeForce RTX 3060, Ampere, Dawn vendor nvidia, device nvidia-geforce-rtx-3060, NVIDIA 610.57.04 |
| Dawn software | llvmpipe-llvm-23-1-3-256-bits-, Mesa 26.2.5-arch1.1, LLVM 23.1.3, Vulkan lavapipe, LP_NUM_THREADS=2 |
| Native hardware | Vulkan, NVIDIA GeForce RTX 3060, matching NVIDIA 610.57.04 environment |

All direct commands used temporary `XDG_CONFIG_HOME`. Native used `nttest`
with Xvfb and null audio. No desktop window or sound was requested.

| Accepted run | Starting load 1/5/15 minutes | Starting available RAM, KiB | Highest recorded pre-sample load 1 minute |
|---|---|---:|---:|
| Dawn hardware | 3.02 / 4.99 / 6.31 | 15123564 | 3.17 |
| Dawn software | 2.20 / 4.30 / 5.97 | 15437080 | 4.73 |
| Native hardware | 3.436 / not captured / not captured | 15530992 | 3.436 |

Every accepted timing sample has a pre-run load and available-memory record in
the raw JSON. Native records the one-minute load only. No accepted sample began
above the cutoff or below 8 GiB available RAM. Sampling load average is a coarse
interference check, not proof that the desktop did no work between samples.

The first four-thread software run was terminated and discarded after load
reached 8.00. An unrelated Vitest process was found in another checkout.
It was not terminated. A subsequent two-thread software trial met pre-sample
load limits but overlapped that external process, so it too is excluded from
the deciding numbers. The final software trial began after that process ended,
needed no high-load waits, and ran alone. No builds ran during any measurement.
Earlier hardware trials are retained below to avoid selecting a favorable run.

## Method

`packages/gpu/tests/precisionCost.test.ts` is opt-in through
`COLOR_COST_OUTPUT`. Without it the file tests its percentile helper and returns
without a skipped test or a timing assertion.

Dawn runs the production `createExecutor` and GPU context. Its test-local
`withFormat` clone is copied from `precisionBenefit.test.ts`: only format
contracts, storage bindings and matching resolved WGSL declarations change.
Shader arithmetic remains f32. No shader-f16 feature is requested.

The 3840×2160 workload matches A81's eight-pass grade/glow chain: four color
grades, threshold 0.55/softness 0.15, radius-12 Gaussian horizontal/vertical,
and gain-0.65 additive glow. Params and eight-bit opaque source pixels are
identical between formats. The source is a deterministic colored ramp.
The four grades use brightness -0.025/+0.035/-0.015/+0.020, contrast 1.03,
saturation 1.04 and temperature 0.03. Glow tint is 1/0.85/0.7.
Separate resources and pipeline caches are retained for each format.

Five warmups per format precede twenty samples per format, ordered RGBA8,
FP16, RGBA8, FP16. Frame time starts before uniform updates/encoding and ends
after `queue.onSubmittedWorkDone()`. It excludes source upload, allocation,
and output readback. This measures completed work plus host overhead, not
pure GPU timestamp duration or command-submission latency. Encoding times
are also recorded.

Transfers are measured separately, with twenty alternating samples per format.
Readback submits a copy and awaits `mapAsync`, without typed pixel conversion
or a CPU output copy. Upload is an RGBA8 source for both formats and awaits
queue completion. Allocation timing comes from twenty new contexts per format.
It measures host creation calls, not guaranteed eager physical residency.

Cold figures are single observations, not distributions. Both contexts share
one device, with RGBA8 first, so the FP16 context can benefit from driver caches.
They must not be treated as independent format-specific process cold starts.

Native's new `tst_precisioncost` uses `PreviewCompositor`, parsed timeline
documents, production raster/effect registrations, and `nt::test::Still`.
The 4K scene is a colored ellipse with eight alternating gamma 0.98/1.02
Levels effects. The test asserts an eight-pass effect plan, selected working
texture format, settled frames and zero resource failures. This is a different
representative workload from Dawn's blur-heavy chain, not a cross-renderer
speed comparison.

Two compositor instances retain their format-specific resources. Each gets
five warmups and twenty alternating samples, seeking a new timeline time
before each frame. The observer reads only readiness, format and allocator
counters. It issues **no readback**. `Still::frame()` calls `QRhi::finish()`
after render-control submission. Completed wall time includes render-control
and synchronization. The separately reported `renderCpuMs` is the compositor's
CPU recording metric. RGBA8 retains its production alpha bridges. FP16 omits
those bridges, which can offset its larger targets.

## Completed rendering

All values are milliseconds. Median and p95 are computed separately for each
format, then subtracted. P95 is the 19th sorted sample of twenty, not a stable
population-tail estimate. These are trial results without confidence intervals.

| Route / adapter | RGBA8 median | FP16 median | Delta median | RGBA8 p95 | FP16 p95 | Delta p95 |
|---|---:|---:|---:|---:|---:|---:|
| Dawn hardware / RTX 3060 | 3.976 | 6.066 | +2.090 | 4.432 | 6.308 | +1.876 |
| Dawn software / lavapipe | 1352.371 | 1476.532 | +124.161 | 1544.265 | 1587.399 | +43.134 |
| Native hardware / RTX 3060 | 3.566 | 3.159 | -0.407 | 3.648 | 3.309 | -0.339 |

| Native hardware / RTX 3060 CPU recording | RGBA8 median | FP16 median | RGBA8 p95 | FP16 p95 |
|---|---:|---:|---:|---:|
| renderCpuMs | 0.125 | 0.111 | 0.206 | 0.182 |

Native passes the 16.667 ms interval and even the stricter 2 ms CPU p95
baseline threshold. The committed effect and zero-copy CPU p95 thresholds
are 8 ms. The real budget files are
`native/timeline/budgets/m1a.json`, `m1b.json`, and `m1c.json`
in the native checkout. The test does not qualify decoded playback,
frame errors, missing media, cut misses, decoder close time, skipped submit
fraction, CPU copies or frames released in flight. It is not a full budget-suite pass.

Two earlier Dawn hardware trials measured median increments +2.002 and
+2.077 ms, with p95 increments +1.982 and +1.983 ms. They also missed the
median trial limit. The final harness additionally alternates transfer samples
and records per-cycle allocation timings. No repeat reversed the hardware
median verdict. Near-threshold results warrant broader measurement before
generalizing, but they do not pass the stated +2 ms trial limit.

## Cold start, allocation and transfer

Dawn device acquisition took 209.709 ms on hardware and 30.613 ms on software.
It includes Dawn initialization and adapter/device acquisition.

| Route / adapter | Format | Cold context + upload + first completed frame, ms | First frame only, ms | Allocation median / p95, ms |
|---|---|---:|---:|---:|
| Dawn hardware / RTX 3060 | RGBA8 | 59.113 | 30.293 | 6.862 / 7.556 |
| Dawn hardware / RTX 3060 | FP16 | 43.423 | 18.340 | 10.522 / 11.189 |
| Dawn software / lavapipe | RGBA8 | 1885.883 | 1834.580 | 0.311 / 0.403 |
| Dawn software / lavapipe | FP16 | 2205.724 | 2166.564 | 0.321 / 0.374 |
| Native hardware / RTX 3060 | RGBA8 | 172.360 | not separated | not separated |
| Native hardware / RTX 3060 | FP16 | 148.443 | not separated | not separated |

| Route / adapter | Format | Upload median / p95, ms | Readback median / p95, ms |
|---|---|---:|---:|
| Dawn hardware / RTX 3060 | RGBA8 | 23.476 / 25.256 | 2.442 / 10.999 |
| Dawn hardware / RTX 3060 | FP16 | 25.752 / 27.883 | 3.161 / 10.211 |
| Dawn software / lavapipe | RGBA8 | 18.401 / 18.970 | 10.908 / 73.861 |
| Dawn software / lavapipe | FP16 | 19.963 / 33.789 | 21.530 / 23.895 |

Upload is 33,177,600 bytes for both formats. Readback is 33,177,600 bytes for
RGBA8 and 66,355,200 bytes for FP16. Host buffer allocation is outside the
readback interval. GPU allocation/transfer overlap and deferred driver work
can affect these separate intervals. No encoder, network or delivery conversion
is included.

Each Dawn context owns one RGBA8 source, eight format-selected targets, a
lazy 1×1 white texture and eight uniform buffers. The eight target payloads
are 253.125 MiB for RGBA8 and 506.250 MiB for FP16. Including the source gives
284.766 and 537.891 MiB, before white/uniform resources, driver padding,
transient copies and readback buffers. These are logical allocation bytes,
not measured resident VRAM.

Native peak QRhi allocator used bytes were 267,149,072 for RGBA8 and
400,841,488 for FP16. The frame-stat surface bytes were 33,177,600 and
66,355,200 respectively. These are scoped allocator/pool counters, not total
board VRAM, and must not be added to each other. True per-process or total
VRAM peaks were not sampled, despite NVML being available. That remains a
measurement limitation.

## Lifecycle and latency

The measurements in this section predate the [server probe](s3-operational-budgets.md). That probe measures health-route contention, including interrupted 4K batches, rather than satisfying D3 for representative API traffic.

Twenty create/upload/render/dispose cycles per format follow the warmed
timing run, alternating formats. Instrumented GPU texture/buffer factories
count explicit creation and destruction. Both routes ended with zero live
tracked textures and buffers. Each full Dawn run created 440 textures and
392 buffers, including timing, transfer, lifecycle and timer-probe phases.
All twenty lifecycle snapshots per format also have zero live resources.

Disposal explicitly destroys the context's lazy white texture in addition
to targets, source, uniform ring and scratch pool. Production GPUContext has
no combined disposal API. This tests explicit resource teardown, not whether
all existing production callers perform it. Pipelines, bind groups, JS objects
and driver caches are not explicit live-resource counters.

| Route / adapter | Format | Mean RSS first five / last five cycles, MiB | Change, MiB |
|---|---|---:|---:|
| Dawn hardware / RTX 3060 | RGBA8 | 386.762 / 426.188 | +39.425 |
| Dawn hardware / RTX 3060 | FP16 | 387.363 / 427.451 | +40.088 |
| Dawn software / lavapipe | RGBA8 | 1049.146 / 1050.145 | +0.999 |
| Dawn software / lavapipe | FP16 | 1302.180 / 1302.991 | +0.811 |

RSS is process-wide, so the alternating formats share one process.
Hardware RSS rises across the short experiment. No forced GC or long soak
was used to distinguish delayed collection, retained JS/driver caches and a
leak. The 64 MiB trial allowance passes, but strict no-growth does not.
Software RSS is approximately flat at this scale. Native lifecycle growth
was not measured in this task.

No production server was started. Qualifying representative API requests would
require the full server/runtime composition and seeded authenticated data,
which were not prepared for this isolated executor experiment. The permitted
substitute measures lateness of a 5 ms timer, once idle for one second and
then during twenty completed renders for each format. Busy windows differ
in duration and hardware has only 24/25 timer samples, so this is weak
diagnostic evidence, not an API comparison.

| Route / adapter | Idle timer p95, ms | RGBA8 busy p95 / max, ms | FP16 busy p95 / max, ms |
|---|---:|---:|---:|
| Dawn hardware / RTX 3060 | 0.017 | 0.462 / 17.013 | 0.051 / 0.191 |
| Dawn software / lavapipe | 0.021 | 0.013 / 287.017 | 0.019 / 322.145 |

Idle timer maximums were 19.100 ms on hardware and 15.021 ms on software.
The small p95 values do not hide the software stalls. No render validation
errors occurred, but HTTP request counts, API errors and request latency were
not measured. D3 therefore remains unqualified.

## Reproduction and artifacts

From `/home/mg/Projects/nodetool-film/wt/color-s0`:

```bash
source /home/mg/Projects/nodetool-film/bin/ntenv
export XDG_CONFIG_HOME=$(mktemp -d)
COLOR_COST_HARDWARE=1 COLOR_COST_OUTPUT=/tmp/dawn-hardware.json \
  npm test --workspace=packages/gpu -- tests/precisionCost.test.ts
VK_DRIVER_FILES=/usr/share/vulkan/icd.d/lvp_icd.json \
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json LP_NUM_THREADS=2 \
COLOR_COST_OUTPUT=/tmp/dawn-software.json \
  npm test --workspace=packages/gpu -- tests/precisionCost.test.ts
```

After separately building only `tst_precisioncost` with `ntbuild color-n0
tst_precisioncost`, run native from any directory:

```bash
source /home/mg/Projects/nodetool-film/bin/ntenv
export XDG_CONFIG_HOME=$(mktemp -d)
NT_COST_HARDWARE=1 NT_COST_OUTPUT=/tmp/native-hardware.json \
  nttest color-n0 '^tst_precisioncost$' -V
```

No build may overlap these commands. Check the load first.

Accepted raw records are [Dawn hardware](a82/dawn-hardware-qualified.json),
[Dawn software](a82/dawn-lavapipe-qualified.json), and
[native hardware](a82/native-hardware-final.json).
Earlier retained trials are [first hardware](a82/dawn-hardware.json),
[instrumented hardware](a82/dawn-hardware-final.json),
[excluded software](a82/dawn-lavapipe-final.json), and
[first native](a82/native-hardware.json).
All logs, including the terminated four-thread run and native build logs, are
under `/home/mg/Projects/nodetool-film/tmp/a82/`.

Final hardware and software Vitest runs each passed one test, zero skips,
exit 0. Native's new benchmark passed three QtTest cases, zero skips.
CTest passed the benchmark and its preferences setup fixture, exit 0.
Only the new benchmark target was built. No test:affected, typecheck, lint,
harness gate or full suite ran. Diff whitespace, control bytes and local
report links were checked before committing.

Actual browsers, constrained GPUs, container resource limits, API traffic,
native software/OpenGL/Metal/D3D, final encoders, full VRAM peaks, independent
per-format process cold distributions and a long no-growth soak are not done.
The software route is a container-style headless Dawn/lavapipe environment,
not an actual constrained container deployment.
