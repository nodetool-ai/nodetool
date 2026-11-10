# Graph runner QuickJS host review

This page records a read-only review of the QuickJS host integration in
[`native/graph-runner/`](../../native/graph-runner/README.md). It covers
stability, performance and the cost of the guest bundle. The stability work
is planned in [graph-runner-stability-tasks.md](graph-runner-stability-tasks.md).

The review read the code. It did not build or run it. Sizes of
`build/guest.js` and `build/guest.bin` were measured. All times and memory
figures are estimates, and step P0 replaces them with measurements. Paths are
relative to `native/graph-runner/` unless they start with `native/`. Line
numbers can drift, so search for the named function when a line does not
match.

"Confirmed" means that the reviewer read the code path from end to end.
"Suspected" means that the path was not traced completely.

## Stability findings

### F1. The JS stack limit is larger than the thread stack (confirmed)

- `src/js/quickjs_engine.cpp:55` sets `JS_SetMaxStackSize(rt_, 8 MiB)`.
- `src/graph_runner.cpp:150` starts the worker as a plain `std::thread`. It
  gets the platform default stack: 512 KiB on macOS, 1 MiB on Windows.
- QuickJS sets its limit 8 MiB below the stack top it saw in
  `JS_NewRuntime`. The guard page is hit before QuickJS can throw a
  `RangeError`.
- The nested Code-node runtime (`src/host/sandbox_session.cpp:142-146`) sets
  its limit from the depth of the outer host call. It never calls
  `JS_UpdateStackTop` in `step()` or `resume()`, which run at other depths.
- Wasmtime gets a 512 KiB wasm stack on the same thread
  (`src/host/webassembly.cpp:41`, `src/host/sandbox_wasm.cpp:31`).
- **Failure:** `function f(){f()} f()` in a Code node, a deep `JSON.parse` or
  a deep `structuredClone` ends the node editor with SIGSEGV or SIGBUS on
  macOS. The node should fail instead.
- **Fix:** start the worker with an explicit stack of 16 to 32 MiB. Set the JS
  limit to that size minus space for C++, libav and Cairo frames. Give the
  nested runtime `min(requested, remaining)` and call `JS_UpdateStackTop` on
  each entry. Take the wasm stack from the same budget.

### F2. Posted messages use the context-call budget (confirmed)

- `guest/host/context-services.mjs:589` sends each message through
  `host.call("message", ...)`.
- `src/host/context.cpp:83` passes the call through `rules->admit()` and
  `checkRequestSize()`.
- `src/host/context.h:51` throws "Context call limit exceeded" after
  `maxCalls`. The default is 10000 for each run
  (`include/nodetool/context_options.h:136-137`). Provider `next` calls and
  tool calls share the same budget.
- **Failure:** a run that posts more than 10000 progress, chunk or log
  messages fails its node. A message larger than 1 MiB, such as a preview with
  inline image bytes, fails with "Context request size limit exceeded". The
  TypeScript runner has neither limit.
- **Fix:** give messages their own host function outside `ContextCallRules`,
  with a separate byte cap. Pass the text through unparsed when it cannot
  contain a GPU texture reference.

### F6. The main engine has no heap limit (confirmed)

- `src/js/quickjs_engine.cpp:54-56` never calls `JS_SetMemoryLimit`. A runaway
  guest allocation ends the process. It does not raise a JS out-of-memory
  error.
- Adopted buffers are outside the QuickJS allocator, so they do not move the
  GC trigger.
- `native/jobs/src/admission.cpp:105-108` refuses a JS-ledger charge at once.
  No code calls `JS_RunGC`, and `js::Engine` has no GC entry point.
- **Failure:** frames that only cyclic garbage holds stay charged. About 125
  adopted 1080p frames fill the 1 GiB cap for each runner. Later conversions
  then fail with "JavaScript buffers would exceed".
- **Fix:** add `Engine::collectGarbage()`. Call it once and retry before a
  JS-ledger refusal. Set a configurable `JS_SetMemoryLimit`.

### F7. The guest keeps every posted message for the whole run (confirmed)

- `guest/host/context-services.mjs:576` adds each message to `this._messages`
  (`guest/host/context.mjs:111`). The native path never removes them.
- **Fix:** do not keep a message after it goes to the host, or cap the list.

### F10. Host error messages are cut to 255 bytes and lose their type (confirmed)

- `src/js/quickjs_engine.cpp:265` uses `JS_ThrowPlainError(ctx, "%s", ...)`,
  which formats into a 256-byte buffer. A long message is cut, possibly in the
  middle of a UTF-8 character.
- Every C++ exception becomes a plain `Error`. A synchronous host function
  cannot raise an `AbortError`. A `JsError` from guest code in a re-entrant
  host call loses its original object and stack.
- **Fix:** build the error with `JS_NewError`, set `message` with
  `JS_NewStringLen`, and throw with `JS_Throw`. Carry an optional `name`.
  Rethrow the original JS exception for a `JsError`.

