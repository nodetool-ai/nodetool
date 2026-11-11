# JavaScript Sandbox (`src/js-sandbox.ts`)

**Navigation**: [Agents package rules](../AGENTS.md) → **JavaScript Sandbox**

Paths are relative to `packages/agents/` unless they name another package.

Reader-facing reference for this whole section:
[docs/javascript-sandbox.md](../../../docs/javascript-sandbox.md).

User-authored JS from a CodeAct action and `nodetool.code.Code` runs in a
**QuickJS WebAssembly sandbox** via `@sebastianwessel/quickjs`. The guest lives
in its own WASM heap, so runaway or malicious code can't corrupt the host V8
heap the way it could under the previous `node:vm` implementation.

Windows test portability: filesystem-containment tests must use
`tests/_helpers/filesystem-links.ts` instead of calling `symlink()` directly.
The helper creates directory junctions on Windows, so the tests do not require
Developer Mode or elevation, and regular directory symlinks elsewhere.
Normalize paths before comparing them with repository-style `/` paths, and use
Node itself for cross-platform process-spawn tests instead of POSIX utilities
such as `true`.
Normalize wrapper-produced module IDs before matching them: QuickJS uses `\`
on Windows and `/` on POSIX. Keep native media fixtures on software encoders;
a Windows hardware probe can find a codec that the installed driver cannot
open.

On Node the interpreter runs on a **`worker_threads` worker**
(`src/js-sandbox-worker/`): `buildSandbox` and every host bridge stay on the
main thread, the worker rebuilds each bridge as an RPC proxy over the port, and
a CPU-bound guest therefore blocks only its own thread — the server keeps
serving, and the websocket `stop` frame that cancels the run can still be read.
Abort is `worker.terminate()`, immediately — equally instant for a spinning
guest and a parked one, and nothing of value dies with the thread: logs and
emitted values accumulate main-side through the RPC dispatches, and a cancelled
action leaving no partial `state` write-back is the cleaner contract. Three
runs stay in-process: the browser (no `worker_threads`), a run with input
streams (the synchronous `stream.open` mirror has no handle names to seed), and
`NODETOOL_SANDBOX_INPROC=1`. `NODETOOL_SANDBOX_WORKER=require` turns any other
fallback into an error for CI. Under tsx/vitest the worker boots from an eval'd
bootstrap that registers `tsx/esm/api` — tsx's own `--import` hook skips worker
threads, and Node's built-in strip-only TS loader cannot parse the workspace
packages. The packaged backend ships the worker as a second esbuild bundle
(`scripts/bundle-backend.mjs` → `backend/js-sandbox-worker/worker-entry.js`).
The interpreter itself (`js-sandbox-worker/interpreter.ts`) is shared by both
paths, so they cannot drift; bridge results must be plain data — a function in
a bridge return value cannot cross `postMessage`, which is why the fetch bridge
returns body bytes and the guest prelude builds `text()`/`bytes()`/
`arrayBuffer()` over them.

Hard limits enforced by the runtime. Each row's default can be overridden per
invocation via `RunSandboxOptions.limits`, clamped to the ceiling in the last
column by `resolveSandboxLimits`:

| Limit | Default | Configured by | Ceiling |
|-------|---------|---------------|---------|
| Execution time | `timeoutMs` (30 s) | `setInterruptHandler` (CPU budget) + wall-clock race | — |
| Suspended time | `DEFAULT_SUSPEND_ALLOWANCE_MS` (30 min), or `INPUT_STREAM_SUSPEND_ALLOWANCE_MS` (unbounded) for a run with `onTakeInput` | `RunSandboxOptions.suspendAllowanceMs`, only with a `clock` | — |
| Guest heap | `GUEST_MEMORY_LIMIT` = 64 MB | `runtime.setMemoryLimit` (`limits.memoryLimitBytes`) | 512 MB |
| Call stack | `GUEST_STACK_LIMIT` = 512 KB | `runtime.setMaxStackSize` (`limits.stackLimitBytes`) | 8 MB |
| Fetch calls | `MAX_FETCH_CALLS` = 20 per run | counter inside bridge (`limits.maxFetchCalls`) | 100 |
| Fetch body | `MAX_RESPONSE_BODY_SIZE` = 1 MB | truncation inside bridge (`limits.maxResponseBodyBytes`) | 50 MB |
| Fetch timeout | `FETCH_TIMEOUT_MS` = 15 s | per-request `AbortController` (`limits.fetchTimeoutMs`) | 120 s |
| Output | `MAX_OUTPUT_SIZE` = 100 KB | `serializeResult` truncation (`limits.maxOutputSize`) | 10 MB |
| Random bytes | `MAX_RANDOM_BYTES` = 64 KB | `crypto.getRandomValues` clamp | — |
| Progress reports | `MAX_PROGRESS_CALLS` = 1000 per run, one per `PROGRESS_MIN_INTERVAL_MS` = 100 ms | counter + timestamp inside the bridge | — |
| Host module text input | `MAX_HOST_INPUT_CHARS` = 5 MB | check inside `host-modules/limits.ts` | — |
| Host module byte input | `MAX_HOST_INPUT_BYTES` = 10 MB | check inside `host-modules/limits.ts` | — |
| `sandbox-html` matches | `DEFAULT_SELECT_HTML_LIMIT` = 100 | `options.limit` | `MAX_SELECT_HTML_LIMIT` = 1000 |
| `sandbox-zip` inflation | `MAX_UNZIP_TOTAL_BYTES` = 50 MB total | check inside `host-modules/zip.ts` | — |
| `sandbox-xlsx` write | `MAX_WRITE_SHEETS` = 64, `MAX_WRITE_CELLS` = 250 000 | checks inside `host-modules/xlsx.ts` | — |
| `sandbox-ocr` words | `MAX_OCR_WORDS` = 20 000 | check inside `host-modules/ocr.ts` | — |
| `image.*` input | `MAX_IMAGE_INPUT_BYTES` = 25 MB | length check inside each bridge | — |
| Image / canvas pixels | `MAX_IMAGE_PIXELS` = 32 M, longest edge `MAX_IMAGE_DIMENSION` = 16384 | `assertSurfaceSize` | — |
| `image.decode` pixels | `MAX_DECODE_PIXELS` = 8 M | check inside the bridge | — |
| Canvas draw ops | `MAX_CANVAS_OPS` = 10 000 per render | count inside `renderCanvas` | — |

QuickJS's memory limiter counts its own heap objects; string and typed-array
payloads are not charged against it, so `memoryLimitBytes` bites on object
allocation, not on `new Uint8Array(n)`.

Secrets are scoped. `SandboxLimits.secretScope` (host-set, `null` for an
unscoped run) is the list of names a run may read; the `getSecret` bridge
refuses everything else, and `nodetool.secrets.get/tryGet/list` sit on top of
that one check rather than beside it. `nodetool.code.Code` exposes the list as
its `secrets` property, empty by default so a node written before scopes
existed keeps the reach it had. Tests: `tests/sandbox-secrets.test.ts`.

Exposed guest surface: `console`, `fetch`, `sleep`, `getSecret`,
`crypto.{randomUUID,getRandomValues,digest,hmac}` (WebCrypto-backed — `digest`
and `hmac` take SHA-1/256/384/512 and accept string or `Uint8Array` input, both
returning a `Uint8Array`), `workspace.{read,write,list,readBytes,writeBytes,
stat,root,copy,move,mkdir,remove}` (requires a `ProcessingContext` carrying a
`Workspace`; `remove` deletes one file or one empty directory, never a tree;
`stat` returns `{exists, size, isDirectory, isFile, isSymlink, modifiedMs,
createdMs, accessedMs}` and reports a missing path as `exists: false` rather
than throwing). Those calls go through `context.workspace`, not `node:fs`, so a
Code node behaves the same whether the run's workspace is a folder or a prefix
in object storage; `root()` answers the real directory when there is one and
`/workspace` otherwise, and containment is the workspace's own rule rather than
a symlink check here. `filesystemAccess: "host"` — the `lib.os` escape hatch a
host opts into, never guest code — still resolves real paths through
`node:fs`, the pure guest-side helpers
`toBase64`/`fromBase64`/`toHex`/`fromHex`/`parallelMap`/`createCanvas`
(UUIDs come from `crypto.randomUUID` and UTF-8 from the native
`TextEncoder`/`TextDecoder` — the old `uuid`/`utf8Encode`/`utf8Decode`
aliases are gone),
`progress(percent, message?)`, `format.{number,date,relativeTime,list}`,
`image.{info,stats,decode,blank,pad,grid,resize,crop,rotate,flip,adjust,composite,convert}`,
`audio.{info,normalize,trim,concat,mix,reverse,fadeIn,fadeOut,repeat}`,
`video.{info,trim,resize,rotate,addAudio,extractAudio,extractFrame}`,
`canvas.measureText` (plus `canvas.render`, the undocumented plumbing behind
`createCanvas(...).toBytes()`), and any caller-supplied `globals`. `fetch` sends
a `Uint8Array` body as raw bytes instead of JSON. Every one of these is a
**capability**, not a library — libraries are imports (below).

`stream` is the input side of `emit`, built in the guest prelude over one
awaitable host bridge: `for await (const item of stream(name))` reads one input
handle in order until end-of-stream, `stream.any()` interleaves every handle as
`[handle, value]` pairs, `await stream.first(name)` takes the next value
(`undefined` at end-of-stream), and `stream.open(name)` answers synchronously
whether more can arrive. The host supplies the values through
`RunSandboxOptions.onTakeInput` (called with `null` for `any()`) and the probe
through `onStreamOpen`; without an `onTakeInput` every verb throws
`NO_INPUT_STREAM_MESSAGE`. The guest pulls, so an item nobody asked for stays in
the host's inbox — backpressure costs nothing. Time parked on a take is
clock-suspended: a streaming body's timeout meters its own execution, and how
long upstream takes is the run's cancellation to bound, not the timeout's.
Tests: `tests/js-sandbox-stream.test.ts`.

`progress` is fire-and-forget: it reports to
`RunSandboxOptions.onProgress`, clamped to 0–100 with the message truncated to
500 chars, and is a no-op when the caller passes no sink. `nodetool.code.Code`
wires it to `context.postMessage({ type: "node_progress", … })`, the same
channel the Python worker uses, so a long-running snippet drives the node's
progress bar.

`image`, `audio`, `video`, and `canvas` are the media namespaces. Image and
canvas are host bridges over a real
2D canvas (`src/sandbox-media.ts`). The backend is picked at first use:
`@napi-rs/canvas` (Skia) on Node, loaded through `loadCanvas` from
`@nodetool-ai/runtime` so no bundler
pulls the native addon into a browser graph — it is already staged as an
external by `scripts/bundle-backend.mjs` — and `OffscreenCanvas` +
`createImageBitmap` in the browser runner. Ops: `info`, `stats`, `decode`,
`blank`, `pad`, `grid`, `resize` (`fit`: cover/contain/fill), `crop`, `rotate`
(grows to the rotated bounding box), `flip`, `adjust` (the CSS filter set),
`composite` (layers with position, size, opacity and `globalCompositeOperation`
blend mode) and `convert`. Encoding to `jpeg` fills transparency with
`background`, white by default.

**`image.encode` is gone.** It took `width*height*4` bytes *from the guest*, so
using it meant building a pixel array in the guest heap and shipping it across
— and every observed use was a backdrop, 6 MB of zeros moved to produce a 6 KB
PNG. After handles it was the largest guest→host payload left in a normal image
run, and the manifest advertised it, so it read as the way to make an image.
Three ops cover what it was reached for, all host-side with nothing crossing:
`blank(width, height, {color})` for a surface, `pad(image, {all|top|right|
bottom|left, color})` to grow the canvas without scaling (what
`nodetool.image.CanvasResize` does in a graph), and `grid([image, …],
{columns, gap})` to lay images out (which retired `lib.grid.CombineImageGrid`) —
which is the whole of "generate two images and combine them", the task that
started this. Host code that genuinely holds pixels keeps the direct path
through `encodePixels`, which is not on the guest bridge.

`image.stats(image)` is the counterpart to handles: once the guest stops
holding images it cannot answer anything about one, and `decode` — the only way
to look — pulls every pixel across, which is the cost handles removed. `stats`
reads them host-side and answers in a hundred bytes: per-channel mean/min/max,
mean luminance, and whether the image is opaque. It carries no
`MAX_DECODE_PIXELS` bound because it transfers nothing.

**Media transforms trade in handles, not bytes**
(`src/sandbox-media-handle.ts`). Each image, audio, or video op takes a handle,
a media ref (`asset://` and every uri `media.*` resolves), or raw bytes, and
returns a *handle*: a small plain object
(`{uri: "sandbox://media/<id>", mimeType, byteLength, width, height}`) naming
bytes the host holds for the run. So a chain — and a generated image fed
straight in — moves nothing across the boundary but small objects.

