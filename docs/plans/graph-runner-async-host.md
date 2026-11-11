# Asynchronous Host Operations in the Native Graph Runner

Status: draft, revision 3. Revisions 1 and 2 were reviewed. Section 11 maps
findings F17–F30 to this revision.

All source citations below are relative to `native/graph-runner/` in this
worktree. Sections describing protocols specify proposed behavior, not
implemented behavior.

## 1. Problem

The loop resumes a ready kernel step and calls its pump after each step.
It returns when timers are empty and ready work is exhausted
(`src/kernel/task.cpp:39–53`). QuickJS drains pending jobs without a bound
(`src/js/quickjs_engine.cpp:333–348`). Neither behavior supports a forced
exit deadline under continuously ready work.

Host calls also retain synchronous work. Sharp calls the native transform
inside its async function (`guest/host/sharp.mjs:41–43`), and that binding
copies source and overlay bytes before transforming
(`src/host/image_vips.cpp:107–116`). File reads allocate native buffers
(`src/host/files.cpp:163–175`). HTTP responses can retain up to 512 MiB
(`src/host/http.cpp:113–128`). Moving these operations off-thread requires
bounded input, queue and result ownership.

## 2. Goals and non-goals

| Goal | Required behavior |
|---|---|
| G1 | Independent converted host operations can run concurrently. |
| G2 | Only the worker touches or releases JavaScript values. |
| G3 | Cancellation ends cooperative scheduling at its deadline. A synchronous host call, an individual non-returning step, or an inline native job can still delay the worker. |
| G4 | Jobs can outlive a run without accessing its engine, coroutine frames or a later run. |
| G5 | Inline jobs have reproducible submission order. External retained completions remain nondeterministic. |
| G6 | Provider jobs no longer require guest polling. GPU polling is outside this rollout. |
| G7 | In a run that is not being cancelled, keep JavaScript ordering semantics: microtasks drain completely before any timer or completion, and a timer fires only when no kernel step is ready. Keep coroutine ownership and timer deadline and insertion order. Only completion dispatch, timer and completion alternation, cancellation slices and exit rules change. |

Running JavaScript on pool threads, adding stdexec, and changing synchronous
guest APIs into promise APIs are not goals.

## 3. Decision

Keep native jobs with owned inputs, a closable per-run `RunMailbox`, and a
worker-owned settler registry. Jobs hold neither JavaScript values nor
coroutine handles. Mailbox closure is the lifetime boundary between native
work and a run. Revision 1's sender design remains rejected because these
ownership boundaries are needed even when suspended frames are abandoned.

## 4. Architecture

### 4.1 Threads

The worker owns the engine, kernel loop, settler registry and deferred-start
FIFO. Process-wide CPU, I/O and network lanes execute native jobs. A resource
serial queue submits at most one operation at a time. Each runner owns a
shared tracker that survives its public object and identifies all its jobs,
including jobs from previous runs.

### 4.2 Invariants

| Invariant | Requirement |
|---|---|
| I1 | A job owns native inputs, leases, stop state, reservation, tracker ticket and mailbox reference. |
| I2 | Only the worker converts results and settles promises. |
| I3 | Mailbox closure removes access to the loop before engine teardown. |
| I4 | Retirement prevents new leases without destroying dependencies still in use. |
| I5 | Debug engine and value operations assert worker ownership. |
| I6 | Every retained input, queued operation and native result remains charged until disposal or an explicit accounting transfer. |

### 4.3 Jobs, mailbox and registry

`JobResult` contains an id, Value/Error/Stopped discriminator, native payload
and reservation. `RunMailbox` contains a mutex, nullable loop wake target,
and FIFO result deque. `Settler` contains a promise capability and converter
in the worker's id-indexed registry.

`deliver` locks the mailbox, appends only if open, and calls `Loop::wake`
while still holding that mutex. `close` takes the same mutex, nulls the wake
target and moves the pending deque out. Disposal occurs after unlocking.
The only nested lock order is mailbox then loop wake mutex. The loop never
calls the mailbox while holding its wake mutex. Delivery to a closed
mailbox disposes the result without touching the worker. This preserves the
reviewed deliver/close protocol.

