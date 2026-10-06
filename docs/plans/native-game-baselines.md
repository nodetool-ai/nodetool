# Native game benchmark baselines

These measurements use Linux x64, an AMD Ryzen 5 3600 CPU, Node 24.18.0,
seed 1 and the headless simulation backend. The CPU runs have no browser.
Runs execute sequentially without concurrent repository tests or captures.

## Reproduce

From the repository root:

```bash
mise exec node@24.18.0 -- npm run dev:nodetool -- game bench packages/game-runtime/bench/bench-2d-500.json --ticks 1200 --warmup 300 --json
```

The [fixture generator](https://github.com/nodetool-ai/nodetool/blob/game/b-b1/packages/game-runtime/bench/generate-fixtures.ts)
creates the workload documents and their checked-in image and model assets.
The 2D workload has 500 entities, a tilemap and 32 active scripted behaviors.
The original plan's 50 scripts exceed the runtime's limit of 32. The fixture
uses the supported limit, as agreed for [B1](native-game-implementation-plan.md).

## CPU measurements

The initial short sampling window warms up for 300 ticks and measures 1,200
ticks. The scale workload also uses the longer window documented below. Tick
time includes
simulation and render-frame construction. Script time comes from the runtime's
script batch statistics. The allocation profiler runs separately for 10 ticks,
with a 32 KiB sampling interval. Its byte estimate includes sampled allocations
that have already been collected. It excludes WASM allocations and is not an
allocation count. Heap delta is measured across the timing pass and can vary
with garbage collection.

The original CPU measurements below were collected without per-system
instrumentation. The benchmark now enables `recordTimings` and returns
`perSystemMs`, a map of stage names to p50, p95 and p99 durations. The existing
`perSystemUnavailableReason` field is `null`. Warmup and allocation-profiler
ticks do not contribute stage samples. Missing measured timings fail the run.

Instrumented runs include timing clock calls and records in the tick and
allocation measurements. Their results are recorded separately from the original
untimed baselines. Stage percentiles do not sum to the outer tick percentile.
Default runtime sessions keep timing disabled.

### 2D workload

All latency columns are milliseconds. Both runs execute 38,400 script calls.

| Run | Tick p50 | Tick p95 | Tick p99 | Script p50 | Script p95 | Script p99 | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16.790 | 23.918 | 25.355 | 16.333 | 19.281 | 24.857 | 349435264 | 36312968 |
| 2 | 17.230 | 24.409 | 26.952 | 16.782 | 23.509 | 26.349 | 386243392 | 38342192 |

Tick p95 differs by 2.05%, within B1's 10% repeatability requirement.

### 3D workload support probes

The planned 1,000-entity fixture with 30 scripts cannot complete its first
simulation tick. Its script input is 132,746 bytes, exceeding the runtime's
64 KiB logical-tick input budget. No latency baseline exists for that workload.

Smaller temporary workloads retained all 30 scripts and the same entity order.
The 400-entity and 128-entity probes passed the input-size boundary but failed
the 50 ms script batch execution budget at tick 0 during isolated runs. A
64-entity probe completed 120 ticks with seed 1 and verified replay from tick
60. All 30 script state counters reached 120. This demonstrates supported
execution for the smaller probe, rather than latency repeatability.

The agreed fixtures separate the workloads: `bench-3d-1000` has 1,000 entities,
100 dynamic bodies, 10 models and no scripts. `bench-3d-64-scripted` has 64
entities, 61 dynamic bodies, 10 models and 30 scripts. Runtime budgets remain
unchanged.

### 3D scale workload

| Run | Tick p50 | Tick p95 | Tick p99 | Script p50 | Script p95 | Script p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 10.655 | 11.564 | 11.991 | 0.000 | 0.000 | 0.000 | 0 | 17505624 | 53457264 |
| 2 | 11.224 | 12.883 | 14.113 | 0.000 | 0.000 | 0.000 | 0 | 13737696 | 51084272 |
| 3 | 10.988 | 12.336 | 13.052 | 0.000 | 0.000 | 0.000 | 0 | 17959360 | 53769088 |

The initial pair differed by 11.4% in tick p95, outside the 10% target. An
additional sequential run differs from run 2 by 4.25%. This does not establish
repeatability for the original sampling window. All runs are retained above,
and a longer fixed sampling window is measured separately.

### 3D scale workload with a longer sampling window

This fixed configuration warms up 3,000 ticks and measures 12,000 ticks per run.
Both consecutive runs use the same fixture, seed, runtime and idle machine.

```bash
mise exec node@24.18.0 -- npm run dev:nodetool -- game bench packages/game-runtime/bench/bench-3d-1000.json --ticks 12000 --warmup 3000 --json
```

| Run | Tick p50 | Tick p95 | Tick p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 11.030 | 12.262 | 13.231 | 0 | 408115576 | 51511632 |
| 2 | 11.056 | 12.317 | 13.240 | 0 | 407080312 | 53461296 |

Tick p95 differs by 0.44%, within the 10% repeatability target.

### 3D scripted workload

| Run | Tick p50 | Tick p95 | Tick p99 | Script p50 | Script p95 | Script p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 30.868 | 37.466 | 39.779 | 29.727 | 36.320 | 38.605 | 36000 | 327839544 | 43125312 |
| 2 | 30.859 | 37.546 | 39.444 | 29.734 | 36.205 | 38.225 | 36000 | 328527016 | 44374904 |

Both runs execute 36,000 script calls, confirming 30 active scripts per measured
tick.

The scripted workload tick p95 differs by 0.21%, within the 10% target.

## Instrumented CPU measurements

These paired runs use the same Linux x64 machine, AMD Ryzen 5 3600 CPU,
Node 24.18.0, seed 1 and headless simulation backend described above. Each
pair ran consecutively without competing tests, builds or captures. The
benchmark enables `recordTimings`. These results include its timing overhead
and are separate from the original untimed tables. Runtime budgets and the
three approved fixtures are unchanged. Every producer exited successfully.

### 2D: 500 entities and 32 scripts

Each run warms up 300 ticks and measures 1,200 ticks.
Latency columns are milliseconds.

| Run | Tick p50 | Tick p95 | Tick p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 17.029 | 24.756 | 27.250 | 38400 | -63221592 | 37912264 |
| 2 | 16.852 | 23.990 | 26.080 | 38400 | 515282096 | 37630344 |

Tick p95 differs by 3.19%, within the 10% requirement.

| Stage | Run 1 p50 | Run 1 p95 | Run 1 p99 | Run 2 p50 | Run 2 p95 | Run 2 p99 |
|---|---:|---:|---:|---:|---:|---:|
| input | 0.000812 | 0.001272 | 0.001653 | 0.000712 | 0.001113 | 0.001552 |
| scripts | 16.619243 | 23.997221 | 26.796242 | 16.459934 | 23.085603 | 25.331304 |
| physics | 0.046388 | 0.065453 | 0.080281 | 0.045846 | 0.056185 | 0.068328 |
| contacts | 0.028654 | 0.039004 | 0.050004 | 0.028563 | 0.036990 | 0.047510 |
| gameplay | 0.031790 | 0.041678 | 0.049843 | 0.031319 | 0.040156 | 0.050405 |
| presentation | 0.270109 | 0.382591 | 0.787022 | 0.268976 | 0.315885 | 5.111738 |

### 3D scale: 1,000 entities and no scripts

Each run warms up 3,000 ticks and measures 12,000 ticks.
Latency columns are milliseconds.

| Run | Tick p50 | Tick p95 | Tick p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 11.068 | 12.259 | 13.340 | 0 | 382235136 | 54619056 |
| 2 | 11.052 | 12.227 | 13.265 | 0 | 379609568 | 52293896 |

Tick p95 differs by 0.26%, within the 10% requirement.

| Stage | Run 1 p50 | Run 1 p95 | Run 1 p99 | Run 2 p50 | Run 2 p95 | Run 2 p99 |
|---|---:|---:|---:|---:|---:|---:|
| input | 3.281411 | 3.797092 | 4.347820 | 3.268066 | 3.849762 | 4.317332 |
| scripts | 0.015459 | 0.036379 | 0.048011 | 0.015529 | 0.036919 | 0.050105 |
| character | 0.532874 | 0.639965 | 1.283036 | 0.526472 | 0.635818 | 1.284519 |
| physics | 0.030497 | 0.038703 | 0.044524 | 0.029615 | 0.037792 | 0.043361 |
| contacts | 0.248678 | 0.300656 | 0.381238 | 0.249390 | 0.298072 | 0.372131 |
| gameplay | 0.053370 | 0.068048 | 0.083678 | 0.051367 | 0.066004 | 0.081915 |
| animation | 0.117551 | 0.144482 | 0.798464 | 0.116480 | 0.143240 | 0.794156 |
| presentation | 6.728073 | 7.588223 | 8.385344 | 6.733403 | 7.594915 | 8.343425 |

### 3D scripted: 64 entities and 30 scripts

Each run warms up 300 ticks and measures 1,200 ticks.
Latency columns are milliseconds.

| Run | Tick p50 | Tick p95 | Tick p99 | Script calls | Heap delta bytes | Sampled allocation bytes |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 31.509 | 37.868 | 41.056 | 36000 | 512130912 | 41705824 |
| 2 | 30.650 | 37.019 | 39.055 | 36000 | 466517464 | 44029192 |

Tick p95 differs by 2.29%, within the 10% requirement.

| Stage | Run 1 p50 | Run 1 p95 | Run 1 p99 | Run 2 p50 | Run 2 p95 | Run 2 p99 |
|---|---:|---:|---:|---:|---:|---:|
| input | 0.203724 | 0.251975 | 0.293192 | 0.194046 | 0.218371 | 0.271141 |
| scripts | 30.392567 | 36.749200 | 39.759770 | 29.693920 | 35.835438 | 37.745516 |
| character | 0.230043 | 0.285247 | 0.339780 | 0.176072 | 0.265681 | 0.328619 |
| physics | 0.031650 | 0.039715 | 0.046908 | 0.023344 | 0.034936 | 0.041728 |
| contacts | 0.113213 | 0.158128 | 0.191210 | 0.101231 | 0.140164 | 0.176563 |
| gameplay | 0.018906 | 0.024487 | 0.029406 | 0.014707 | 0.021561 | 0.026940 |
| animation | 0.041658 | 0.052058 | 0.064361 | 0.030988 | 0.049273 | 0.056626 |
| presentation | 0.435951 | 0.524288 | 0.626871 | 0.423799 | 0.468332 | 0.598518 |

## Browser rendering measurements

These runs use Chromium 148.0.7778.96 on the same machine, the WebGL2 backend,
and a 960 by 540 viewport. Each warms up 60 frames and measures 600 renders of
the same tick-0 frame. `gl.finish()` completes GPU work before timing ends.
The browser measurements isolate rendering and do not execute scripts.

```bash
mise exec node@24.18.0 -- node --conditions=nodetool-dev --import=tsx packages/game-renderer/scripts/benchmark-effects.ts --game packages/game-runtime/bench/bench-3d-1000.json --assets-dir packages/game-runtime/bench/assets
mise exec node@24.18.0 -- node --conditions=nodetool-dev --import=tsx packages/game-renderer/scripts/benchmark-effects.ts --game packages/game-runtime/bench/bench-3d-64-scripted.json --assets-dir packages/game-runtime/bench/assets
```

| Fixture | Run | Frame p50 ms | Frame p95 ms | Frame p99 ms | Draw calls | Triangles |
|---|---:|---:|---:|---:|---:|---:|
| bench-3d-1000 | 1 | 52.500 | 62.800 | 108.600 | 997 | 11844 |
| bench-3d-1000 | 2 | 52.400 | 63.000 | 108.700 | 997 | 11844 |
| bench-3d-64-scripted | 1 | 36.900 | 73.500 | 76.600 | 62 | 624 |
| bench-3d-64-scripted | 2 | 37.100 | 74.400 | 78.000 | 62 | 624 |

The scale workload frame p95 differs by 0.32%. The scripted companion differs
by 1.22%. Both satisfy the 10% rendering repeatability target.
