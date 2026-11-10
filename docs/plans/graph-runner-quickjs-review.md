# Graph runner QuickJS host review

This page records the review of the QuickJS host integration in
[`native/graph-runner/`](../../native/graph-runner/README.md) and the state
after rounds 1 to 4 of the work. The task lists are
[graph-runner-stability-tasks.md](graph-runner-stability-tasks.md) and
[graph-runner-performance-tasks.md](graph-runner-performance-tasks.md).
Paths are relative to `native/graph-runner/` unless they start with
`native/`. Line numbers drift, so search for the named function.

## Fixed

The review findings F1 to F3, F5 (copy and reviver parts), F6, F7, F9 to F14
and S1 to S5 are fixed. The README describes the resulting
[limits and header](../../native/graph-runner/README.md#stacks-heap-messages-and-timers).
The load work (P1 to P7) is done, except the items under Open.

Before and after numbers, measured with `parity/bench-load.mjs`, a
5 MB Code-node bridge call and the stated fixtures:

| Measure | Before | After | Round |
|---|---|---|---|
| `guest.bin` size | 160 MB | 29.8 MB | 1, 3 |
| Resident size after load | 1.13 GB | 0.29 GB | 1, 3 |
| Guest load | 730 ms | 231 ms (total load 240 ms) | 1, 3 |
| Run after a discarded context | 519 ms | 135 ms (spare context) | 3 |
| 5 MB Code-node output | 406 ms | 76 ms | 2 |
| 10000 wasm calls | 160 ms | 3 ms | 2 |
| 60 s audio decode, `next` calls | 705 | 60 | 4 |

The final run gave `read_ms` 5, `guest_ms` 231, `catalog_ms` 10, a total of
240 ms and a resident size of 287 MB. A rebuild of `guest.js` deletes the type
snapshot in `guest.assets/types.json`, so run `compile` after each rebuild.
Without the snapshot, the load evaluates every module and takes about 420 ms.

## Open

### Sanitizer runs (T13) are not complete

The ASan and UBSan graph runner build compiled. A run of 29 of 53 ctest tests
stopped when the disk filled. Failures seen: a bad free inside the
Homebrew `libuhdr` (not repository code, `gr_image_spec_tests`) and timeouts
under ASan in `gr_public_runtime_tests`, `gr_public_state_tests`,
`gr_public_subgraph_durable_tests` and `gr_context_tests`, which still need
a check for a real fault. The TSan build and the node editor run tests
have not run. Run them with at least 8 GB of free disk, one build at a time.

### PT13. Blob table (not done)

Node values still cross as JSON plus base64 for bytes. Add a C++ blob table
and `Engine::adoptBytes` for outputs (`src/kernel/guest.cpp` value path,
`guest/values.mjs`).

### PT12. Output adoption and CPU lane (not done)

Input bytes are lent with `Engine::viewBytes`. Outputs are still copied, and
decode, OCR and readback still run on the worker thread, so a cancel cannot
stop them. Return outputs with `adoptBytes` and move the slow calls to the CPU
lane (`src/host/image_jobs.cpp`, `canvas.cpp`, `gpu_compute.cpp`,
`media.cpp`, `gpu.cpp`, `sandbox_ocr.cpp`).

### PT11. Share part (not done)

The last fan-out edge and `output_update` values move. The other edges still
copy a large value. Share it instead (`src/kernel/actor.cpp`,
`src/kernel/runner.cpp`).

### PT14. `concatSegments` read-ahead (not done)

`next` returns about 1 s of audio, and `convertAudioToWav` is bit-equal. Reads
and writes in `concatSegments` still do not overlap.

### PT17. Bundle split (not needed now)

Start it only if the load stays above 0.5 s on an idle machine. The round 3
figure is about 240 ms.