Submission validates and snapshots inputs under the budget protocol below,
registers a settler, and either defers or submits a native job. Results move
through the mailbox once. Missing settlers cause disposal. Result conversion
failure rejects the promise and releases native ownership. No job stores a
registry pointer. Teardown clears settlers before abandoning frames.

### 4.4 Lanes

Each lane has a mutex, condition variable, bounded queue, accepting flag and
worker exit notifications. Submission takes a pre-acquired admission ticket.
A lane lock protects transitions Queued → Running or Queued → Disposed.
Cancellation removes queued jobs under that lock and destroys them outside
it. Running jobs receive stop requests outside all executor locks.

Pool sizes are configured once per process. Inline mode executes submitted
jobs on the worker but still delivers through the mailbox. It cannot promise
bounded cancellation during native execution. Serial queues preserve resource
submission order in both modes. They do not bypass global admission.

### 4.5 Delivery order

Separate microtask pumping from completion dispatch. The existing pump runs
after each resumed step (`src/kernel/task.cpp:44–45`), so dispatching one
result per pump cannot provide a completion turn.

The loop has two scheduling modes. The mode changes once, when the worker
first observes a cancellation snapshot for the current run (§ 4.6).

**Normal mode** keeps today's JavaScript ordering:

1. Resume ready kernel steps in queue order. After each step, the pump
   drains microtasks completely, as `drainJobs()` does today
   (`src/js/quickjs_engine.cpp:333–348`). The pump never dispatches
   mailbox results.
2. Only when no step is ready and no microtask is pending, run one
   macrotask. A macrotask is either one due timer, selected by deadline and
   insertion order as today, or one mailbox result.
3. When both a due timer and a result are available, alternate between
   them, starting with the timer. When only one kind is available, run it.
4. After the macrotask, return to step 1.

A completion turn therefore needs no separate state. A result is dispatched
only at the macrotask point, which is reached only after every kernel step
and microtask that the previous result made ready has run. No second result
settles between steps K1 and K2 that the first result readied. Alternation
keeps a full mailbox from starving timers, and keeps a stream of due timers
from starving results. A kernel step queue that never empties still delays
timers and results, as it delays timers today. Normal mode accepts that,
because changing it would change the ordering of every run.

**Cancellation mode** bounds scheduling so the deadline can be checked:

1. Check the cancellation snapshot and the deadline.
2. Resume at most 64 ready steps. After each step, drain at most 64
   microtasks. `JS_ExecutePendingJob` runs one job per call, so
   `drainJobs` gains a maximum-count parameter.
3. Run at most one macrotask, with the same alternation rule as normal mode.
4. Repeat from step 1.

Cancellation mode changes ordering only in a run that is already being
cancelled. Once the kernel runner is cancelled, its terminal status is
cancelled (`src/kernel/runner.cpp:399`), and a run that never reaches the
kernel's terminal update is reported as cancelled with an empty result
(`src/graph_runner.cpp:398–401`). Output updates streamed during the grace
period can arrive in a different order than they would without the slices,
but no completed result depends on that order. The existing QuickJS interrupt handler stays as the
backstop for a single JavaScript job that runs past the deadline
(`src/graph_runner.cpp:139–147`).

This is a documented native ordering contract. In normal mode it matches
JavaScript's rule that microtasks drain before macrotasks. It does not
claim complete Node.js event-loop parity, because Node.js orders timers and
I/O callbacks in separate phases. Inline determinism covers only jobs
executed inline. Retained embedder completions and external I/O arrival
order are not deterministic.

### 4.6 Run exit rules

Use a mutex-protected `CancelState` with run generation, requested flag,
optional steady-clock deadline and immediate flag. `cancel` sets requested
and the grace deadline in one critical section. Repeated requests preserve
the earlier deadline. Destructor-driven `interruptNow` publishes requested,
immediate and deadline equal to now in the same critical section. Snapshot
under this mutex at every scheduling boundary, then unlock before forwarding
stop or waking the loop. Forwarding once does not prevent later deadline
shortening. Ignore snapshots for another run generation.