### F13. Unchecked casts of guest numbers to integers (confirmed)

- `src/kernel/guest.cpp:337`
- `src/host/media.cpp:1322`, `:1436`, `:1506`
- `src/host/sandbox_session.cpp:333-339`
- `src/host/sqlite.cpp:265`
- NaN or an out-of-range value is undefined behavior, and the UBSan build
  flags it ([native rule 15](../../native/AGENTS.md#verification)).
- **Fix:** validate the value first, as `textureArg` in `src/host/gpu.cpp`
  does.

### F14. Quotas for the engine lifetime are never reset (confirmed)

- `src/host/webassembly.cpp:44` allows 32 instances and 4 memories for each
  store. Line `:224` allows 16384 import callbacks. These stay held until the
  context is cleaned up, also after the guest drops the instance.
- `src/js/quickjs_engine.cpp:286` caps external buffer roots at 4096 and never
  releases one after a detach.
- `src/host/webassembly.cpp:80-84`: `depth++` is not undone if `set_fuel` or
  the `jthread` constructor throws. After that, fuel and the watchdog are
  never armed again.
- Timers have no count quota (`src/host/timers.cpp:33`,
  `src/kernel/task.h:135`).
- **Failure:** code that makes a wasm instance for each run reaches "limit
  exceeded" on the fifth memory and stays there until the context reloads.

### S1. Lane threads also use default stacks (suspected)

`src/kernel/host_lanes.cpp:222`. On macOS that is 512 KiB for libav, libvips
and libcurl calls. Their stack use was not measured. Fix it together with F1.

### S2. Typed arrays other than `Uint8Array` do not survive the value boundary (suspected)

`guest/values.mjs:35` tags only `Uint8Array`. A `Float32Array` becomes
`{"0":…,"1":…}` at about 20 bytes for each element and comes back as a plain
object. An `ArrayBuffer` becomes `{}`.

### S3. A posted coroutine handle has no liveness guard (suspected)

`src/kernel/guest.cpp:34` and `:38` post `st->handle` from promise callbacks
that can outlive `Loop::abandon()`. This is safe today only because no code
drains the job queue between `abandon()` and `context.reset()`. A future
drain at run cleanup would resume a destroyed frame.

### S4. Interrupt and teardown order (suspected)

- `src/js/quickjs_engine.cpp:263-265` turns the uncatchable interrupt into a
  catchable `Error` inside a re-entrant host call. The handler fires again at
  the next poll, so the effect is a delay.
- `src/graph_runner.cpp:480` reads `interrupted` before the `Runner`
  destructor sends its `release` calls. An interrupt during that teardown does
  not discard the context.

### S5. Bytecode compatibility check is weak (suspected)

`src/kernel/guest.cpp:12` and `src/js/quickjs_engine.cpp:210-222` check only
an 8-byte magic and QuickJS `BC_VERSION`. A stale `guest.bin` after a QuickJS
pin change with the same `BC_VERSION` runs unverified bytecode.

## Performance findings

### F3. A watchdog thread for each top-level WebAssembly call (confirmed)

- `src/host/webassembly.cpp:77-95` starts and joins a `std::jthread` for every
  exported-function call at depth 0. The watchdog sleeps in 1 ms steps, so a
  join can wait up to 1 ms.
- **Cost:** about 50 to 150 µs for each call. Yoga layout makes thousands of
  calls.
- `src/host/sandbox_wasm.cpp:28-44` makes a new engine, compiles the module
  again, and makes a store and a watchdog for each scalar call.
- **Fix:** one watchdog for each `State`, armed by an atomic deadline. Cache
  the function type for each export. Cache compiled modules by content hash.

### F4. Bundle load does extra work and nothing is lazy (confirmed)

The bundle plan below has the details. In short: the 160 MB file is read one
byte at a time (`src/graph_runner.cpp:220`) and copied in full
(`src/kernel/guest.cpp:216`). It stays in memory for the runner lifetime
(`src/graph_runner.cpp:196`). The bytecode embeds source text. All node
modules are evaluated at load.

### F5. Node values cross as JSON plus base64, with extra copies (confirmed)

- `src/kernel/guest.cpp:52` and `:82` copy `r["value"]`. A `std::move` removes
  one full copy of each node output.
- `src/kernel/actor.cpp:931`, `:933` and `src/kernel/runner.cpp:805` copy the
  result into each `node_update` and `output_update`, and again for each
  fan-out edge.
- `guest/values.mjs:33-62` calls a JS replacer and reviver for each property.
  A value with 1.5 million numbers costs about 1.5 million interpreter calls
  in each direction.
- **Fixes, cheapest first:** `std::move` at the two `guest.cpp` sites. Use the
  reviver only when the text contains `"__bytes__"`. Move or share large
  values. Keep bytes out of JSON with a C++ blob table and
  `Engine::adoptBytes`.

### F8. Synchronous host calls copy large buffers twice (confirmed)

`js::Engine` cannot lend bytes, so each synchronous call copies its input and
its output. Sites: `src/host/image_jobs.cpp:304-321`, `src/host/canvas.cpp:365`
and `:822-823`, `src/host/gpu_compute.cpp:301`, `src/host/media.cpp:1458`,
`src/host/gpu.cpp:167`, `src/host/sandbox_ocr.cpp:52`. Decode, OCR and
readback run on the worker thread, and a cancel cannot stop them.
**Fix:** add `Engine::viewBytes`, return outputs with `adoptBytes`, and move
the slow calls to the CPU lane.

### F9. One job round trip for each media frame (confirmed)

- `src/host/media.cpp:1319-1375` (`next`) returns one frame for each call. Ten
  minutes of 48 kHz audio is about 28000 calls, an estimated 1.5 to 3 s of
  overhead.
- `src/host/media.cpp:1331` reserves 64 MiB for each `next`, also for an 8 KB
  audio chunk. Line `:1352` fills the frame with zeros before it copies.
- `guest/host/media-native.mjs`: `decodeAudioToPcm` holds the PCM twice at its
  peak, and `convertAudioToWav` converts float to int16 one sample at a time
  in the interpreter. Reads and writes in `concatSegments` never overlap.
- **Fix:** return up to N frames or about 1 s of audio for each call. Reserve
  for each stream kind. Produce s16 in the filter graph (`aformat=s16`). Start
  the next read before the current frame is processed.

### F11. The Code-node bridge encodes one byte at a time (confirmed)

`src/host/sandbox_session.cpp:179` and `:187` encode and decode base64 in a JS
loop. A 5 MB buffer costs an estimated 1 to 3 s of the 30 s sandbox deadline.
QuickJS-ng has native `toBase64` and `fromBase64`. Each bridge call is also
serialized about three times in each direction.

### F12. Cancel reaches the guest through a 10 ms poll (confirmed)

`guest/host/context-services.mjs:159` runs `setInterval(poll, 10)` while an
abort listener exists. **Fix:** call a guest abort hook once from `onCancel`
(`src/graph_runner.cpp:440-448`).

## Bundle size plan

Measured: `guest.js` is 59.4 MB. Of that, 67% is `node_modules`, 32% is
`packages/*` and 1% is `guest/`. `guest.bin` is 160.2 MB, and about 108 MB of
it is embedded source text. The largest items are a 5.5 MB base64 font in
`packages/timeline`, 5.6 MB of `js-tiktoken` tables, 3.9 MB of
`@llamaindex/liteparse`, 2.7 MB of `text-encoding` tables and 2.3 MB of
Rapier with inlined wasm. 31 of the 69 node modules have no type that the
default profile can run. 4321 of 4561 modules already have lazy wrappers, but
the generated entry awaits all of them at load.

| Step | Change | Effect (estimated) | Effort |
|---|---|---|---|
| P0 | Time each load phase, write the esbuild metafile, and log `Function.prototype.toString` callers | Replaces the estimates | An hour |
| P1 | Read with one sized `read()`, take a span instead of a copy, and free the bundle after load (`src/graph_runner.cpp:196`, `:220`, `src/kernel/guest.cpp:216`) | −160 MB resident and −160 MB peak, load −0.35 to 0.65 s | About 30 lines |
| P2 | `JS_WRITE_OBJ_STRIP_SOURCE` at `src/js/quickjs_engine.cpp:177` and `:202` | `.bin` 160 → 48 to 55 MB, −105 MB resident. Stack traces keep file and line. `fn.toString()` returns a placeholder | 2 lines plus a parity run |
| P3 | Leave out node modules with no admitted type (`guest/build.mjs:71-74`) | `guest.js` −10 to 25 MB | Build only |
| P4 | Move the font, tiktoken ranks, legacy encoding tables and Rapier wasm out of the JS | −8 to 16 MB for each file | Medium |
| P5 | Evaluate a module on first use, with a type-to-module map made at build time | Load −0.5 to 1.0 s, idle heap −50 to 100 MB | Medium to high |
| P6 | Keep a warm spare context for the case where a context is discarded | Recovery about 0 s, one extra idle heap | Medium |
| P7 | esbuild `minifySyntax`, `minifyWhitespace`, `legalComments: "none"` | `guest.js` −7 to 10 MB | Minutes |
| P8 | A core bundle plus one bytecode chunk for each package | Load 0.15 to 0.3 s | High, only if P5 is not enough |
| P9 | Snapshots | QuickJS-ng has none. An arena rollback is fragile under the sanitizer builds | Not recommended |

The recommended order is P0, P1, P2, P3, P4, P5 and P6, then P7. Do P8 only if
the numbers after P5 call for it.

P2 risks: `docx` and `chrome-remote-interface` use `toString` checks that stop
seeing classes as classes. The parity suite must run against the stripped
`.bin`, because a source-mode load always keeps the source.
