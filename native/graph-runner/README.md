# nodetool-graph-runner

A C++ workflow runner for NodeTool graphs. The kernel (graph analysis,
inboxes, actors, routing, messages) is C++. Node bodies are the existing
TypeScript node classes, bundled from the packages' `dist/` and run inside an
embedded QuickJS-ng engine. This is prototype phase A1: it runs the fixtures in
`tests/graphs/` and emits the same `ProcessingMessage` stream as the
TypeScript runner.

## Build

Needs CMake 3.28+, a C++20 compiler, Node 24 and the repository's built
`packages/*/dist`. CMake fetches QuickJS-ng (commit
`d7215b0ad3fc2c562e8317fd9bca058fd4863804`, v0.18.0), nlohmann/json 3.11.3,
the SQLite 3.53.2 amalgamation and the sqlite-vec 0.1.9 amalgamation, the
last three pinned by SHA-256. SQLite is the version better-sqlite3 12.11.1
bundles and builds with its compile options, and sqlite-vec the version the
`sqlite-vec` npm package ships.
stb_image (commit `d14d46f6b44456eb88beac58cba833a4135d4c89`) and the prebuilt
wgpu-native v29.0.1.1 for the platform, each pinned by SHA-256
([`cmake/host-image-gpu.cmake`](cmake/host-image-gpu.cmake)).