This replaces publication of the flag before its deadline
(`src/graph_runner.cpp:523–528`) and the separate relaxed reads
(`src/graph_runner.cpp:361–368`).

In cancellation mode, check forced exit before every resumed step, timer,
completion dispatch, microtask, and wait, and immediately after each
returns. At the deadline, stop draining microtasks and return. During the
cancellation grace period, bounded microtask slices let guest cleanup
unwind. Normal mode checks the cancellation snapshot before each step and
each macrotask, and switches to cancellation mode when it sees one. When the root task is done,
return without awaiting unrelated jobs. Otherwise return as stalled only
when ready work, microtasks, timers and external work are all absent.

Wait until the earliest timer or cancel deadline, or indefinitely when only
external work remains. Preserve the sticky `woken_` predicate under the wake
mutex (`src/kernel/task.cpp:99–114`). Consume it only inside the wait
protocol. Delivery before wait registration must cause an immediate return,
even when no timer exists. No cancellation or mailbox lock is held while
waiting. These bounds apply between returning scheduling units, not inside
remaining synchronous native calls or inline execution.

### 4.7 Budget

The admission ledger is `native/jobs/include/nodetool/jobs/admission.h`. It
is an owned object, not process state. An embedder creates one with `newAdmissionLedger` and passes
it in `HostOptions::admissionLedger` to every runner that should share its
limits. A runner given none creates a private ledger with the default
limits. Each GraphRunner opens a runner account on its ledger, and each run
a run account, which the run's `RunTag` carries to its context calls and
provider jobs. Accounts, reservations and JavaScript charges hold the ledger
through shared ownership, so it outlives every charge without a global.

One ledger mutex protects ledger, runner and run counters in one
transaction. Default hard limits are 4 GiB and 256 admitted operations per
ledger, and 1 GiB and 64 admitted operations per run. The ledger's creator
may lower its limits, and `HostOptions::hostJobLimits` may lower a runner's
run limits. An operation larger than either byte limit rejects. There is no
oversized solo exception. Below, "process" means the ledger, which spans the
process when every runner shares one.

Before copying on the worker, reserve snapshot bytes. The reserving
`snapshotBytes` and `snapshotString` (`src/kernel/job_inputs.h`) do this. A
string reserves three bytes per UTF-16 unit, the most its UTF-8 text needs,
and gives back the rest after the copy. Deferred snapshots have additional
limits of 64 MiB and 1024 entries per run and 256 MiB and 4096 entries per
process. These bytes also count against the main byte limits. If reservation
fails, reject before copying. Copy buffers, overlay buffers, serialized
options and pixel data at submission. Reject detached inputs. Never defer
references to mutable JavaScript input storage.

Each run keeps a worker-owned FIFO of deferred starts. A start is admitted at
submission only when that FIFO is empty. On FIFO admission, recompute the
job's `cost()` from its snapshot, with checked arithmetic for dimensions and
output bounds. Reserve queue slot, worst-case output and known workspace
bytes before enqueueing. Unknown output sizes require a hard cap, enforced
before each allocation or append. Exceeding the reserved cap fails the
operation. A file changing after stat must not bypass its cap. Deferred
entries have no executor slot until admitted.

Deferred snapshots drain only through admission, so they must never leave
their own FIFO head too little room. A start is deferred only when, once
admitted work has drained, the deferred snapshots including its own leave
room for the deferred start that needs the most beyond its snapshot, in its
run and in the process. Otherwise it rejects. As a backstop, a head whose
recomputed cost cannot fit beside the deferred snapshots queued behind it
rejects instead of waiting forever. Provider uploads are retained input
that only the guest releases, by starting or retiring them. A queued start
that is blocked while no operation runs and every other charged byte is
deferred or retained, in its run or in the process, can never be released
by a drain, so it rejects too, at submission or at the retry after the last
drain. Removing deferred starts, such as at cancellation, makes the run
retry its new head, since a removed start's release may report nothing.

A run blocked by process capacity takes a turn. Queued admissions of other
runs wait behind the earliest turn, so a stream of small starts cannot
starve a large one. A run blocked by its own limits holds no turn. Released
capacity and released turns are reported to every waiting run after the
ledger mutex is unlocked, through the run's mailbox wake. The loop admits
deferred starts when it asks for completions, before it decides to wait.
Provider job starts are synchronous and cannot wait, so they admit at once
or fail.