That is the difference between working and not. The guest is a courier: in the
shape that motivated this (generate two images, combine them) it never reads a
pixel. Carrying them *as* bytes cost a guest→host copy plus a base64 round trip
per hop, several times the payload live in the guest, and past roughly 16 MB a
run aborted the runtime at teardown. A long op chain over a single photo-sized
PNG went from aborting after a few ops to finishing in seconds once handles
replaced bytes.

Audio and video transforms use Mediabunny directly. Browsers use WebCodecs;
Node registers Mediabunny's server codec adapter. No audio-node or video-node
package is imported or exposed to guest code. `video.extractAudio` returns an
audio handle and `video.extractFrame` returns an image handle.

Two image exceptions, both returning plain data: `info` and `decode` exist
to report what is *in* an image, and `decode` is the one call that must hand
over real pixels. `image.bytes(handle)` is the only door back to encoded bytes
and needs no context — reach for it when the body parses the bytes itself, not
to move an image between calls. `media.toImage(handle)` promotes a handle to a
durable asset; nothing else writes storage, so a three-op chain does not leave
three rows behind. A handle lives for its run: using a stale one says so rather
than blaming its uri. `limits.runMediaBytes` (default 256 MB) bounds what one
run may hold — the aggregate the per-call ceilings never covered, so exhaustion
is a sentence naming the limit instead of an Emscripten assertion.