Configuration also requires ICU development libraries, the
[image adapter dependencies](#native-image-adapter-dependencies), the
[libav development libraries](#native-media), Tesseract 5.5.3 and Leptonica
1.80 or newer. [Canvas](#headless-canvas-2d) needs Cairo, Pango and Fontconfig.
CMake fetches the SHA-256-pinned Wasmtime 29.0.1 shared C API on Linux x86_64
and on macOS arm64 and x86_64. Other platforms must supply its matching distribution through `WASMTIME_ROOT`.
See [runtime library staging](#runtime-library-staging) before distributing a build.

```bash
cd native/graph-runner
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j8
node guest/build.mjs                       # writes build/guest.js
node guest/host/gpu-catalog.mjs build/gpu-catalog.json   # shader catalog for the gpu tests
./build/nodetool-graph-runner compile --bundle build/guest.js --out build/guest.bin
ctest --test-dir build --output-on-failure  # kernel, host, library, SQLite, environment and GPU
```

`gr_sqlite_tests` also runs the better-sqlite3 wrapper tests when CMake finds
the repository's `node_modules/.bin/esbuild`, which bundles them at build time.

`-DNODETOOL_GRAPH_RUNNER_GPU=OFF` builds without wgpu-native. The WebGPU
image nodes then fail with "WebGPU is not available: this native runner was
built without GPU support". Platforms without a pinned wgpu-native build
(anything but Linux x86_64/aarch64, macOS and Windows x86_64 MSVC) get the
same build.

`cmake --build` does not rebuild `build/guest.js` or `build/guest.bin`. After
a change to the guest or to a node package, run `node guest/build.mjs` and then
the `compile` command above.

`guest.bin` is QuickJS bytecode. It starts with a 40-byte header: the magic
`NTGRBC1`, the QuickJS version string (24 bytes, NUL padded) and an FNV-1a 64
hash of the bytecode that follows. A load fails with a message that says to
rebuild `guest.bin` when the version differs, the hash differs or the header is
cut short. Recompile after changing the engine pin, and after this change from
a script bundle to a module bundle. The compile step strips source text, so
`fn.toString()` on a bundled function returns a placeholder.

`guest/build.mjs` also writes `build/guest.assets/`. It holds the resources
the bundle reads on first use: the timeline fonts, the tiktoken ranks, the
legacy text encoding tables and the Rapier WebAssembly module. The runner
grants `<dir>/<stem>.assets/` next to the bundle by default
(`HostOptions::bundleAssetsDir`), so ship the directory with `guest.js` or
`guest.bin`. `compile` also writes `guest.assets/types.json`, the node type
snapshot. With it, a load evaluates the node modules outside core when one
of their types is first used. A rebuild of `guest.js` removes the snapshot,
and the next load evaluates every module until `compile` runs again.

## Run

```bash
./build/nodetool-graph-runner run --bundle build/guest.bin \
  --graph tests/graphs/repeat-collect.json [--params '{"n": 42}'] [--repeat 3] \
  [--workspace <dir>] [--read-root <dir>]... [--asset-dir <dir>] \
  [--secrets <file.json>] [--allow-http] [--allow-media] \
  [--sqlite-dir <dir> [--models-db <file>]] [--package-assets <dir>] [--fake-providers] \
  [--host-threads <n>]
```

These options set the host grants described in
[What node code can reach](#what-node-code-can-reach). Without them node
code reaches no file, secret or network. `--workspace` creates the directory
when it is missing, and `--secrets` reads a JSON object of key to value.
`--allow-media` sets `allowMedia` without encoders, so node code can probe
and decode media in the workspace but not encode it. `--models-db` names a
model database file inside `--sqlite-dir`. With `--asset-dir` it lets
`context.createAsset` save media outputs. `--package-assets` sets
`packageAssetsDir`, and `--fake-providers` sets `fakeProviders`.
`--host-threads <n>` gives each process lane `n` threads (see
[Native jobs and lanes](#native-jobs-and-lanes)), and `--host-threads 0` runs
native jobs inline on the runner thread. After the last run the CLI destroys
the runner and gives the lanes 2 s to finish. If a lane thread is still
running a job then, the CLI prints a warning and exits with
`std::quick_exit` and the run's exit status, so static destructors never run
under a live job.

To run an example workflow offline with its shipped sample media and canned
provider output (the parity bundle admits provider nodes, and empty model
fields need a provider id such as `fake-<node id>`):

```bash
./build/nodetool-graph-runner run --bundle build/parity/guest-parity.bin --graph <graph.json> \
  --allow-media --fake-providers \
  --package-assets ../../packages/base-nodes/nodetool/assets \
  --asset-dir <dir> --sqlite-dir <dir> --models-db models.sqlite
```

`parity/examples.mjs` runs every shipped example this way and keeps a
baseline. See [Example workflows](parity/README.md#example-workflows).

Every kernel message goes to stdout as one JSON line, with `job_id: "job"` and
`workflow_id: "wf"`. The CLI grants the GPU capability. `--no-gpu` runs
without it. Logs go to stderr. The job summary that the library sends
after the terminal `job_update` is printed only with `--job-summary`, so the
default output stays comparable with the TypeScript kernel. The exit status is 0 when the job
completed, 1 when it failed or was cancelled, and 2 on a usage error.
`--bundle` accepts `guest.js` or `guest.bin`. The CLI runs through the
library API below, so the conformance check covers the code path the node
editor uses.

To compare against the TypeScript runner, from the repository root (the
reference first hydrates each fixture the way the server prepares a
`run_job_request` graph):

```bash
node native/graph-runner/tools/conformance.mjs \
  --runner native/graph-runner/build/nodetool-graph-runner \
  --bundle native/graph-runner/build/guest.bin
```

## Library

`nodetool_graph_runner` is a static library with one public header,
[`include/nodetool/graph_runner.h`](include/nodetool/graph_runner.h).
`gr::GraphRunner` starts a worker thread that loads the bundle in the
background and keeps that context for every run. Hosts check `ready()` and
`canRun(graph)`, then `submit()` a job. Jobs run one at a time in submission
order, and each ProcessingMessage reaches the job's handler as a JSON string
on the worker thread. Every job gets one `job_update` whose status is
`completed`, `failed` or `cancelled`. As on the server, a run that collected
outputs then sends a second `job_update`, the job summary, whose
`result.outputs` holds the values of every node without outgoing data edges,
keyed by node name. The handler's `last` argument marks the job's final message.
`tools/ts-reference.mjs --job-summary` prints the server's summary for comparison.

`cancel(jobId)` drops a queued job or ends a running one the way
`WorkflowRunner.cancel()` does: inboxes close, actors stop starting work,
generators stop at their next frame, and the run reports `cancelled`. The
run then gets 500 ms to unwind. The loop runs it in bounded slices and
returns at that deadline even while steps or microtasks stay ready, and the
engine's interrupt handler stops a JavaScript job still running then. A run
that stalls, ends at the deadline, throws out of the scheduler, leaves
suspended coroutines behind, or was interrupted leaves the context in an
unknown state. The worker then destroys the run's coroutine frames, discards
the engine, and loads a fresh one. The process keeps running in every case.

`updateNodeProperties(jobId, nodeId, propertiesJson)` hands a live property
change to the running job, as the server's `update_node_properties` command
does. Any thread may call it. The call queues the change, and the worker
applies it as a macrotask of the run, between two steps. The node instance
takes the values through `applyProperties`, so a `run()` that reads its
properties for each block uses them from its next block. A buffered node
takes its saved properties again at each `process()` call, as on the server.
The call returns false for a job that is not running. A node that is unknown
or takes no live change drops it.

Before a run, `src/kernel/normalize.cpp` prepares the graph as the server
does: saved `data` becomes `properties`, `dynamic_properties` merge in,
edges get `edge_type`, and each node is hydrated from the guest's registry
entry (title as default name, property and output types). Comment and Group
nodes, and nodes of unknown type, are dropped with their edges, as on the
server. A Group's child nodes still run.

## SQLite

Node code that imports `better-sqlite3` or `sqlite-vec` runs on SQLite and
sqlite-vec compiled into the runner, so `@nodetool-ai/models` and
`@nodetool-ai/vectorstore` load and run unchanged. The `sqlite` host capability
([`src/host/sqlite.h`](src/host/sqlite.h)) opens databases, prepares and steps
statements and loads the built-in sqlite-vec. Its guest half,
[`guest/host/sqlite.mjs`](guest/host/sqlite.mjs), implements the better-sqlite3
API the repository uses: `Database` with `prepare`, `exec`, `pragma`,
`transaction` (with its variants and savepoint nesting), `loadExtension`,
`defaultSafeIntegers` and `close`, and statements with `run`, `get`, `all`,
`iterate`, `pluck`, `raw`, `expand`, `safeIntegers`, `bind` and `columns`.
Values convert as in better-sqlite3: numbers bind as REAL, BigInts as INTEGER
and typed arrays as BLOB. INTEGER columns read as numbers, or as BigInts in
safe-integer mode. BLOBs read as `Buffer` when the guest has one, otherwise as
`Uint8Array`. SQLite errors throw `SqliteError` with the result code name in
`code`. Custom functions, aggregates, virtual tables, backups and serialization
throw an error naming the missing method.

Rows and expanded table groups use own data properties, including names such
as `__proto__`. Unlike better-sqlite3, an expanded table with that name does
not replace the row prototype. Column metadata refreshes after SQLite
recompiles a prepared statement following schema changes.

Database files live only in `HostOptions::sqliteDirectory`
(`--sqlite-dir <dir>` on the CLI). Relative paths resolve inside it, and a path
that leaves it through `..` or a symbolic link is refused. A sandbox VFS checks
every file SQLite opens, deletes or probes, so `ATTACH` and `VACUUM INTO`
cannot leave the directory either. Without the option, only in-memory and
anonymous temporary databases open. The guest's `@nodetool-ai/config` shim
places the default NodeTool and vector store databases in that directory, or in
memory when there is none. Loading any extension other than sqlite-vec is
refused, and SQLite's `load_extension()` is compiled out.

## Architecture

`src/js/engine.h` is an engine-neutral interface shaped after React Native's
JSI: values, objects, calls, host functions, promise capabilities, and draining
the job queue. `src/js/quickjs_engine.cpp` is the only file that includes
QuickJS headers. The kernel talks to JavaScript through the interface alone.

The guest (`guest/entry.mjs`) imports the core node modules (`constant`,
`control`, `input`) and exposes `globalThis.__nodetool`: `describe` returns the
class flags the kernel hydrates descriptors with, `validate` runs the registry's
property and platform validators, `create` mirrors `NodeRegistry.resolve()`, and
`call`, `genStart`/`genNext` and `run` invoke `process`, step `genProcess`, and
run `run(inputs, outputs)`. Streaming inputs and outputs inside the guest call
back into `globalThis.__host`, which the kernel installs. Values cross the
boundary as JSON text. The bytes of a node value do not travel in that text.
The guest hands each `Uint8Array`, `Buffer`, `ArrayBuffer`, typed array and
`DataView` to the kernel with one copy (`__host.blob`), and the text holds a
`{"__blob__": <index>}` marker in its place (`guest/values.mjs`,
`src/kernel/wire.h`). The kernel keeps the bytes as a `Blob`, the binary type
of its JSON values (`src/kernel/blob.h`). The edges, inboxes and messages of
one output share one blob, and the last of them frees it. Each node that
reads the value gets a new buffer with one copy, of the type the producer
returned, so a node may change its input and no other reader sees the change.
A value with an object that has a `__blob__` key of its own travels as
base64. Messages a host receives, the durable journal and the result cache
carry bytes as `{"__bytes__": "<base64>"}`, with `"__typed__"` for a type
other than `Uint8Array` and `"__buffer__"` for a `Buffer`. The guest's host
calls (context operations, `postMessage`) and run parameters use that form
too.
`guest/build.mjs` bundles the guest with esbuild as one self-contained ES
module. The [module contract](guest/host/README.md#the-module-contract)
(`guest/module-contract.mjs`) declares what replaces
`@nodetool-ai/{runtime,storage,config,kernel}`, the Node builtins, the
packages a host capability provides and the native packages: each export
node code imports is the real package code, a guest module, a host
operation, or unavailable with a reason. The build fails when the bundle
imports a name the table does not classify or the table disagrees with a
provider, and it writes `<bundle>.node-requirements.json`, the unavailable
exports each node type reaches. The runner evaluates the bundle as a module,
from source or from module bytecode,
so node code may use top-level await. `Guest::load` runs the loop (jobs and
timers) until the module's evaluation promise settles, and fails the load with
the module's error when it rejects or never settles.

The default bundle holds every module of the base node library but runs only
the node types `guest/local-nodes.mjs` admits: every class of the core workflow
modules, and the nodes `parity/baseline.json` records at parity on a success
path, except nodes that keep state in SQLite, and except node types whose code
reaches an unavailable export of the module contract. A graph with any other
node is unsupported, so the node editor sends it to the server. In every
bundle, a graph with a node of the last kind fails validation before any node
runs, with a message that names the node, the export and the reason. `--profile core` builds
only the core workflow modules into `build/guest-core.js`.

The kernel in `src/kernel/` ports `packages/execution-core/src/{runner,actor,
inbox,io,correlation-analysis}.ts`. Scheduling is cooperative and
single-threaded. `Task<T>` is an eagerly started C++20 coroutine, so it behaves
like a JavaScript async function, and awaiting one resumes from a FIFO ready
queue. After every resumed step the loop drains the QuickJS job queue, and guest
promise settlements post the waiting coroutine back onto the ready queue.
Native jobs own native inputs only. Jobs, executors and run mailboxes are the
[native job core](../jobs/README.md). Results reach the worker through the
run's mailbox, and `src/kernel/async_jobs.h` settles their promises as
macrotasks. When a due timer and a result are both waiting, the two kinds
alternate, and the first such turn of a run fires the timer. A cancelled run switches
to rounds of at most 64 steps, each followed by at most 64 microtasks, and the
loop checks the cancel deadline between them. Closing the mailbox when the run
ends detaches every job still running, and its late result is destroyed on
the thread that produced it. The protocol is
[`docs/plans/graph-runner-async-host.md`](../../docs/plans/graph-runner-async-host.md).
[Native jobs and lanes](#native-jobs-and-lanes) describes where the jobs run.
`nodetool.output.Output` runs natively (`output_node.cpp`), because its
TypeScript class lives in audio-nodes and pulls in media code. A value that
holds bytes or a media ref goes to the guest's `outputValue`
(`guest/host/output.mjs`), which normalizes it and saves media as an asset,
as the TypeScript node does.

### Native jobs and lanes

A host function that moves work off the worker copies the JavaScript
arguments the job needs at the call (`src/kernel/job_inputs.h`), after
reserving their bytes (see [Admission limits](#admission-limits)): bytes of an
ArrayBuffer or typed array, strings, and options as JSON text. A detached or
out-of-bounds buffer is rejected there, and later changes to a buffer never
reach the job. A typed array over a SharedArrayBuffer is copied like any
view, and a SharedArrayBuffer itself is rejected. The host functions that
move work off the worker are the asynchronous context call (see
[Asynchronous context calls](#asynchronous-context-calls)), which copies its
JSON payload string, and the image calls on the CPU lane (see
[Native image adapter dependencies](#native-image-adapter-dependencies)),
which copy their bytes and pixels and validate their spec into a fixed-size
struct. Provider endpoint jobs run on the network lane (see
[Provider endpoint jobs](#provider-endpoint-jobs)). File, asset and fetch
calls are described in [Files, assets and fetches](#files-assets-and-fetches),
and media sessions and track staging in [Native media](#native-media).

The job then goes to one of three process-wide lanes
(`src/kernel/host_lanes.h`): CPU work with min(4, cores - 1) threads and at
least 1, file I/O with 8, and network calls with
`ProviderJobs::Limits::maxJobs`. `HostOptions::cpuThreads`, `ioThreads` and
`networkThreads` override them, and the first threaded runner of the process
sets the sizes. Each lane runs its FIFO queue on at most that many threads
and starts them only when jobs arrive. The lanes outlive every runner.
`HostOptions::inlineHostJobs` runs every job on the worker as it is
submitted instead. Its results still settle as macrotasks, but a cancelled
run cannot end at its deadline while an inline job runs.

When a run ends, its jobs still queued are destroyed without running, the
jobs running on a lane are asked to stop, and finished results the worker
has not settled are discarded. Each lane has a reaper thread that runs those
stop requests and destroys those jobs and results, so a stop callback, input
destructor or result destructor that blocks delays its lane, not the worker.
A lane starts its reaper before its first worker and runs no job without
one. A job the lane refuses, because no reaper or worker thread can start
or because the lanes shut down, gets its Error or AbortError through the
run's mailbox first. Its inputs are then destroyed by the process's
disposer thread, which the first lane starts and which lives as long as the
process, so a blocking input destructor never blocks the worker. After
shutdown, a stop request runs on the requesting thread, so embedders destroy
their runners before they shut the lanes down (debug builds assert it). A
lane destroyed while a run or a `ProviderJobs` still uses it prints why and
aborts the process, in every build.
Inline mode destroys results on the worker. Stop callbacks should still
only set flags or issue a non-blocking wake.
`GraphRunner`'s destructor does not wait for lane jobs, which hold no
reference to the runner.

`gr::shutdownHostLanes(deadline)` in
[`include/nodetool/host_lanes.h`](include/nodetool/host_lanes.h) ends the
lanes: it stops admission and hands the reaper the AbortError for each
queued job and a stop request for each running job, then waits until the
deadline. A lane thread confirms its exit from a `thread_local` destroyed
after every other `thread_local` of the thread, and shutdown joins only
threads that confirmed it. Destructors the C library runs after that, such
as pthread key destructors, are outside the deadline. On `TimedOut` it
returns a supervisor that keeps the lanes, their threads and the running
jobs alive. The process keeps its own reference, so static teardown never
destroys a lane with a live thread. The caller retries or ends the process.
No library destructor ends the process.

### Resource control blocks

Rollout step 5 converts host resources that outlive one call, such as media
inputs, encoders, file handles and track staging directories. The media and
track staging hosts use them, and so do file handles (see
[Files, assets and fetches](#files-assets-and-fetches)). The image and canvas
encode jobs do not: each job owns its inputs and creates and destroys its
libvips or stb state within one call.

A `ResourceControl` (`native/jobs/include/nodetool/jobs/resource_control.h`)
wraps one resource and is its serial queue. A host function submits an operation through
`AsyncRun::submit(control->operations(), control->operation<Body>(fn), ...)`.
The control keeps operations in a FIFO and hands one at a time to its lane,
and only that operation touches the resource. `control->terminal()` takes a
finish: it runs after the operations accepted before it, sees whether one of
them failed, and nothing is accepted after it. `close()` runs what was
accepted. `abort()` and run cleanup reject the queued operations with an
AbortError and ask the running one to stop. A lease keeps the resource alive
for a dependent, such as a media input reading from a staging directory.
Once its last operation returned and its last lease is released, the
resource goes to the reaper thread of its lane, or of another lane named in
`ResourceOptions::destroyOn`, which destroys it and only then releases its
own dependency leases. Library cleanup and directory removal therefore never
run on the worker, and they are part of the lane's timed shutdown. A staging
directory is removed after its readers. `abort()` never runs an operation's
stop callbacks on the aborting thread.

A session that keeps a library interrupt callback, such as an FFmpeg input,
owns a `SessionStopBridge`
(`native/jobs/include/nodetool/jobs/session_stop.h`) and points the
callback at it. Each operation binds its stop token to the bridge while it
runs, and abort sets the bridge's session flag for good. An operation that
leaves its codec unusable calls `retireSession()`, and the control rejects
the operations queued behind it.

Asset writes and removals go through the process `DestinationQueue`
(`src/kernel/destination_queue.h`), kept in the lane registry and keyed by
the canonical destination path. `src/host/asset_destinations.h` builds the
jobs: a write takes its place in the queue on the worker. On the I/O lane it
opens the destination's directories one at a time from the asset directory,
relative to the descriptor before, never following a symlink, and writes its
own temporary file into the directory it holds. In queue order it acquires
the directory again, checks that it is the same one, and renames the file
over the destination relative to the held directory. The queue submits each
commit to the I/O lane, so cancelling or dropping one operation never runs
another's commit on the cancelling thread. A stop before the rename discards
the write, and every failed operation removes only its own temporary file.

### Files, assets and fetches

During a run, `node:fs/promises`, `context.workspace` reads and writes, the
asset store adapter, `package://` reads and media fetches call the
asynchronous host functions (`*Async` in `src/host/files.cpp`,
`src/host/assets.cpp` and `src/host/http.cpp`). File and asset jobs run on
the I/O lane, fetches on the network lane. Outside a run, where no lane is
bound, the same guest calls fall back to the synchronous functions, and the
`*Sync` functions of `node:fs` always stay synchronous. A run binds its
network lane explicitly: fetches never fall back to the I/O lane.

A whole-file read reserves its output before it runs, so it is two jobs
(`src/host/file_jobs.h`): one opens the file and reads its size, the next
reads at most that many bytes. A file that grew in between is measured and
read again with the new size, at most three times, then fails with `EFBIG`.
Listings reserve 16 MiB of JSON. A fetch reserves the 512 MiB body cap,
256 KiB for its final URL and content type, and its URL, so under the
default 1 GiB run limit one fetch of a run runs at a time and the next waits
for it.

A `fs.promises.open` handle opened during a run is a `ResourceControl`
that owns its descriptor. One opened outside a run reads on the worker. Reads run in call order, `close()` runs after the reads before
it, and run cleanup aborts every handle of the run. Asset writes and
removals go through the destination queue above, in call order. Code
outside a run calls the synchronous ones, which refuse a call while a run is
bound and never wait: when an asynchronous write or removal of the same
asset is queued or running, from any runner of the process, the synchronous
call fails at once with `EBUSY`, naming the asset, and the caller may retry.
Otherwise it commits on the worker before it returns, and later operations
queue behind it. A write cancelled before its rename is discarded.

A fetch stops when its run is cancelled: libcurl's progress callback reads
the job's stop token while data flows and about once a second otherwise. It
is not called during name resolution or the TCP connect, so a stop in those
phases takes effect when they end, at most at the 15 s connect timeout.
`CURLOPT_NOSIGNAL` stays set, and `curl_global_init` runs when the `http`
capability is installed, before a fetch can be submitted. The asynchronous
file jobs call no `chdir`, `umask`, `strerror` or `getenv`. An embedder must
not change the working directory or the umask while jobs run.

### Admission limits

Every native job holds a reservation in an admission ledger
(`native/jobs/include/nodetool/jobs/admission.h`) from the first copied
input byte until its result is drained or discarded. It charges the job's copied inputs, its worst-case
output and one operation slot to its run and the ledger. By default a run
may hold 1 GiB and 64 operations, and a ledger 4 GiB and 256 operations.
`HostOptions::hostJobLimits` lowers a runner's run limits. Runners share a
ledger's limits when the embedder creates one with `gr::newAdmissionLedger`
and passes it to each in `HostOptions::admissionLedger`. A runner given none
gets a private ledger with the default limits. The CLI creates one ledger
for its runner. Inline jobs are charged too.

A host function reserves its inputs before it copies them, so an input that
cannot fit fails before the copy. A job larger than a byte limit fails at the
call. A job that has to wait for capacity starts later: it keeps its copied
inputs, with at most 64 MiB and 1024 waiting jobs per run, and the run starts
its waiting jobs in call order. A job whose waiting inputs would leave an
earlier waiting job too little room to ever start fails instead, and so does
a job that could start only after the guest starts or retires a provider
upload. Runs blocked by the ledger wait in the order they began waiting. A
result keeps its charge while it waits for the worker, and a run that ends
keeps the charge of its running jobs until they finish, so a cancelled run
with a stuck job still holds back other runs.

The bytes of a node value are charged to the run from the copy out of the
guest until the last edge, inbox or message that holds the value drops it.
`__host.blob` reserves them before the copy, so a node whose output does not
fit the run or the ledger fails with an Error. The charge counts as retained
input, which only the nodes that read the value release. It ends with the
run at the latest.

Bytes a converter hands to JavaScript without a copy
(`ResultConversion::adoptBytes`) move to a separate JavaScript ledger, 1 GiB
per runner and 4 GiB per process, and leave it when the garbage collector
frees the buffer. A conversion that would pass those caps rejects its promise
with an Error. Results under 64 KiB are copied, and an adopted buffer stays
charged at least 64 KiB when a transfer shrinks it. Asynchronous context
calls reserve their request and the payload limit for the response, and an
error message over that limit reaches the guest as a short diagnostic.
Provider jobs reserve their request and `ProviderJobs::Limits::maxResultBytes`,
64 MiB by default, for their result and progress events. A progress event
that does not fit that cap is dropped, and a start the ledger cannot admit
fails and keeps its upload. The design is section 4.7 of
[`docs/plans/graph-runner-async-host.md`](../../docs/plans/graph-runner-async-host.md).

### Stacks, heap, messages and timers

- The worker thread and each host lane start with an explicit 32 MiB stack
  (`js::kWorkerStackBytes`). The main engine limits JavaScript to 24 MiB
  (`js::kJsStackBytes`), which leaves room for C++, libav and Cairo frames.
  Deep recursion, `JSON.parse` or `structuredClone` ends in a `RangeError`
  instead of a crash. A nested Code-node runtime takes the smaller of its
  request and the stack that remains, and refreshes its stack top on each
  entry. The wasm stack comes from the same budget.
- The engine heap limit defaults to 4 GiB. `HostOptions::javaScriptHeapBytes`
  sets it, and 0 keeps the default. A guest allocation past it raises an
  out-of-memory error. Before the JavaScript ledger refuses a charge, the
  runner collects garbage once and retries.
- `postMessage` has its own host function. Messages do not count toward
  `maxCalls` or `maxPayloadBytes`. Each message text may hold up to
  `maxMessageBytes` (64 MiB by default, in `context_options.h`), and the guest
  keeps no list of posted messages.
- A run may hold 10000 pending timers. `setTimeout` and `setInterval` throw
  "too many pending timers" past that count.
- `HostOptions::spareContext` (default on) keeps a second loaded context while
  the runner is idle. A run after a discarded context then starts in about
  135 ms, where a full load took 519 ms. It costs one idle JavaScript heap, so
  a memory-bound embedder sets it to false. The CLI sets it to false.

## Guest environment

QuickJS-ng provides the language, `queueMicrotask`, `performance`, `WeakRef`,
`DOMException`, `atob` and `btoa`. `guest/env/index.mjs` adds what node code
and its libraries use beyond that, before any other guest module runs:

- Timers. `setTimeout`, `setInterval`, `setImmediate` and their clear
  functions follow Node's API (`guest/host/timers.mjs`) and run on the kernel
  loop through the `timers` capability (`src/host/timers.cpp`). `Loop` in
  `src/kernel/task.h` keeps them ordered by deadline, then by creation. A due
  timer fires only when no kernel step is ready and the job queue is empty,
  one per turn, and the job queue drains after each, so every microtask runs
  before the next timer, as in Node. When only timers are left, the worker
  sleeps on a condition variable until the next deadline. A run keeps going
  while its timers are pending and its task is unfinished, as on the server.
  Timers still pending when the run (or the bundle load) ends are dropped. On
  cancel, `cancel()` wakes the loop, timers due within the 500 ms grace period
  still fire so nodes waiting on them can unwind, and later ones are dropped.
  A node still waiting at the deadline ends the run, and the runner replaces
  the context.
  `ref()`/`unref()` only record the flag, and `refresh()` gives the timer a new
  numeric id.
- `Intl` uses ICU through `src/host/intl.cpp` and `guest/env/icu.mjs`.
  `Collator.compare` and `String.prototype.localeCompare` use locale collation,
  including numeric, sensitivity, case-first and punctuation options.
  `NumberFormat.format` supports decimal, percent and currency formatting,
  integer/fraction digit limits and grouping. Number and BigInt locale methods
  use it. `DateTimeFormat.format` supports date/time styles, calendar fields
  and IANA time zones. Date locale methods use it. `RelativeTimeFormat.format`
  and `ListFormat.format` also use ICU. The previous en-US implementation
  supplies `NumberFormat.formatToParts`, `resolvedOptions` and
  `supportedLocalesOf`; those methods retain its locale/option limits.
  Other number styles, significant digits, notation, sign and rounding options
  fail explicitly. `Segmenter`, `PluralRules` and other constructors are absent.
- `structuredClone` (`guest/env/structured-clone.mjs`), with Node's rules for
  which values clone and which throw `DataCloneError`, and ArrayBuffer
  transfer. Proxy objects are copied through their traps rather than rejected.
  SharedArrayBuffer is rejected. Transfer copies buffer contents before
  detaching the original, and preserves shared views in the clone.
- `process` is available globally and as `node:process`, backed by
  `guest/host/process.mjs`. `platform` and `arch` describe the runner binary.
  `env` is seeded from the explicit `ContextOptions::environmentJson` grant,
  which defaults to an empty object. Each submitted job resets guest-local
  writes before applying that grant. Host environment variables and secrets
  are never copied into it automatically.
  `cwd()` is the virtual root `/`, and `getuid()`/`getgid()` return virtual
  ownership 1000. These values grant no host file access. `argv`, `execArgv`
  and `versions` are empty, and `version` is empty. `nextTick` batches callbacks
  as a microtask, after already queued promise jobs. Host process-control
  methods such as `exit`, `chdir`, identity setters, `kill` and `binding` throw.


`URL` and `URLSearchParams` use the WHATWG parser. The `node:url` alias also
provides POSIX file URL conversion. Parsing a URL grants no file or network
access. `TextEncoder` and `TextDecoder` support malformed-input replacement,
BOM options, typed-array offsets and streaming decode. Their bootstrap runs
before bundled dependency evaluation. `gr_url_tests` compares these cases with
the repository's Node runtime.

Not provided as globals: `fetch`, `AbortController`, `TextDecoderStream`
and the other streams (`TransformStream` blocks the ComfyUI module).
The host module aliases provide `node:path`. `String.prototype.localeCompare` uses the ICU collation capability.

The message stream matches per stream: the job, each edge, and each node see
the same messages in the same order as in the TypeScript runner. The
interleaving across nodes depends on microtask counts and can differ.

## Host capabilities

Node code reaches anything outside the engine through `globalThis.__host.<name>`,
one capability per file in [`src/host/`](src/host/capabilities.h), with its
guest half in [`guest/host/`](guest/host/README.md). A capability may also
rewrite outgoing messages (`boundary`) and free what a run held (`endRun`).
`gr::HostOptions` is the embedder's configuration for them.

### gpu and image

The WebGPU image nodes (`lib.image.*`, `nodetool.image.Blur`,
`nodetool.image.Channels`, the `lib.image.draw` generators) call
`runShaderNode` or `runRecipeNode` with a shader module of `@nodetool-ai/gpu`.
QuickJS has no WebGPU, so the guest replaces those two functions
(`guest/host/gpu.mjs`) with calls into the gpu capability
(`src/host/gpu.cpp`), which runs the module on wgpu-native:

- The shader catalog is exported at bundle build time, in Node, from the real
  registry (`guest/host/gpu-catalog.mjs`), so the WGSL is the string Dawn
  compiles in TypeScript. The guest sends the module key `id@version`, the
  params as JSON, and texture handles. The host packs the uniform struct from
  the catalog's layout, as typegpu's `writeToArrayBuffer` does (the gpu tests
  check every module's packed defaults against typegpu's bytes).
- [`src/host/gpu_device.cpp`](src/host/gpu_device.cpp) encodes the way the
  TypeScript Executor and RecipeRunner do: the variant for texture_2d inputs,
  premultiplied rgba8unorm inputs and outputs, the alpha conversion pass for an
  input whose contract is straight alpha, a 1x1 white texture for unbound
  optional inputs, recipe intermediates in their declared formats, and the
  full-screen triangle or the workgroup dispatch.
- Textures stay on the host. A node's output is a GPU-texture ImageRef,
  `{type: "image", mimeType: "image/x-gpu-texture", texture: {gpu: <id>}, width, height}`,
  as in the browser runner, and a downstream shader node samples it directly.
  When a message carries one, the gpu `boundary` reads it back and replaces it
  with `{type: "image", mimeType: "image/png", data: <base64 PNG>, width, height}`.
  A texture never changes, so it is read back once and every later message
  that carries it reuses the result until the texture is released. An
  embedder that shows outputs in its own process sets
  `GpuOptions::outputImages`: it receives the pixels and returns a URI, and
  the message carries `{type: "image", uri, width, height}` with no data.
  Node code that wants pixels (`decodeRgba`) gets them through `readback`.
  Handles belong to one engine and its current run. Guest run labels only
  group that engine's textures for early release. Readback, shader inputs,
  release and output conversion reject foreign, stale or unknown handles.
  Run/context teardown frees all of that engine's textures, including textures
  carrying a different guest label, without affecting peer runners with the
  same job id. The catalog path admits at most 4096 textures and 64 MiB of
  retained RGBA8 textures per engine, checked before native allocation.
  `uploadEncoded` keeps the last two images it decoded with their encoded
  bytes, per engine and across runs. An upload of the same bytes skips the
  decode, as each preview run of a slider drag uploads one source image again.
- Input images arrive as inline bytes, base64 `data` or `data:` URIs, which the
  image capability decodes with stb_image (PNG, JPEG, BMP, GIF, TGA, PSD, PNM;
  plus libwebp for WebP). Other references go to `loadMediaRefBytes`, the media capability's
  loader.

`HostOptions::gpu` holds `enabled` (off by default), `backends` (wgpu-native
backends, `"primary"` by default) and `softwareOnly`. The device prefers a
hardware adapter and falls back to a software one, such as lavapipe. One
device per option set lives for the whole process. Without a device the nodes
fail with "WebGPU is not available: <reason>".

## What A1 supports

- Buffered `process` nodes and `genProcess` streaming-output nodes under the
  correlated scheduler: iteration lineage, sticky prefix inputs, untaken
  branches, multi-edge list handles.
- Streaming-input nodes with `run(inputs, outputs)`: `stream`, `first`, `any`,
  the envelope variants, `emit`, `emitGroup`, `forward`, `drop`, `complete`.
- Control edges and controlled replay, with data defaults and event property
  overrides. Loop feedback uses iteration lineage, bounded iteration counts,
  nested scopes and quiescence when a branch stops feeding back.
- Bypass uses the production graph rewrite. Declared dynamic inputs use the
  production coercion/checking rules, and dynamic output types enter analysis.
- Inline subgraphs execute a child native runner with copied context variables,
  separate channels, name-keyed outputs and parent cancellation. Nesting is
  limited to eight levels. Child messages exclude child terminal job updates.
- End-of-stream counting per handle, per-slot early end of stream, edge
  counters with the 1 s `edge_update` throttle, and drained edges.
- Workflow input nodes with parameter injection and required-input checks.
- Correlation analysis issues, property and platform validation, and node
  errors, reported as `job_update` failed.
- Cancellation, reported as `job_update` cancelled.
- A `ProcessingContext` per run (`guest/host/context.mjs`) and bytes in
  values, so media nodes load and pass real bytes. Variable channels: Set
  Variable and Get Variable.

## What node code can reach

Node code runs in QuickJS and reaches the machine only through the host
capabilities in `src/host/`, each installed as `globalThis.__host.<name>`.
`gr::HostOptions` in [`include/nodetool/graph_runner.h`](include/nodetool/graph_runner.h)
grants them. Every field defaults to granting nothing.

| Capability | Granted by | What node code gets |
|---|---|---|
| `sqlite` | `sqliteDirectory` | `better-sqlite3` and built-in `sqlite-vec`. Without a directory grant, only memory databases open. |
| `files` | `workspaceDir` and `sqliteDirectory` (read-write), `readRoots` (read-only) | `node:fs`, `node:fs/promises` and `context.workspace`. Relative paths resolve against the workspace, which is also `context.workspaceDir`, `os.homedir()` and `os.tmpdir()`. |
| `assets` | `assetDir` | `asset://` and `/api/storage/<key>` refs resolve from it. `context.createAsset` stores owner-scoped bytes when model persistence is also granted. |
| `packageAssets` | `packageAssetsDir` | `package://<pkg>/<path>` refs read `<dir>/<pkg>/<path>`, read-only, with the asset key rules. Without a directory these refs fail with an error that names `--package-assets`. |
| `providers` | `fakeProviders` | Every provider id resolves to the runtime's `FakeProvider`, one instance per id, and the context's `provider:*` and `prediction:*` grants are dropped from both grant maps. Provider calls then reach no grant, secret or network. |
| `secrets` | `secrets` | `context.getSecret(key)`. The process environment is never read. |
| `http` | `allowHttpFetch` | http(s) media refs load under the `safeFetch` policy: https to a public address, every redirect and connected address checked. |
| `media` | `allowMedia`, `mediaEncoders` and the file grants | Native libav probing, frame readers, video encoding, audio filters and muxing. Encoders require an explicit allowlist. |
| `webassembly` | Bounded guest computation | The installed Yoga module's function, memory and table ABI through Wasmtime. Native state follows the guest context lifetime. |

A path is resolved to its real location before any file operation, and
refused with `EACCES` when that leaves the granted directories: `..`,
absolute paths and symlinks to anywhere else, and hard-linked files. Asset
keys refuse `..`, absolute keys and any symlink. The tests are in
`unittests/host.cpp`.

`loadMediaRefBytes` and the other pure functions node code imports from
`@nodetool-ai/runtime` are the real package modules (`guest/host/runtime.mjs`).
`guest/module-contract.mjs` lists which runtime exports are real, guest or
host code, and which are unavailable and why.
Media refs resolve as in the TypeScript runner: `data:` URIs and inline data
in the guest, `file:` URIs and absolute paths through `files`, `asset://`
refs through the asset store and the run's in-memory temp store (`memory://`),
http(s) through `http`, and `package://` refs through `packageAssets`.
Without a database, `asset://<id>` carries no extension, so the store's `find` reads the
owner's folder for `<id>.<ext>`. The store is listed only when that misses.

The context (`guest/host/context.mjs`) mirrors `ProcessingContext` for
workspace, storage, secrets, variables and channels, `normalizeOutputValue`,
`resolveAssetBytes` and `createAsset`. Without an asset directory,
`createAsset` fails as the TypeScript context does without a database.
Provider, model and sandbox services use explicit host grants. Their focused
fixtures are registered separately from the scheduler tests.

With `fakeProviders`, every generation reaches the `FakeProvider` method for
its capability through the same provider dispatch as the TypeScript runner
(see [Node context contract](#node-context-contract)), and endpoint calls fail
because `FakeProvider` has none.
`unittests/fake_providers.cpp` runs real node bodies with and without the
flag.

## Node context contract

`NodeContext` in [`packages/runtime-core/src/node-context.ts`](../../packages/runtime-core/src/node-context.ts)
lists the context members node code may use. The TypeScript `ProcessingContext`
implements it, and
[`node-context-members.json`](../../packages/runtime-core/node-context-members.json)
is generated from it. `gr_node_context_tests`
([`unittests/node-context.test.mjs`](unittests/node-context.test.mjs)) loads
the guest context class and fails when a listed member is neither implemented
nor declared in [`guest/context-unavailable.mjs`](guest/context-unavailable.mjs).
It also fails when a declared member is implemented, is not in the list, or
has a reason outside the fixed set: `server-only`, `python`, `host-binary`,
`native-addon`, `kernel` or `not-yet-ported`. `kernel` marks the members a
nested TypeScript `WorkflowRunner` needs (`copy` and the executor and node
type resolvers), because the C++ kernel runs subgraphs itself. The test prints
the implemented count and the unavailable members by reason.

When node code starts using a new context member, the
[runtime-core check](../../packages/runtime-core/README.md#node-context-contract)
requires it in `NodeContext`. Regenerating the JSON then fails this test until
the guest implements the member in `guest/host/context.mjs` or
`context-services.mjs`, or declares it unavailable with a reason. Remove the
declaration when the guest implements the member.

Where a member's logic does not depend on the host, the guest calls the same
module as `ProcessingContext`, bundled with `guest-real:` (see
[shared context logic](../../packages/runtime-core/README.md#shared-context-logic)).
The cost totals, message media resolution, the provider call of each
capability and the generation envelope work this way. The guest passes its
context as the host, and `generationHost()` in `context-services.mjs` supplies
the envelope's bookkeeping: no durable lifecycle callbacks, no registry of
live generations and no app runs. `runGeneration` lets the context's provider
make the call for `generate_message`, and for other capabilities when the
embedder granted no `prediction:<id>:<capability>`. With such a grant the
embedder's adapter makes the call inside the same envelope.

The other members stay hand-written in the guest, because their TypeScript
versions are bound to server state the guest replaces with host capabilities:
secrets come from the `secrets` grant, assets and temp storage from the asset
directory and the in-memory store, provider resolution from explicit grants,
documents from model grants, and output normalization from the guest's
storage. They keep the TypeScript behavior where node code can observe it.

In the parity profile (`guest/parity/profile.mjs`), a member of the real
context the guest lacks throws `ProcessingContext.<name> is unavailable in
the native runner (<reason>: <note>)` with the reason `context-unavailable.mjs`
declares, or says it is not a `NodeContext` member.

## Processing context and Code grants

[`ContextOptions`](include/nodetool/context_options.h), supplied as
`HostOptions::context`, declares provider and application callbacks. Its
`operations` map accepts and returns JSON strings. Missing operations fail by
name. Calls enforce the payload and per-run call limits, and poll `cancelled`
before and after execution. A blocking host callback must also poll its
cancellation predicate. Provider cursor cleanup remains callable after cancellation.
`asyncOperations` grants the same kinds of operations through the
asynchronous transport described in
[Asynchronous context calls](#asynchronous-context-calls).

| Grant | Interface |
|---|---|
| `provider:<id>:open`, `next`, `close` | Incremental provider messages through a cursor. The guest uses the existing BaseProvider loop and tracing implementation. |
| `provider:<id>:generateMessage`, `generateText`, `generateObject` | Explicit non-streaming model adapters. |
| `provider:<id>:webSearch` | A provider's search method. Native server search in the message loop additionally reads `supportsNativeWebSearch` from an optional `provider:<id>:metadata` callback. |
| `provider:<id>:postModel`, `getVideoOperation`, `mediaHeaders` | Gemini-compatible endpoint methods. Response callbacks return `{status, headers?, body, url?}`. The guest exposes real text, JSON and byte readers over that response. |
| `prediction:<id>:<capability>` | Capability-specific media generation and its bookkeeping. `generate_message` uses the provider message adapter directly. |
| `provider:<id>:jobs:put`, `start`, `next`, `close` | Endpoint calls (`context.callProviderEndpoint`, `uploadProviderMedia`, `downloadProviderMedia`) as host jobs, `next` on the asynchronous transport. Pass a [`ProviderJobs`](include/nodetool/provider_jobs.h) as `HostOptions::providerJobs`. See [Provider endpoint jobs](#provider-endpoint-jobs). |
| `toolDefinitionsJson` and `tool:<name>` | Advertised tool metadata paired with an executable callback. The callback receives `{userId, jobId, args}`. No server-wide tool catalog is granted. |
| `permission:request` | Optional decisions for actionable tools through the existing permission gate. Receives the approval request and run identity, and returns `allow`, `allow_for_chat` or `deny`. Without this grant, calls beyond the default read permissions are denied. |
| `sandboxModuleResolutionJson` | A host-authorized module resolution for the exact static package imports. No package discovery or ambient module loader is used. |
| `modelOptionsJson` | Explicit persistence options, including `databasePath`. A file database also needs its directory grant. No default database opens. Asset creation needs both persistence and `assetDir`; `assetRoot` enables authorized local asset paths. |
| `ocrDataDirectory` | A directory containing explicitly supplied Tesseract language resources such as `eng.traineddata`. Empty disables OCR. Resource symlinks escaping the directory are rejected. |
| `http:request` | Optional host HTTP transport. Its callback owns URL, redirect and credential policy. Without it, the native public-HTTPS GET capability still requires `allowHttpFetch`. |

### Asynchronous context calls

`ContextOptions::asyncOperations` grants operations whose callback runs on
the I/O lane instead of the runner thread, so it may block or finish later.
The callback receives the request JSON, a `std::stop_token` and a move-only
`ContextCompletion`, which it may keep and call once from any thread with a
`ContextResult`. Node code reaches these grants through the context's
services (`contextCall` in `guest/host/context-services.mjs`), which use
`__host.context.callAsync` for an operation that `__host.context.isAsync`
reports and `call` for the others. Which operations an embedder grants
asynchronously is its choice. `ProviderJobs` grants
`provider:<id>:jobs:next` this way, and the CLI and the node editor grant
none.

A name may be in only one of the two maps. A name in both fails when the
context is installed, which fails the runner's load. `has` reports both
maps, and each transport refuses the other map's names. Both transports
check the grant, cancellation, the call count, payload conversion and the
request size in that order, and share one call count and the payload
limits. A request-side failure throws at the call, as `call` does. The
response checks run on the runner thread when the result settles the
promise, which happens as a macrotask through the run's mailbox. Provider
cleanup (`provider:<id>:close` and `provider:<id>:jobs:close`) is exempt
from cancellation and the call count on both transports, but not from the
payload limits.

The first outcome wins, and later ones are discarded: the completion's call,
a throw from the callback, the run's stop (an AbortError), or the last
completion destroyed without a call (an Error). While the callback is still
running, its throw wins over the destruction of the completion it held, so
node code sees the thrown message. A moved-from completion does nothing when
destroyed, and calling a completion a second time is ignored, with an
assertion in debug builds.

When the run's cancellation begins, every pending call except cleanup
(`provider:<id>:close` and `provider:<id>:jobs:close`) gets an AbortError
through the run's mailbox, in submission order. Like any result it settles
at the loop's completion point, one per turn, so node code waiting on it
reaches its `finally` blocks during the cancel grace period, and one call's
continuation and cleanup run before the next call settles. A result already
in the mailbox settles first, and the response check then rejects it with
an AbortError, "Run cancelled", so every cancellation-caused rejection is an
AbortError whatever the order. Whichever result settles a call first wins,
and later ones are dropped. A synchronous `call` whose response check finds
the run cancelled still throws the Error "Run cancelled". The context's
services (`contextCall`) and provider endpoint calls turn an AbortError from
the host into the run signal's reason, which is an AbortError too, and leave
every other error as it is, so a provider's own error delivered before the
cancellation still reaches node code.
A non-cleanup call made after that is refused at the call, and a cleanup
call still runs. When the run ends, the remaining calls stop the same way.
Settling happens on the runner thread. Stopping the callback's token happens
on the I/O lane's reaper thread, so an embedder stop callback that blocks
delays that lane's stop requests, not the runner's teardown or its
destruction. With `inlineHostJobs`, or once the lane shut down, the stop
runs on the requesting thread. Stop callbacks should still only set flags
or issue a non-blocking wake. The callback, its captures
and a runner tracker ticket stay alive until the call ended and its
completion is gone, which can be after the `GraphRunner` is destroyed.
Calling the completion then is safe: its result is destroyed on the calling
thread and never reaches the runner thread. Captures must therefore own what
they use. With `inlineHostJobs`, the callback runs on the runner thread, as
every host job does in that mode.

#### Grants of the in-repo embedders

The CLI (`src/main.cpp`) and the node editor's local runner
(`sharedLocalRunner` in `native/node-editor/src/server/WorkflowSession.cpp`)
grant no context operation of their own, in either map, and no
`providerJobs`. Each callback they hand the runner stays synchronous:

| Embedder | Callback | What it does | Decision |
|---|---|---|---|
| Both | the runner's own `message` operation | Forwards each kernel message to the job's `MessageHandler` on the runner thread. | Synchronous. The runner refuses `message` in `asyncOperations`, because message order is the run's output. |
| CLI | `MessageHandler` | Writes the message to stdout under a mutex. A slow stdout reader blocks the runner thread. | Synchronous. The line order on stdout is the CLI's contract. |
| Node editor | `MessageHandler` | Posts the message to the session on the GUI thread with a queued `QMetaObject::invokeMethod`. It never waits for the GUI thread. | Synchronous. |
| Node editor | `GpuOptions::outputImages` | Moves the pixels into `LocalMediaStore` under its mutex, with no I/O. | Synchronous. It is not a context operation and has no asynchronous form. |

Asset, file, media and HTTP access are not embedder callbacks. The runner
implements them in `src/host/` and the embedders enable them through
`HostOptions` fields such as `assetDir` and `workspaceDir`, so moving them off
the runner thread is a change to the runner (rollout step 5 of the
[asynchronous host design](../../docs/plans/graph-runner-async-host.md#8-rollout)),
not to the embedders.

Neither embedder grants provider endpoint jobs. A `ProviderJobs` needs a
worker that calls the vendor with its credentials, and neither embedder has
one. The CLI runs example workflows offline, with `--fake-providers` for
provider nodes. The node editor runs a graph in process only when every node
works without a secret or the network (`guest/local-nodes.mjs`), and sends
other graphs, provider nodes included, to the server.

The node editor ends the process lanes on exit as [Run](#run) describes for
the CLI: after its last `GraphRunner` is destroyed, `shutdownHostLanes` gets
a 2 s deadline, and `TimedOut` ends the process with `std::quick_exit`.

### Provider endpoint jobs

Provider node packs call vendors through `context.callProviderEndpoint`,
`uploadProviderMedia` and `downloadProviderMedia`. A vendor call can take
minutes, and a context callback blocks the runner's only thread, so these run
as jobs instead. The embedder creates a
[`ProviderJobs`](include/nodetool/provider_jobs.h) with one worker function
that performs `callEndpoint`, `uploadMedia` or `downloadMedia` for a
provider, for example by forwarding it to a NodeTool server, and reports
progress. It passes the object as `HostOptions::providerJobs` with the
provider ids in `providerJobProviders`. With `fakeProviders`, nothing is
granted.

Each job runs on the process network lane (see
[Native jobs and lanes](#native-jobs-and-lanes)). The guest starts a job
with the synchronous `start` grant and then awaits each item through the
asynchronous `next` grant, whose promise settles when the job has one:
progress, a result part, the result, or an error. No timer runs while it
waits. Progress events reach the node's `onProgress`. Requests and results
larger than one part (256 KiB by default) travel as consecutive parts, so the
1 MiB payload limit does not cap media.

The guest closes the job in a `finally` block when the call settles. When
the run's cancellation begins, a waiting `next` rejects with an AbortError at
once, so that `finally` runs during the cancel grace period, and `close` is
allowed then. An abort of a caller's own signal closes the job through an
abort listener, which the call removes when it ends. Closing requests stop
through the worker's `cancelled()` and `Call::stop` token and returns
without waiting. The lane's reaper thread runs the worker's stop callbacks,
so one that blocks never blocks the runner thread. A closed job keeps its
`maxJobs` slot until its worker returns. Destroying `ProviderJobs` stops
every job without waiting, and `shutdownHostLanes()` bounds the wait for a
worker that ignores the stop. With no jobs granted for a provider, the
context falls back to the resolved provider's own `callEndpoint`, which is
what an injected provider resolver supplies.

Each job keeps a durable state: running, finished, failed, stopped or closed.
Reads take queued progress first, then result parts, then the terminal
result. A stopped or closed job answers every later read with that state at
once, and stop drops queued progress and any result not yet taken. A
terminal result already taken stays the answer until the job is closed.
`ProviderJobs::next` is the native form of a read: it completes a move-only
callback at once when an item is ready, or keeps it as the job's single
waiter and completes it from the producing or stopping thread, outside every
lock. The `next` grant adapts that callback to the context call's
`ContextCompletion`.

Each job and upload belongs to the run in progress. The runner creates a
`RunIdentity` for each run (`include/nodetool/context_options.h`) and
stamps jobs and uploads with it. `put`, `start` and `close` read it on the
runner thread, and `next` uses the identity its context call carried from
submission (`ContextCompletion::run()`), so a `next` still running after its
run ended cannot reach a later run's job. Runs are told apart by identity,
not by job id, so runners that share one `ProviderJobs` may use the same job
ids. A request that names another run's job id is refused, and a job of
another run is unknown. After the run's terminal `job_update`, before the
next run starts, the runner calls `ProviderJobs::retireRun` with the run's
identity, which closes the run's remaining jobs and releases their ids and
pending uploads. The grants hold only a weak reference, so they keep no job
alive after `ProviderJobs` is destroyed. A `ProviderJobs` built on an
explicit lane borrows it and never destroys it, so its destructor never
waits for the lane's threads.

The run owner comes from `userId`. `environmentJson` seeds only the virtual
process environment at the run boundary. Neither field reads ambient host
authentication, database configuration or environment variables.

Code uses an isolated native QuickJS runtime with its own heap, stack, deadline,
cancellation and output limits. Its declared JavaScript, host, scalar-WASM and
NodeTool capability modules run through closed module maps. Dynamic and undeclared
imports are rejected. Host facades reuse the existing implementations for document,
archive, parsing, request-building and tensor operations. The focused fixtures run
unchanged Code, Agent, Summarizer and provider nodes, including document round trips,
OCR text and boxes, Canvas pixels, permission-gated tools and explicit error paths.

The canonical workspace, fetch, crypto, format, image, Canvas, media, timer and
logging helpers are wired. Native audio and video transformations require
`allowMedia`, a writable `workspaceDir`, and the encoders they use in
`mediaEncoders`. Video encoding currently uses `libx264`; audio muxing uses `aac`.
Code staging directories are removed at release or run cleanup, after every
media call that reads or writes inside them finished. The audio helper reuses
the existing PCM editing implementation and the native decoder for compressed
input. The video helpers use native frame readers and encoders, and retaining
original audio preserves a separate encoded track. The retained media fixtures use
H.264/AAC MP4 and PCM WAV. They do not establish parity for every codec, container
or variable-frame-rate source.

TensorFlow's CPU backend runs locally. The pretrained `classify` and `embed`
helpers still need the MobileNet model and shards, `detect` needs COCO-SSD, and
`answer` needs MobileBERT and its resources. These are external model files, not
bundled inference results. The host application must explicitly grant their transport or
serve the pinned files through `http:request`, with suitable payload limits.
Missing resource grants fail clearly. The fixtures verify CPU tensor computation
and denial of ungranted pretrained resources, without claiming pretrained inference.


## What A1 does not support

- Live trigger subscriptions need a host source. Delivered events can be passed
  to `GraphRunner::submit` as `{node_id, payload}` in its optional event JSON
  argument. They execute the real node's `emitTriggerEvent` and complete.
- Code nodes and provider/context interfaces depend on the corresponding
  explicitly granted host modules. Their coverage is separate from scheduling.
- Provider SDKs and ambient server services are not loaded. The embedder must
  supply the exact provider, tool and model operations it grants.
- Native packages node code loads (`sharp`, `node-av`, `node-web-audio-api`,
  pdfium). File metadata and Painter PNG conversion use the native codec,
  and batch biquad filters use a guest offline buffer/filter adapter with
  WebAudio Q semantics. These adapters do not implement the complete sharp or
  WebAudio APIs. `lib.image.Mask` uses native libvips resize, greyscale and source-over compositing.
  The `lib.pdf` text, Markdown, table and styled-text nodes require the optional
  `@llamaindex/liteparse` dependency, which is not provided. The Code PDF facade
  uses the separately bundled PDF.js implementation.
- Guest GPUDevice operations outside the compute and fullscreen render subset
  documented below. The catalog shader path remains available.
- Image formats outside the sharp adapter's allowed PNG, JPEG, GIF and WebP
  loaders. The direct codec retains its stb formats.
- Host-backed media refs without the corresponding explicit host grant.
  Bytes reach a host as `{__bytes__: "<base64>"}`. Between two nodes they
  cross as bytes and keep their type (see [Architecture](#architecture)).
  GPU textures cross as handles and leave the runner as PNG.
- MsgPack output.

## Execution state and supervision

`HostOptions::cacheNodeTypes` explicitly selects types whose successful buffered
`process` results enter the cache. Keys use the granted owner, node type and resolved inputs.
Streaming execution bypasses this result cache. State stays in memory unless
`executionStateDirectory` is set, which stores `execution-state.sqlite` under
that explicit directory grant.

`durableInboxes` journals input deliveries in the same state store. A later run
with the same owner, workflow and job can replay pending deliveries. Successful completion acknowledges them. Failure
and cancellation retain pending inputs, so consumers must tolerate replay.
Child inbox addresses also contain the subgraph node path, invocation lineage
and per-lineage occurrence. They remain stable across root resubmission and
runner reopen, independent of sibling scheduling order.

`HostOptions::supervisor` grants a local decision callback with per-job decision
and retry budgets. The decision ceiling covers the submitted root and all its
subgraphs. Retry and sticky decisions stay local to each graph invocation.
The host reports effects for each exact invocation attempt.
Callback identities retain the submitted root `jobId` for cancellation and add
an `executionScope` path to distinguish sibling and nested node invocations.
`invocationOccurrence` distinguishes repeated events with the same lineage.
Each occurrence has its own retry allowance, and retries retain its identity.
Known zero-cost, asset-free attempts can be retried. Unknown accounting refuses
retry. Decisions observe cancellation and a deadline, and late or duplicate
completion callbacks are ignored. See
[`SupervisorOptions`](include/nodetool/supervisor_options.h) for the callback and
effect-accounting contract. `gr_public_state_tests` exercises these options
through the public runner, including persisted reopen and asynchronous decisions.

## Load time

The runner logs source or bytecode load time at startup. `--bench-load` loads
the bundle, prints the resident and peak resident bytes as JSON and exits.
`parity/bench-load.mjs` runs it `--runs` times and reports the logged phase
times (`read_ms`, `guest_ms`, `catalog_ms`), the resident sizes and the bundle
size:

```bash
node parity/bench-load.mjs --runner build/nodetool-graph-runner \
  --bundle build/guest.bin --runs 2
```

Measure with the target build and machine before choosing a preload strategy.

A host that keeps the loaded guest pays that cost once. `--repeat <n>` runs the
graph `n` times in one context and prints only the last run's messages. Later
runs of the fixtures take about 1 ms each. To check the last run against the
TypeScript runner, point `conformance.mjs --runner` at a wrapper script that
adds `--repeat 3`:

```bash
printf '#!/bin/sh\nexec %s "$@" --repeat 3\n' "$PWD/build/nodetool-graph-runner" > /tmp/repeat.sh
chmod +x /tmp/repeat.sh
node tools/conformance.mjs --runner /tmp/repeat.sh --bundle build/guest.bin
```

### Guest WebGPU

An explicit `HostOptions::gpu.enabled` grant exposes `navigator.gpu` with real
Promise adapter/device acquisition. The compute subset supports WGSL modules,
storage/uniform buffers, auto or explicit pipeline layouts, bind groups, command
encoding, dispatch, buffer copies, queue writes/submission, native queue fences,
and asynchronous MAP_READ readback. The fullscreen render subset supports
single-layer 2D `rgba8unorm` and `rgba16float` textures, views, filtering samplers,
texture uploads, texture-to-buffer and texture-to-texture copies with origins,
one color attachment, scissor rectangles, and triangle-list/strip pipelines.
Constant-weight additive blending supports timeline motion-blur accumulation.
Vertex buffers, general blending and depth remain unsupported. Texture accounting
and raw readback use each format's texel size.

Native handles live in opaque engine-owned objects. Logical devices and engine
contexts cannot exchange resources. Run cleanup invalidates retained objects.
Allocations are limited before native creation to 64 MiB per logical device,
4,096 resource objects, 256 pending operations per device and 64 live logical
devices per context. Dispatches are
limited to 1,048,576 workgroups. These limits do not preempt arbitrary WGSL loops.
Native callbacks publish completion status without invoking JavaScript. Kernel
loop timers poll nonblocking and settle promises on the guest thread. Clearing
timers cancels pending maps and rejects their promises.

`getMappedRange` returns a copied ArrayBuffer. Copies remain readable after
unmap and cannot write back to the buffer. MAP_WRITE, mapped-at-creation,
error scopes, device-loss promises, canvas, depth, multisampling, vertex/index
buffers, formats beyond RGBA8 and half-float RGBA, and general browser WebGPU compliance are not
implemented. Unsupported methods throw. Reacquire devices after a run ends.

`gr_gpu_tests` retains the before/after compute regression, exact Uint32 WGSL
readback, native fence promises, rejection/cancellation and ownership checks.
Its generated render fixture runs the package's unchanged headless compositor
and `CompositorNode`, comparing opaque image bytes exactly. A separate fixture
runs WGSL through repeated GraphRunner jobs and checks resource cleanup. The
original timeline compositor is tested with crop and moving two-sample blur
against CPU pixel expectations, and its LUT effect uses the real half-float
uploader. Copy validation covers origins, ownership, usage and format budgets.

The wrapper pattern references Mystral's `src/webgpu/bindings.cpp` at commit
`bafab09d599bd55aeb7433ba7131c3f320334c99`, evaluated in
[the binding evaluation](../../docs/native-graph-runner-mystral-evaluation.md).
This implementation was written independently. No Mystral code or additional
QuickJS runtime is included.

## Headless Canvas 2D

The Canvas host uses Cairo and Pango for the timeline rasterizers, without a
window or GPU. It supports RGBA pixel access, PNG image loading and output,
positive image crop/scale rectangles, affine transforms, paths, clipping,
gradient/solid fills, strokes, compositing and explicitly registered fonts.
Text measures and draws through Pango. Rasterization can differ from Skia at
antialiased edges. The focused Canvas tests compare shape geometry and pixel
compositing exactly and compare text advances and raster bounds within their
stated tolerances.

External file and font paths require the existing read grants. The font map
loads no ambient font configuration. Memory font registration is currently
Linux-only. Cairo/Pango/Fontconfig are optional system dependencies. A build
without them advertises Canvas as unavailable and rejects drawing calls.

Canvas text shadows and the fill rectangles used for authored strikethroughs
use bounded device-space alpha blurring before the source draw. Other drawing
shadows and Canvas filters reject explicitly. This subset does not provide
WebGL or complete browser Canvas semantics.

Catalog-approved bundled font bytes, their SHA-256 digests and OFL licenses are
embedded in the guest. Registration uses the memory API and needs no filesystem
grant. The embedded corpus has no filesystem directory. Render-page resources
still need separate packaging.

`gr_canvas_tests` covers drawing, limits, path grants, authored shadows and
interruption of guest loops between native calls. Individual raster operations
are synchronous and cannot be interrupted midway. `gr_canvas_timeline_tests`
loads the timeline classes, executes the Transcript body against a read-only
sequence fixture and exercises NodeRasterizer text shadows without file grants.
`gr_canvas_relocated_tests` registers the embedded corpus and draws shadow text
from a relocated guest without source-tree read grants. These fixtures do not
verify complete RenderTimeline export or document storage.

## Native image adapter dependencies

The image adapter requires pkg-config development packages `vips-cpp` exactly
8.18.7 and `libwebp` exactly 1.6.0. CMake checks those versions through
`cmake/host-image-vips.cmake`. These are native libraries, not a sharp Node
addon or a Node process bridge. Install matching headers and libraries before
configuration. The runtime package must include libvips-cpp, libvips, libwebp,
GLib and the loader modules and transitive libraries required by that libvips
build. RenderText also needs the SVG loader, librsvg and fonts. Font-dependent
output is verified only against the fonts installed on the test machine.

The adapter supports the image nodes' metadata, PNG, WebP, raw RGB/RGBA input,
transparent creation, fill resize with Lanczos3, greyscale, alpha insertion and
removal, sRGB output, extract and source-over composite chains. Greyscale raw
output has one channel as in sharp. RenderText accepts only its generated
resource-free svg/text shape, limited to 8192 markup bytes. External SVG
resources and other SVG shapes are rejected. Paths are loaded through the
existing files capability, so file grants apply to metadata and decoding.

Raster images are limited to 16777216 pixels and encoded sharp inputs to
64 MiB. During a run, sharp's `metadata` and `toBuffer`, the async
`encodeRgbaToPng` helper, frame extraction's PNG and canvas `encode` and
`convertToBlob` copy their inputs at the call and run on the CPU lane (see
[Native jobs and lanes](#native-jobs-and-lanes)). A canvas is copied on the
worker after a flush, so drawing after the call does not change the PNG.
Each job reserves its inputs, the most its output can hold and the encoder's
known buffers. Output bytes reach JavaScript without a copy. Canvas `toBuffer`,
Fabric `toDataURL`, decoding and drawing stay synchronous. libvips starts once,
before the process's first pool thread, and each job creates, evaluates and
destroys its own image graph. A failed start is not retried: sharp's
`metadata` and `toBuffer` then reject with its reason, and decoding and PNG
encoding keep working. A sharp spec is at most 4096 bytes and is read
without building a JSON tree. Keys the adapter does not read are ignored,
and a field it reads must hold a value of its type, never null. The libvips
kill hook stays off, so a cancelled job that is already inside libvips or
the PNG encoder finishes its call and then drops its output. Two libvips
failures at once can swap their error messages, because libvips keeps one
error buffer for every thread. Outside a run these functions run at the
call and return the value. This adapter does not provide full sharp API
compatibility.

`gr_image_codec_tests` generates references using actual sharp and executes the
actual Mask and RenderText classes in QuickJS. It compares raw pixels exactly,
including alpha edges and asymmetric resizes, and tests WebP codecs, channel
contracts, metadata, extraction, denied file reads and rejected resource inputs.


## Native media

The native timeline backend uses libavformat, libavcodec, libavutil,
libavfilter, libswscale and libswresample through `cmake/host-media.cmake`.
`HostOptions::allowMedia` enables these operations. `mediaEncoders` selects the
permitted encoder names, such as `libx264` and `aac`. Input and output paths
still require the existing file grants. Network inputs and external-file
filters are refused. Sessions, frames, pixels and byte sizes have native limits.

Media operations return promises and run on the run's CPU lane
(`src/host/media.cpp`). Each reader and encoder is a resource control block:
its operations run one at a time in call order, `close` lets accepted reads
finish, a failed write rejects the finish behind it, and `abort` and run
cleanup reject queued operations and stop the running one. The session's
libav contexts are freed on its lane's reaper. Stop is checked between
packets and frames, and libav's interrupt callback stops input I/O. A codec
or filter call and an output write run to completion. `hasEncoder` and
`openEncoder` stay synchronous.

Select the timeline's native compositor with the guest-local
`NODETOOL_TIMELINE_RENDERER=node` setting. The browser renderer has separate
runtime requirements. The native adapter supports the filter vocabulary used
by the timeline's frame and audio paths. Its focused tests encode and decode
H.264/AAC MP4 outputs with the original RenderTimeline process.

## Runtime library staging

The standalone runner and native node editor copy the configured Wasmtime shared
library beside their executable after linking. Their runtime search paths include
the executable directory. Other CMake executable consumers can call
`nodetool_stage_graph_runner_runtime(target)` after adding the graph-runner
subdirectory. Copy that library with the executable when distributing the build.
On Linux, the helper also stages the configured FFmpeg shared libraries and their
SONAME symlinks. This keeps libavfilter and the other media components together
when Qt supplies older libraries with the same SONAME. Distribute that complete
staged set. System dependencies such as libvips, ICU and Cairo remain required.