One movable reservation spans queueing, running and mailbox retention.
Execution completion does not release it. Disposal releases it. Worker
drain releases it only after conversion and native payload disposal. For
zero-copy JavaScript buffers, atomically transfer the payload charge into a
separate JavaScript external-byte ledger before releasing the native charge.
That ledger has per-runner and process caps of 1 GiB and 4 GiB and releases
on buffer finalization. Copying conversion reserves both representations
until the native copy is gone. Ledger exhaustion rejects conversion.

A converter hands bytes to JavaScript through `ResultConversion`.
`adoptBytes` uses `Engine::adoptBytes`, a Uint8Array over an ArrayBuffer
that owns the native bytes and their charge and releases both when it is
finalized or detached. A transfer to another length moves the charge with
the bytes, but the charge never drops below 64 KiB. Results under 64 KiB are
copied instead. The 4096-view limit of
`Engine::externalArrayBuffer` stays for WebAssembly memories, which remain
rooted until the engine is destroyed so the host can detach them. Adopted
result buffers are not rooted and are collected like any buffer, so they
do not count toward that limit. The JavaScript caps bound their bytes, and
the 64 KiB minimum charge bounds their number to 16384 per runner, also
after a transfer shrinks one.

An asynchronous context call reserves its request and the context payload
limit as its response cap. Its completion state shares the reservation with
the result, so a call that settled Stopped while the embedder still holds
its completion stays charged until the completion is gone. A response larger
than the cap is dropped on arrival and rejects as too large. An error
message larger than the cap, from the completion or thrown by the callback,
is replaced by a diagnostic that fits the cap: a header with the size and
up to 256 bytes of the message, or for a smaller cap a short fixed text cut
to the cap. A provider job
reserves its request, `ProviderJobs::Limits::maxResultBytes` for its result
and progress events, and one operation slot. A progress event that does not
fit that cap with its envelope is dropped, whether it would be queued or
handed to a waiting `next`. Upload parts are charged as they arrive, and an
upload stays registered until a start that names it has passed every
check.

Cancellation drops deferred snapshots and removes queued jobs. Running jobs
and closed-mailbox results keep their reservations through disposal. Thus
abandoned runs continue to exert process-wide backpressure. Tracker counts
are completion accounting, not admission control. Ledger locks never nest
with lane, mailbox or resource locks.

### 4.8 Resource leases

Each converted host must enumerate the complete dependency graph in its
implementation review. The required inventory includes these dependencies:

| Host | Dependencies and effects |
|---|---|
| Files and assets | Open descriptors, confined roots, parent directories, temporary files, destination identity and published writes remain owned. Explicit file close currently closes immediately (`src/host/files.cpp:417–421`) and run cleanup closes handles (`src/host/files.cpp:377`). |
| Media | Inputs, packets, frames, codecs, format contexts, filters, encoders, policy and output files remain owned. Explicit close, finish and abort currently erase entries (`src/host/media.cpp:820–858`). |
| Track staging | Temporary directories and files need leases from every reader and encoder. Run cleanup currently removes directories (`src/host/sandbox_av_tracks.cpp:90–96`). |
| Images and canvas | Source bytes, overlay bytes, lazy image graphs, pixel snapshots and output buffers remain owned. |
| HTTP and callbacks | Transfer handles, response storage, grant owners and cancellation state remain owned. |

Use a resource control block with mutex, Open/Retiring/Retired state,
FIFO, active operation, lease count and dependency leases. Acquisition and
queue insertion happen atomically under that mutex. No new operation can
enter after retirement. Submit to a lane after unlocking. Completion clears
the active slot under the mutex and schedules the next operation outside it.