A canvas *context* is a host object with methods, which the plain-data bridge
contract cannot carry, so drawing is recorded rather than proxied: the guest
helper `createCanvas(width, height)` returns a surface whose `getContext("2d")`
takes the ordinary Canvas 2D calls **synchronously**, appending each to a draw
list, and `await surface.toImage({format, quality, background})` ships the whole
list through `canvas.render` to be replayed against a real context and encoded,
answering with a handle like every other image producer. `toBytes()` keeps its
name's promise and pays for the bytes explicitly.
`drawImage` takes image bytes, not an image object. Gradients work the same way
— `createLinearGradient` returns a tagged handle that the renderer swaps for the
real gradient when it is assigned to `fillStyle`. The method and property
allowlists live in `src/sandbox-canvas-api.ts`, read by both the guest recorder
and the host replay, and an op naming anything outside them is refused. The
recorded ops are marshaled out of the guest one object at a time (~1 ms each),
which is what `MAX_CANVAS_OPS` really bounds — for heavy composition reach for
`image.composite` instead of tens of thousands of primitives.
`canvas.measureText(text, font?)` returns text metrics so text can be laid out
before it is drawn.

Libraries are **imports**, never globals. Every library the sandbox offers is a
sandbox package a node imports at the top of its body — the import *is* the
declaration; there is no `data.*` namespace any more. Two kinds:

- **Guest packs** — the M3 compiler bundles the library into QuickJS:
  `@nodetool-ai/sandbox-yaml` (js-yaml), `-dates` (date-fns), `-markdown`
  (marked).
- **Host packs** (`src/host-modules/`) — the library runs where the sandbox
  runs, behind a generated ESM facade over a per-run dispatcher:
  `-csv` (papaparse), `-html` (cheerio + turndown), `-xml` (fast-xml-parser),
  `-xlsx` (exceljs), `-zip` (fflate), `-diff` (diff), `-ocr` (tesseract.js),
  `-tfjs` (TensorFlow.js and its model zoo), `-docx` (docx), `-mammoth`
  (mammoth), `-epub` (epub2), `-pptx` (office-text-extractor), `-tokens`
  (js-tiktoken). These are the
  libraries the guest cannot hold — Node builtins, a DOM, a file path instead of
  a buffer, a limit the guest could not enforce on itself, or state that has to
  outlive a run. Four more are NodeTool's own code rather than a library: `-aws`
  (SigV4 signing), `-notion`, `-supabase` and `-twilio` build an
  authenticated request and return it; the guest sends it with its own `fetch`,
  so the fetch cap and the SSRF guard still apply. They replace the
  S3/Notion/Supabase/Twilio nodes. Apify was a fifth and is not: handing the
  guest a token to fetch and poll with is the wrong shape for a paid service
  running third-party code, so it became the `apify` capability module instead
  (`docs/apify-integration.md`).

