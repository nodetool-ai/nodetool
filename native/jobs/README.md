# Native job core

The native side of host jobs that the graph runner
([`native/graph-runner`](../graph-runner/README.md)) runs off its worker
thread. The protocol is
[`docs/plans/graph-runner-async-host.md`](../../docs/plans/graph-runner-async-host.md).
The package depends on the C++20 standard library and threads only: no
JavaScript engine, QuickJS, SQLite, ICU, curl or GPU code.

| Header | What it holds |
|---|---|
| `nodetool/jobs/job_core.h` | `NativeJob`, `makeJob`, `JobOutcome`, `JobResult`, `JobPayload`, `JobAborted`, `RunnerTracker`, `RunMailbox`, `JobDelivery`, `SubmittedJob`, `JobExecutor`, `InlineExecutor`, `StopRelay` |
| `nodetool/jobs/wake_target.h` | `WakeTarget`, what a run mailbox wakes |
| `nodetool/jobs/admission.h` | `AdmissionLedger`, the run and runner accounts, `Reservation`, `ExternalCharge`, `JobCost` and the limits (design section 4.7) |
| `nodetool/jobs/resource_control.h` | `ResourceControl`, the serial queue of one host resource, with its leases and operations (sections 4.4 and 4.8) |
| `nodetool/jobs/session_stop.h` | `SessionStopBridge`, the stop state of a library session (section 4.9) |

Everything is in the namespace `nodetool::jobs`. The CMake target is the
static library `nodetool_jobs`.

The graph runner keeps the parts that need its engine or its process state:
the result converters and settlers, `AsyncRun`, `RunBinding`, the job input
snapshots, the process lanes (`src/kernel/host_lanes.h`), the destination
queue and every host. Its `gr::Loop` implements `WakeTarget`.

## Wake target and lock order

A `RunMailbox` holds a borrowed `WakeTarget` until `close()`. `deliver()` and
`wake()` call `WakeTarget::wake()` while they hold the mailbox mutex, so
`close()` cannot drop the target during the call. The lock order is the
mailbox mutex, then the target's own mutex. A target must not call into the
mailbox from `wake()`, and must not take a lock that is held while a mailbox
method is called.

## Build and test

```bash
cmake -S native/jobs -B native/jobs/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/jobs/build -j
ctest --test-dir native/jobs/build --output-on-failure
```

The tests build only when this directory is the top-level project. The graph
runner adds the package with `add_subdirectory` unless a parent project added
it first, and the node editor gets it through the graph runner. The target
`nodetool_jobs_test_support` exports `tests/resource_test_support.h` to the
graph runner's resource, file and media job tests, and `tests/test_executor.h`,
a test-only `JobExecutor` with worker threads and a reaper that the package's
tests run jobs on instead of the graph runner's lanes.

`npm run test:affected:native` treats a change under `native/jobs` as a change
to graph-runner and node-editor too, since their builds compile it.