Explicit close or finish changes Open → Retiring and inserts a terminal
barrier after accepted operations. Those operations complete in order.
Finish publishes its output only after preceding writes succeed. Abort or
run cleanup changes to Retiring, discards queued operations, requests stop
on the active operation outside locks, and schedules destruction after it
returns. Abort can supersede a queued finish. An executing finish may already
have committed, and cancellation cannot undo that persistent effect.
Retired means the terminal action completed and all leases were released.
Dependents release before staging-directory cleanup. Never recursively take
dependency locks. Schedule cleanup after releasing the resource mutex.

Off-thread destruction safety is unresolved for each wrapper, including
VipsImage, AVCodecContext, AVFilterGraph, input/encoder wrappers, transfer
handles and file/staging wrappers. Each conversion requires authoritative
library evidence and a wrapper ownership audit. Tests cannot establish a
library's threading contract. Unsupported destruction must use an approved
owner lane whose lifetime is included in shutdown, or remain synchronous.

Asset writes additionally use an exclusive unique temporary file per
operation in the destination directory, created with O_EXCL and no-follow
protection. The current PID-only temporary path and O_TRUNC are unsafe for
concurrency (`src/host/assets.cpp:116–132`). A process-wide destination queue,
keyed by confined canonical destination, serializes write commit and removal
across runs. Accepted commits occur in queue order. Readers see a complete
old or new file. Different processes have atomic last-successful-rename
semantics, with no cross-process ordering promise. Each operation unlinks
only its own temporary file on failure. Cancellation before commit discards
the write. Commit is the rename linearization point and is not rolled back
by later teardown. Revalidate confinement at commit and retain parent access
through completion.

### 4.9 Cancellation

Persistent media inputs retain a policy in their interrupt callback
(`src/host/media.cpp:134–150`), and filters and encoders also retain policy
(`src/host/media.cpp:248`, `src/host/media.cpp:361`). Do not bind such policy
to a temporary operation's stack or stop token.

A session owns a stable stop bridge with atomic sessionStopped and
operationStopped flags. Its serial executor sets the active operation id,
resets operationStopped and registers that operation's stop callback before
entering the library. The callback only sets operationStopped. On return,
destroy the callback outside all locks before resetting the flag or starting
the next operation. Retirement sets sessionStopped permanently. Library
interrupt callbacks read the OR of these flags. A cancelled operation that
may leave codec state unusable retires the session and rejects its queue.

Run stop callbacks only set atomic flags or issue a non-blocking wake. They
never call library functions, acquire resource locks or wait. Because stop
requests can execute callbacks synchronously, request_stop runs outside all
mailbox, executor, cancellation and resource locks. Destruction of callback
registrations also occurs outside those locks.

Use token checks between file chunks, packets and frames, and library I/O
interrupt hooks where documented. Cross-thread `vips_image_set_kill` safety
and boundedness remain unresolved offline. Do not enable that hook until
authoritative evidence permits it. Without it, native evaluation may finish
late, while mailbox closure still prevents access to the departed run.

### 4.10 Teardown and engine reuse

The worker requests stop outside locks, closes the mailbox, clears settlers
and deferred starts, clears timers and abandons suspended frames, then
retires resources before resetting or reusing the engine. The old mailbox
never acquires a new wake target. Jobs contain no frame or promise reference,
so the reviewed removal of the abandon race remains intact.

Shutdown uses shared `RunnerState`, `RunnerTracker` and `ExecutorState`, not
raw runner captures. Tracker tickets identify runner and run and notify a
condition variable on release. Stop admission first, discard queued jobs
under their queue locks, request active stop outside locks, and wait on the
tracker and worker-exit notifications until a steady-clock deadline.
Join only threads whose exit has been confirmed. A join is never the timed
wait. Existing unconditional joins occur in `src/graph_runner.cpp:422–436`
and `src/provider_jobs.cpp:50–64,195–207,224`.

`shutdown(deadline)` returns Complete or TimedOut with a shared shutdown
handle. On timeout a process-owned supervisor retains executor state,
runner state, joinable thread objects, callbacks and dependencies. The
public runner can disappear only after raw captures have been removed.
The caller must retain the supervisor and either retry shutdown or explicitly
terminate the process. Library and GUI destructors never call quick_exit.
The CLI may explicitly choose process termination. A timed-out supervisor
must not be destroyed by normal static teardown while its threads run.
This can retain memory indefinitely and is a documented embedding contract,
not a bounded process-exit guarantee.