### Host modules (`src/host-modules/`)

The host-JS analog of the WASM path below, and the same mechanism. A pack's
manifest entry is `{"kind": "host", "host": "<id>"}` — an **id**, never code.
`SANDBOX_HOST_MODULES` (`@nodetool-ai/protocol`) is the registry: it names every
id, the one package allowed to declare it, and its exports. The specifier
resolves to `generateSandboxHostFacade`'s output — one async export per registry
export plus a default namespace — importing the private `nodetool:host-bridge`
module, which the loader serves only to generated facades.

`createSandboxHostDispatcher` is the boundary. It refuses a resolution naming an
unknown id or claiming another pack's id, then validates the module key, the
export name and the argument list on every call before an implementation is even
loaded. The dispatcher binding is deleted before the user IIFE starts; a module
that grabs it during linking gains nothing beyond the run's declared surface.

`registry.ts` loads each implementation lazily, and each implementation imports
its library lazily inside itself, so nothing sits in an entry graph. Small
libraries are inlined into the packaged `server.mjs`. The large ones (PDF,
Office, OCR, TensorFlow.js, Fabric) load through `importOptionalLibrary`
(`host-modules/limits.ts`) with a runtime package id. The desktop app installs
them on first use, and the dispatcher reports a missing one on
`RunSandboxResult.missingRuntimePackage`, which the Code node rethrows so the
editor offers the install. Results go out
as plain data with bytes tagged at any depth (`toGuestBytesDeep`,
`sandbox-bytes.ts`), and errors as tagged objects — the marshaling rule every
bridge follows.

Safety limits live **inside** the implementations, where nothing can route
around them: `MAX_UNZIP_TOTAL_BYTES` in `zip.ts`, the select limits in
`html.ts`, the write caps in `xlsx.ts`, the shared input caps in `limits.ts`. Tests:
`tests/host-modules.test.ts` (libraries end to end, the dispatcher's refusals,
a forged manifest, every limit) and
`packages/sandbox-compiler/tests/packs.test.ts` (every shipped pack through the
real install path).

The guest's own loader serves only the sandbox packages a run may reach — for a
Code node, the packs its body statically imports, resolved against the host's
catalog; for a CodeAct session, its allowlist. Dynamic `import()`
and `require` never resolve. The browser runner fetches those modules over
`GET /api/sandbox-modules/*` and verifies each body before it runs, so the same
rules hold client-side.

A session that allows packages also carries **`get_sandbox_package_docs`**
(`capabilities/packs.ts`): it serves one pack's SKILL.md, refuses a
specifier off the session allowlist, and wraps the body of a pack the operator
has not put on the pack-loader allowlist in `<untrusted-package-docs>` — read
as reference, never as instructions. The ambient prompt tier stays one
sanitized, capped line per allowed specifier.

`sandboxPackageSkills` (`codeact/sandbox-package-docs.ts`) turns a trusted
pack's skill into an ordinary `AgentSkill`, which is the injection tier the
untrusted path is contrasted against. **No host mounts it.** Its one caller was
the retired `Agent`, so a trusted pack's body reaches the model only through
`get_sandbox_package_docs`. Wiring it into the chat session's skill catalog is
the follow-up; nothing depends on it being absent.

### Host WASM modules (`src/wasm-sandbox/`)

