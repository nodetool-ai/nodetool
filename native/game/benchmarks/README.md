# Native game measurements

Build the native targets, then measure one document:

```bash
node native/game/scripts/benchmark.mjs native/game/build-player native/game/benchmarks/course.json --render
node native/game/scripts/benchmark-suite.mjs native/game/build-player
```

`game-bench` executes fixed input ticks serially after warmup and verifies a
snapshot continuation. It reports nearest-rank p50/p95/max wall time for
checkpoints, scripts, commands, physics, spatial synchronization, gameplay,
presentation, MsgPack encoding, and document transactions. Timings are opt-in and
never enter snapshots or script input. The report includes build identity,
platform, CPU, population, peak process RSS, and repeated reload/restore work.
Peak RSS is a process high-water mark, not evidence that allocations were freed.

[Scenario budgets](scenario-budgets.json) bound simulation and document-edit latency
for each workload. Add `--enforce` to the suite command on the reference CPU to
make a budget violation fail the run. The default records the result without
claiming that an arbitrary shared runner is reference hardware.

The suite exercises the course, a deep hierarchy, indexed script world lookups
and physics queries, and spawn/lifetime churn. It does not require providers or
network access after building dependencies.

`--render` renders a fixed committed pose at the configured resolution. Each
sample waits for GPU completion, including command recording and upload work.
This is end-to-end rendering wall time, not a GPU-only timestamp measurement or
real-time input latency. Asset preparation is reported separately. The renderer
report identifies the actual device. Software Vulkan establishes correctness and
provides a measured software baseline. It cannot establish the hardware target.

[budgets.json](budgets.json) contains executable targets. `--enforce` returns a
nonzero exit status when the simulation or requested rendering budget fails.
The rendering gate also fails on software devices. GPU-only timing is explicitly
unavailable, so no GPU-only budget pass is reported. Use the hardware target on
a named reference GPU before making a frame-rate claim.

To gate simulation alone:

```bash
native/game/build-player/game-bench native/game/benchmarks/course.json --ticks 120 --warmup 30 --max-p95-ms 4
```

CTest's `native-game-bench-budget-rejection` passes only when an intentionally
impossible budget produces a failing benchmark exit status.