## 5. Interfaces

### 5.1 Guest modules

Add async native bindings for promise-returning sharp, media, fs/promises,
asset and HTTP operations. Keep synchronous variants for synchronous APIs.
Canvas `toBuffer` stays synchronous (`guest/host/canvas.mjs:232–239`).
`encode` currently delegates to it (`guest/host/canvas.mjs:241–244`) and will
instead snapshot pixels at submission and use the CPU lane.
`convertToBlob` also uses toBuffer today (`guest/host/canvas.mjs:246–254`)
and will await the async encode path.

The shared encoder audit found direct guest calls in canvas, the async
`encodeRgbaToPng` helper (`guest/host/image.mjs:23–25`) and frame extraction
(`guest/host/sandbox-av-native.mjs:263–271`). Convert the latter two to the
async binding. Retain the synchronous binding for canvas and Fabric
`toDataURL`, which calls toBuffer (`guest/host/sandbox-fabric.mjs:54–55`).
The review's canvas line 248 names convertToBlob, not toDataURL.

### 5.2 Embedder callbacks

Add `asyncOperations` beside synchronous operations. An async callback takes
an owned request string, stop token and move-only `ContextCompletion`.
A completion carries shared state containing a mutex, Pending/Value/Error/
Stopped outcome, callback owner, reservation, external-work ticket, stop
bridge and mailbox. No JavaScript value is stored there.

Callback return does not finish the operation. Today the synchronous return
is consumed immediately (`src/host/context.cpp:60–63`). Retained completion
state remains external work until done, throw or explicit cancellation wins
the Pending transition under its mutex. Move the result out under the mutex
and deliver outside it. First terminal transition wins, including done
followed by throw. Later results are disposed. A moved-from completion has
no state and its destructor does nothing. Destroying an unused valid
completion transitions Pending → Error for a missing completion.

Cancellation can settle Stopped immediately but cannot falsely release
memory still used by external work. Retain owner, stop bridge and reservation
until the callback invocation and every retained completion lease end.
After terminal delivery the external-work ticket ends, while the tracker
and budget ticket remain until physical disposal. A completion retained
forever therefore consumes bounded capacity and appears in shutdown.

Embedder captures must own their dependencies or provide an owner object
whose lifetime spans every retained completion. Raw runner captures such as
those in `src/graph_runner.cpp:170–179` cannot migrate unchanged.

Reject names in both maps. `has` checks both. One worker-owned enforcement
path handles both transports: grant lookup, shared call count, request and
response byte limits, cancellation and the provider close cleanup exemption.
The existing checks are at `src/host/context.cpp:49–62`. Cleanup exemptions
do not bypass payload or memory limits. Filter provider: and prediction:
entries from both maps in fake mode. The current filter handles operations
only (`src/host/capabilities.cpp:54–60`), while fake mode promises no provider
grant, secret or network access (`include/nodetool/graph_runner.h:74–77`).

### 5.3 Provider endpoint jobs

Use shared provider state and jobs. Each job has a mutex, durable
Running/Finished/Stopped/Closed state, bounded progress queue, result parts,
terminal result and optional single waiter. Keep stopped/closed tombstones
until run disposal. Closed but executing jobs retain a maxJobs ticket until
the producer actually exits. Closing cannot create new capacity prematurely.

Every next checks Stopped/Closed first and rejects AbortError. Otherwise it
consumes progress FIFO, then result parts, then the terminal result, or
registers one waiter. A second waiter rejects. Production and registration
use the same mutex. Stop clears queued progress and unconsumed results,
changes state and moves the waiter out under the mutex. Complete the waiter
and request stop outside the mutex. A previously removed delivery wins its
own race and cannot be retracted. Every later next sees cancellation.
Finished becomes Stopped on cancellation unless its terminal result was
already consumed. A consumed terminal result is stable until close, which
makes later calls fail as closed.

