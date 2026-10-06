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

Per-system timing is unavailable until W2 adds the runtime system pipeline.
The report returns `perSystemMs: null` with that reason.

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
