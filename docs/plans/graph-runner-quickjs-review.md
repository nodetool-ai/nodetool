# Graph runner QuickJS host review

This page records the review of the QuickJS host integration in
[`native/graph-runner/`](../../native/graph-runner/README.md) and the state
after rounds 1 to 6 of the work. The task lists are
[graph-runner-stability-tasks.md](graph-runner-stability-tasks.md) and
[graph-runner-performance-tasks.md](graph-runner-performance-tasks.md).
Paths are relative to `native/graph-runner/` unless they start with
`native/`. Line numbers drift, so search for the named function.

## Fixed

The review findings F1 to F3, F5 to F14 and S1 to S5 are fixed. The README
describes the resulting
[limits and header](../../native/graph-runner/README.md#stacks-heap-messages-and-timers).
The load work (P1 to P7) is done, except the items under Open.

Round 6 closed the value path (F5 and F8):

- PT11. An output with N readers is one `gr::SharedValue`
  (`src/kernel/value.h`). The edges, the inbox envelopes and the
  `output_update` share it. Each consumer still copies the value once when
  it builds its inputs.
- PT12. Image decode, PNG encode, canvas `pixels()` and GPU readback return
  their bytes with `adoptBytes`. `decodeAsync` and OCR run on the CPU lane,
  and a cancel stops them. GPU readback stays on the worker, because the
  device belongs to that thread.
- PT13. Bytes of a node value cross the guest boundary as a `Blob`, the
  binary type of the kernel's JSON values (`src/kernel/blob.h`,
  `src/kernel/wire.h`, `guest/values.mjs`). They leave the guest with one
  copy and enter each reader with one copy. No table holds them: a blob
  lives as long as a value holds it, and its bytes are charged to the run's
  admission account. A host, the durable journal and the result cache still
  read `{"__bytes__": "<base64>"}`. The README
  [architecture section](../../native/graph-runner/README.md#architecture)
  describes the path.

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
| 1.5 million numbers to 4 edges (`gr_unittests`, `fanOutSharesLargeValues`) | 570 ms | 200 ms | 6 |
| 50 MiB of bytes to 4 edges (`gr_blob_value_tests`) | 3548 ms | 115 ms | 6 |
| Bytes charged for a stream of 48 frames of 1 MiB, peak | not charged | 1 MiB | 6 |
| 50 MB image decode, bytes that reach JavaScript without a copy | 0 | 50,126,400 | 6 |
| Cancel during OCR of a 4000 x 4000 image | no effect, 426 to 1140 ms on the worker | AbortError at the cancel, the job ends about 450 ms later | 6 |

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

### PT14. `concatSegments` read-ahead (not done)

`next` returns about 1 s of audio, and `convertAudioToWav` is bit-equal. Reads
and writes in `concatSegments` still do not overlap.

### PT17. Bundle split (not needed now)

Start it only if the load stays above 0.5 s on an idle machine. The round 3
figure is about 240 ms.