The producer ignores late output in Stopped/Closed state and releases its
execution ticket on exit. Registry lookup releases the registry mutex before
taking a job mutex. Never deliver into a mailbox under either lock.
The current poll reads queued output under the job mutex
(`src/provider_jobs.cpp:166–188`), while close removes the entry and joins
(`src/provider_jobs.cpp:195–207`). Replace both paths with this protocol.
The guest removes its abort listener in finally and closes idempotently.

### 5.4 Synchronous paths that stay

Retain SQLite, canvas drawing, canvas toBuffer and node:fs synchronous APIs.
Their execution time remains outside the cooperative deadline guarantee.
Small synchronous operations are not assumed to have bounded latency merely
because their inputs are small.

### 5.5 GPU readback

No GPU completion thread or polling removal is included. A future design
must independently establish library threading and resource ownership rules.

## 6. Error handling

Values resolve, native errors reject Error, and cancellation rejects
AbortError while the registry remains live. Admission and byte-cap failures
reject before unreserved allocation. After teardown, results are disposed
without settlement. Persistent writes already committed remain visible even
when their promise is discarded. Retrying such work requires application
idempotency, not an assumption that cancellation rolled it back.

## 7. Testing

Tests verify the proposed contracts, not undocumented library guarantees.
The rollout table assigns each test to the component that introduces it.
Use controlled barriers to force races and verify exact disposal and budget
release counts. Inline ordering tests assert the native contract. External
completion tests explicitly allow nondeterministic arrival order. Compare
final outputs with existing examples without claiming full Node.js ordering.

## 8. Rollout

| Step | Component | Required gate |
|---|---|---|
| 1 | Mailbox, registry, cancellation snapshot, scheduling rounds, runner tracker and inline bridge. | Test deliver/close races, abandon and engine reuse, wake before and during waits with no timer, coherent cancellation publication, immediate interruption, deadlines with continuously ready steps and microtasks, completion K1/K2 ordering, timer and result alternation under a full mailbox, complete microtask draining before every timer and result in normal mode, unchanged parity and examples baselines with no cancellation, the switch to bounded slices on cancellation, done and stalled exits, and worker ownership assertions. |
| 2 | Pools, submission snapshots and shutdown supervisor. Snapshots copy inputs at submission. Step 7 reserves their bytes before the copy. | Test that inputs are copied at submission so later guest mutation cannot reach a job, queued cancellation, inline responsiveness limits, and shutdown timeout without joining live threads or invoking process exit. |
| 3 | Async context transport and shared grant enforcement. | Test retained done, move destruction, missing done, double done, done/throw/cancel races, retained work across teardown, owner lifetime, and shared limits. Attempt async provider and prediction grants in fake mode and assert no grant, secret or network side effect. |
| 4 | Provider next and durable terminal states. | Test registration/production races, repeated next after stop/close, cancellation versus queued progress/parts/terminal results, second waiter rejection, closed-but-running maxJobs pressure and abort-listener removal. Remove provider polling only here. |
| 5 | Resource retirement, destination serialization, image/media/files/assets/HTTP and async canvas conversion. | Require authoritative threading evidence and wrapper ownership audits per host before enabling it. Test serial session token rebinding, finish/abort/close races, staging cleanup dependencies, overlapping same-key asset writes including across run teardown and separate processes, commit cancellation, snapshot isolation and synchronous canvas compatibility. Verify each converted host's outputs and failure disposal. |
| 6 | CLI and editor adoption of async grants. | Audit captures and shutdown ownership, exercise retained completions while destroying the public runner, validate examples in inline and threaded modes, and document each embedder's explicit timeout policy. |
| 7 | Admission ledger, deferred-start FIFO and JavaScript external-byte ledger (§ 4.7). Every job of `AsyncRun::submit`, inline or on a lane, every asynchronous context call and every provider job holds a reservation. | Test deferred mutation, detach and resize after submission, revalidation and overflow, cross-run and cross-runner pressure, result retention until disposal or drain, abandoned runs holding backpressure, JavaScript transfer charges and their release on finalization, conversion rejected on ledger exhaustion, cancellation of deferred starts, oversized operations, inline accounting, the context and provider paths, and that no ledger lock is held while a lane or mailbox lock is taken. |