A pack may declare a WASM module. Its specifier resolves to a **generated ESM
facade** (`generateSandboxWasmFacade`, `@nodetool-ai/protocol`) with one async
export per manifest export, calling a **per-run dispatcher** through a private
bridge module. The call contract is scalar-only: `i32`/`f32`/`f64`, at most 8
arguments, at most one result, and a void export resolves `undefined`.

**Stateless by contract.** Each call instantiates fresh from the cached module
inside the worker, runs, and discards the instance — mutable globals and linear
memory never carry from one call to the next. A pack needing state keeps it in
guest JS and passes scalars in.

| Bound | Default (also the ceiling a manifest may lower to) |
|---|---|
| Worker pool (process-wide) | 4 — not manifest-configurable |
| Call concurrency per invocation | 2 |
| Calls per invocation | 256 |
| Aggregate WASM wall clock per invocation | 30 s |
| Per-call timeout | 5 s, then the worker is terminated **and replaced** |

The aggregate wall clock is a **reservation**, not a meter read on completion.
A call is admitted only after taking `min(perCallTimeout, remaining)` out of
the budget, so concurrent calls divide one cap instead of each seeing the whole
remainder, and the reservation is what bounds that call's timeout. On
completion the reservation is replaced by the real duration — a fast call
refunds, one cut at its timeout keeps the charge — so the budget stays the sum
of call durations it documents.

Cancelling the run reaches the worker, not just the caller. The signal is
rechecked after every await on the way to dispatch — compiling a module and
waiting for a concurrency slot both outlive an abort — and it is passed into
the pool, where it terminates the worker the way a timeout does. A guest export
has no yield point, so abandoning the promise would leave the thread spinning
for the rest of its timeout on work nobody wants.

The dispatcher is the boundary, not the hiding: it serves only the run's
declared WASM modules and validates module identity, export allowlist, argument
count, and argument type before any worker runs — `i32` rejects out of range
rather than wrapping, `f32`/`f64` take `NaN` and infinities. The bridge module
is refused to every importer but a generated facade, and the dispatcher binding
is deleted before the user IIFE starts. A pack module that grabs the binding
during linking gains nothing beyond the run's own declared surface.

`workers.ts` is the platform seam: Node `worker_threads`, browser Web Worker,
both created from an inline source string so no entry file has to survive tsx,
vitest, `dist/`, and the esbuild backend bundle. The browser path is written
but unexercised here — no browser harness lands until M2.

Fixtures: `tests/fixtures/sandbox-wasm/` (the reference module, its WAT, and the
contract cases as data). Tests: `tests/js-sandbox-wasm.test.ts` (end to end,
real workers), `tests/wasm-sandbox-host.test.ts` (conversion, budgets, pool).

`format` exists because QuickJS ships no `Intl`: each member is a host bridge
over `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` and
`Intl.ListFormat`, defaulting to locale `en-US`. All four are async (they follow
the never-reject convention), so a bad locale or option arrives in the guest as
a thrown `Error` carrying Intl's own message. `eval` and `Function` are deleted at init so the user cannot
re-enter dynamic code generation. Core JS (`JSON`, `Math`, `Date`, `Map`,
`URL`, `TextEncoder`, etc.) is QuickJS's native implementation, not a
host-bridged version.

**Async concurrency**: a bridge call starts its host-side work when invoked,
not when awaited, so `Promise.all`/`allSettled`/`race`/`any` over `fetch`,
`workspace.*` or any other bridge run the host operations in parallel — five
fetches under `Promise.all` take one round trip. `parallelMap(items, fn,
concurrency?)` is the bounded form (order-preserving, default 5, max 32,
rejects on first failure). The per-run fetch cap counts parallel calls the
same as serial ones. Timer globals (`setTimeout`, `setInterval`,
`setImmediate` and their clears) are deleted inside the user-code module —
the engine re-installs host-backed versions on every evaluation, so the
prelude alone can't remove them; `wrapCode` does. `sleep` stays the only
timer. Tests pinning all of this: `tests/js-sandbox.test.ts`
("async concurrency").

**State sync-back**: object-typed globals are deep-replaced on the host after
the guest runs, so `CodeNode`'s `state` object persists across invocations.
Primitive globals pass by value (no sync).