ThreadSanitizer supplements race tests when the relevant component lands.
It cannot replace authoritative evidence for cross-thread libvips operations
or wrapper destruction. If evidence is unavailable, keep that host path
synchronous or disable its optional interruption hook. GPU work is excluded.

## 9. Risks

- R1. Alternating timers with results changes macrotask interleaving in
  normal mode. Bounded slices change microtask interleaving, but only in a
  run that is being cancelled. Tests pin both contracts and do not imply
  full Node.js parity.
- R2. Hard caps can reject workloads previously admitted. Snapshot copies
  increase submission cost. A provider job's result cap, 64 MiB by
  default, fails larger downloads. Library-internal allocations, and the
  memory an embedder callback or provider worker allocates before handing
  its result over, remain outside byte accounting and require separate
  quotas or process isolation.
- R3. A retained callback or uncooperative codec can hold capacity forever.
  The shutdown supervisor makes ownership safe but cannot reclaim executing
  work or guarantee normal process exit.
- R4. Library threading and destruction contracts remain unresolved until
  authoritative evidence is recorded per converted host. A successful stress
  test does not resolve them.
- R5. Persistent effects can commit immediately before cancellation.
  Cross-process asset writes have last-rename semantics, not submission order.

## 10. Alternatives and later work

stdexec remains deferred. Reconsider it if native kernel code needs to
compose asynchronous operations, while retaining the mailbox and ownership
protocol. GPU completion, process isolation for uninterruptible libraries,
and tighter accounting for library-private allocations need separate designs.
No framework or library thread-safety claim is required for this decision.
Review findings left open after the host conversions are in the
[backlog](graph-runner-async-host-backlog.md).

## 11. Changes from review

Revisions 1 and 2 were reviewed. This revision preserves the accepted mailbox
lock order and the separation between native jobs and abandoned frames.

| Finding | Change |
|---|---|
| F17 | Section 4.8 specifies unique exclusive temporary files, destination serialization, commit semantics and cross-run ownership. Step 5 tests collisions and teardown. |
| F18 | Sections 4.5–4.6 bound microtask slices and check deadlines at each scheduling boundary once a run is being cancelled. Goals and synchronous-path rules narrow responsiveness claims. |
| F19 | Section 4.6 publishes a coherent cancellation snapshot, defines immediate destruction deadlines and preserves sticky wake behavior without timers. |
| F20 | Section 4.5 dispatches results only at the macrotask point, after ready steps and microtasks are exhausted, and alternates timers with results. It limits determinism and removes the Node.js ordering claim. |
| F31 | Section 4.5 splits scheduling into normal and cancellation modes. Normal mode drains microtasks completely and fires timers only when no step is ready, as today. Bounded slices apply only after cancellation. G7, R1 and the step 1 gate match. |
| F21 | Section 4.7 reserves queue, execution and result memory across teardown, separately accounts JavaScript bytes and bounds process-wide admission. Step 7 implements it. |
| F22 | Section 4.7 snapshots at submission, bounds deferred bytes and revalidates cost at admission. Steps 2 and 7 test mutation, detach and resize. |
| F23 | Section 5.2 specifies shared completion ownership, physical accounting lifetime, moved-from destruction, first-terminal precedence and embedder capture requirements. |
| F24 | Section 4.8 inventories dependencies and persistent effects and unifies close, finish, abort and run cleanup through retirement and serialization. Destruction evidence remains a per-host gate. |
| F25 | Section 4.9 separates session and operation stop state, safely rebinds the active serial operation and restricts synchronous stop callbacks. |
| F26 | Section 5.3 defines durable stopped/closed state, waiter delivery outside locks, output precedence, live capacity retention and listener removal. |
| F27 | Section 5.2 filters both grant maps and shares enforcement. Step 3 includes fake-mode async boundary tests. |
| F28 | Section 5.1 preserves synchronous toBuffer and Fabric toDataURL, converts encode and identifies other direct encoder callers. |
| F29 | Section 4.10 specifies runner-owned tracking, completion notifications, timed waiting, exited-thread joins and retained supervisor ownership without implicit quick_exit. |
| F30 | Section 8 assigns tests to introducing components, requires authoritative library evidence and excludes GPU completion work from G6 and rollout. |