**Suspending the clock** (`createSandboxClock`, `RunSandboxOptions.clock`): the
timeout bounds *guest execution*, and a program waiting on a permission prompt
is not executing — it is waiting on a person. Charged to the same budget, the
wait kills the program that asked, and the answer then resolves nothing. A
caller that owns such a wait wraps it in `clock.suspend()`; the suspended time
is added back to `timeoutMs`, so the program resumes with the budget it had.
Suspensions nest, and the engine's own abort moves out to
`timeoutMs + suspendAllowanceMs` as the backstop for a prompt nobody answers.
The interrupt handler still cuts a runaway loop at exactly `timeoutMs` of
running time. The websocket chat runner owns one clock per turn and suspends it
around every tool- and plan-approval round trip.

**Known QuickJS limitations**:
- `url.searchParams.set(...)` doesn't propagate back to the parent URL. Build
  the query via `URLSearchParams` directly.
- Host async functions must never reject — `js-sandbox.ts` wraps them in a
  `neverReject` adapter that returns a tagged error object, which a guest
  prelude rewraps into a real `throw`. Working around a known handle leak in
  `@sebastianwessel/quickjs@3.0.1` (tracked as `list_empty(&rt->gc_obj_list)`
  assertion on runtime dispose). This convention only covered a *top-level*
  function global; one nested inside an object global (`{ nodetool: {
  timelines: { edit() {...} } } }`, the shape a hermetic bake's stub injects)
  reached the guest through the wrapper's own generic object marshaling
  instead, skipping the tagging. `wrapNestedFunctionsDeep`
  (`js-sandbox-worker/interpreter.ts`) now applies the same wrap at any
  nesting depth; pinned by "a function nested inside a data global" in
  `tests/js-sandbox.test.ts`.
- The wrapper's `handleToNative.setProperties` skips disposal of `getProp`
  handles for missing descriptor fields and boolean flags. Those primitive
  allocations survive runtime disposal in a shared WASM engine. Repeated
  closure-bearing objects reproduce the cleanup assertion without NodeTool
  packs or serializer registration. The shared loader in
  `src/js-sandbox-worker/engine.ts` releases these allocations and returns
  equivalent static handles before any wrapper bootstrap runs. It also owns
  the string handles the wrapper forgets when reading symbol descriptions.
  Both in-process
  and worker execution keep their cached engines. Do not add caller-specific
  fresh-engine options. Regressions are `tests/js-sandbox-engine.test.ts` and
  `tests/js-sandbox-worker-engine.test.ts`.
  See [the reproduction and upstream issue draft](quickjs-descriptor-leak.md).
- quickjs-emscripten-core reads C output pointers through a typed-array view
  made before the call. A call that grows the WASM heap detaches that view,
  so `executePendingJobs` read the job's context pointer as `undefined` and
  built a second context nobody freed. Any guest that allocated a few
  megabytes after its first `await` then aborted on free with
  `list_empty(&rt->gc_obj_list)`. `src/js-sandbox-worker/engine.ts` rebuilds
  the view over the current heap. Pinned by "frees the runtime after a job
  grows the WASM heap" in `tests/js-sandbox-engine.test.ts`.
- A worker that reports an interpreter failure is discarded. Guest exceptions
  are ordinary results and keep the worker reusable. The pool creates a
  replacement on the next acquisition, as tested in
  `tests/js-sandbox-worker-protocol.test.ts`.
- Every `Lifetime` taken from the engine must be disposed, including the one
  `ctx.getArrayBuffer()` returns. The typed-array serializer dropped it, so
  each `Uint8Array` crossing guest → host leaked a handle and a run moving
  ~16 MB tripped the same `list_empty(&rt->gc_obj_list)` assertion — *after*
  the guest had computed its answer, so the result was produced and then
  thrown away. Fixed; pinned by "guest→host binary volume" in
  `tests/js-sandbox.test.ts`.
- The wrapper's marshaler recurses on a **function**: a function's prototype
  chain leads back to itself, so `console.log(fn)` — or logging a module
  namespace, which is what `import * as ns` gives — blew the host stack, left
  handles alive, and aborted the runtime on free with the same
  `list_empty(&rt->gc_obj_list)`. The whole run died, after its work was done,
  for a debug print. `console.*` arguments are formatted **guest-side** now
  (the init prelude wraps the host console), so only strings cross: a function
  prints as `[Function: name]`, a cycle as `[Circular]`, and everything else
  exactly as before. Pinned by "logs a function without killing the runtime"
  in `tests/js-sandbox.test.ts`.
- An engine failure never reaches `runInSandbox`'s own `await`: an Emscripten
  `abort()` arrives as a WASM `RuntimeError`, and a marshaling failure (guest
  OOM while a host return value is written into the guest) throws inside a
  promise continuation the library never catches. Unhandled, that killed the
  host process and the tool call it was serving returned *nothing* — a chat
  turn that simply stopped, with nothing for the agent to read or retry.
  `guardHostProcess` claims those rejections and fails the run;
  `describeEngineFailure` turns them into an actionable message instead of raw
  assertion text. Anything not attributable to the engine is re-thrown, so a
  genuine host bug still crashes.
- The wrapper's Node-compat bootstrap is served cheaper sources
  (`src/sandbox-bootstrap-modules.ts`). Before our sandboxed function is called
  it compiles ~12KB of polyfills — `node:buffer`, `node:util`, `node:url`,
  `Headers`, `Request`, `Response` — into the fresh runtime, and the init
  prelude then deletes `Buffer`, `Headers`, `Request` and `Response`. Those
  imports resolve through *our* module loader, so four are served as empty
  modules and `node:util` as the `TextEncoder`/`TextDecoder` pair the guest
  keeps; `node:url` still comes from the wrapper, because `URL` and
  `URLSearchParams` are capabilities and a hand-rolled URL parser is not a
  saving worth making. Measured: 5.96ms → 3.28ms of per-run setup, against
  0.34ms for a bare QuickJS context. A wrapper release that renames these
  modules loses the saving silently, so `tests/js-sandbox-modules.test.ts`
  asserts that every id we stub is one the bootstrap actually requests.
- Structured data crosses as JSON, not as handles
  (`src/sandbox-json-transport.ts`). The wrapper marshals an object node by node
  — four `evalCode` compilations plus a descriptor copy per property — so a run
  handed 5 000 rows spent ~2 s reading them and ~0.8 s handing them back before
  running a line of its own. The guest now builds its result with
  `JSON.stringify` and the host parses it, the host encodes injected globals for
  the prelude to parse, and `emit`/`output` arguments take the same path;
  measured 17–35× on those shapes. Typed arrays and strings over 8 KB ride a
  sidecar the marshaler moves whole, so bytes keep the fast native serializer
  and a megabyte of text is not escaped and unescaped. Dates, non-finite
  numbers and `undefined` properties carry markers. A value the encoder cannot
  represent (a function, a bigint, a `Map`, a class instance) falls back to the
  wrapper's marshaling; a **cycle** is refused by name, because the fallback
  follows it until the runtime aborts. Benchmark:
  `npm run bench:sandbox --workspace=packages/agents`.
- Binary crosses the boundary asymmetrically. Guest → host is handled by the
  typed-array serializers (`addSerializer`), so a guest `Uint8Array` reaches a
  bridge as a native one. Host → guest is not: a returned `Uint8Array` arrives
  in the guest as a numeric-keyed plain object. Bridges that produce bytes
  therefore return a base64 marker object and the guest prelude rebuilds a real
  `Uint8Array` — the pattern to follow for any new binary bridge. The
  prelude's deep revive must stop at a typed array: walking a rebuilt
  `Uint8Array` key by key made one string per byte, and a photo-sized
  `media.bytes` aborted the runtime on free. Pinned by "host→guest binary
  volume" in `tests/js-sandbox.test.ts`.
- `serializeResult` scans for typed arrays at **any** depth. It used to look
  only one level in, so binary nested deeper fell onto the `JSON.stringify`
  path, where a `Uint8Array` becomes `{"0":137,"1":80}` — lossy, and
  indistinguishable from a user's own integer-keyed map. The streaming path hit
  this every time, since `genProcess` returns an array of yielded objects and
  the bytes are always at depth 2. The walk is cycle-safe and depth-capped
  (`SERIALIZE_MAX_DEPTH`); a cyclic value still falls through to `String`.
