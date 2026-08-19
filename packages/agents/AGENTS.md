# Agents Package

## Agent Memory (`@nodetool-ai/runtime` → `context.memory`)

Every `ProcessingContext` carries an `AgentMemory` instance at `context.memory`. It is the **single source of truth** for everything shared between steps, tasks, sub-agents, and tools. Do not introduce a parallel result map in any executor — read and write through `context.memory`.

### Access pattern: progressive disclosure via tools

Memory contents are NOT auto-injected into prompts. Agents access memory through three capabilities that are auto-attached to every step (and to every team iteration). They are the `shared` capability module (`src/capabilities/shared.ts`) — kept apart from `memory`, which is thread memory and a different lifetime — and `getMemoryTools()` (`src/tools/memory-tools.ts`) is the belt the executors mount them from:

| Tool | Object model | Purpose |
|---|---|---|
| `list_shared` | `nodetool.shared.list(filters)` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `read_shared` | `nodetool.shared.read(keys)` | Fetch full values for specific keys |
| `share_result` | `nodetool.shared.publish(key, value, {title, description})` | Publish a value under `shared:<key>` |

The default execution system prompt documents the `nodetool.shared` form, and the three wire names drop out of the raw tool catalog the way every other wrapped tool does. The user message names only **specific** upstream keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn` via `upstreamMemoryKeys`) — values are pulled on demand.

### Key namespaces

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

memoryKeys.step("step_1");         // "step:step_1"  — step result
memoryKeys.task("research_phase"); // "task:research_phase"  — task result
memoryKeys.input("customer");      // "input:customer"  — caller-supplied input
memoryKeys.shared("note");         // "shared:note"  — cross-agent scratch
```

### Who writes what

| Writer | Trigger | Key | Kind |
|---|---|---|---|
| `CodeActExecutor` | Step completion | `step:<step.id>` | `step_result` |
| `CodeActExecutor` | Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| `TaskExecutor` | Startup / process-mode aggregation | `input:<key>` / `step:<step.id>` | `input` / `step_result` |
| `ParallelTaskExecutor` | After a task completes (idempotent) | `task:<task.id>` | `task_result` |
| `share_result` tool | Agent / sub-agent publish | `shared:<key>` | `shared` |

`share_result` is restricted to the `shared:` namespace so agents can't spoof step / task / input results. Internal executors write directly through `context.memory.set` for their owned namespaces.

### Custom prompts are preambles, not replacements

A step executor always builds the default execution prompt (the CodeAct action contract, the output schema, the `finish()` discipline). A caller-supplied `systemPrompt` is layered as a preamble *before* the default — it cannot override the execution contract. Earlier versions allowed this and broke result capture in plan mode.

### Final synthesis: CompilerAgent

`Agent` ends with a dedicated `CompilerAgent` pass after `ParallelTaskExecutor` finishes. The compiler reads the gathered memory snapshot, fetches values via `read_shared`, and produces the final deliverable:

- **Structured mode** (an `outputSchema` is set): `finish_step` is included in the toolset, and the compiler returns a schema-conformant value.
- **Prose mode** (no `outputSchema`): `finish_step` is omitted; the compiler emits a final assistant message and the absence of any tool call ends the loop. The text becomes the result.

The planner is told NOT to create an aggregation/synthesis step — final assembly is the compiler's job. There is no "schema grafted onto the last step" hack anymore.

### Threading task-level deps through executors

`ParallelTaskExecutor` derives `task.dependsOn.map(memoryKeys.task)` and forwards it as `upstreamMemoryKeys` to `TaskExecutor`, which forwards it verbatim to every step executor. The step's user message renders these as `- task:<id>` hints next to the intra-task `step:<id>` deps. The agent calls `read_shared` when it needs the values.

### Tests

- `packages/runtime/tests/agent-memory.test.ts` — unit tests for `AgentMemory`
- `packages/agents/tests/memory-tools.test.ts` — unit tests for the `shared` capabilities `list_shared` / `read_shared` / `share_result`, and the belt `getMemoryTools()` builds from them
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end through `Agent`, including a fake-provider round trip that drives `list_shared` → `read_shared` → `finish_step`
- `packages/agents/tests/_helpers/mock-context.ts` — shared mock context with a real `AgentMemory` for executor tests

When asserting memory writes in tests, prefer `context.memory.has(memoryKeys.task("..."))` and `context.memory.subscribe(...)` over spies on `set` / `storeStepResult`.

For the full API reference, tool schemas, propagation flow, design decisions, and troubleshooting, see [docs/agent-memory.md](../../docs/agent-memory.md).

## JavaScript Sandbox (`src/js-sandbox.ts`)

Reader-facing reference for this whole section:
[docs/javascript-sandbox.md](../../docs/javascript-sandbox.md).

User-authored JS from a CodeAct action and `nodetool.code.Code` runs in a
**QuickJS WebAssembly sandbox** via `@sebastianwessel/quickjs`. The guest lives
in its own WASM heap, so runaway or malicious code can't corrupt the host V8
heap the way it could under the previous `node:vm` implementation.

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
stat,root,copy,move,mkdir,remove}` (requires a `ProcessingContext`; `remove`
deletes one file or one empty directory, never a tree; `copy`/`move` check the
source for read containment and the destination for write containment;
`stat` returns `{exists, size, isDirectory, isFile, isSymlink, modifiedMs,
createdMs, accessedMs}` and reports a missing path as `exists: false` rather
than throwing), the pure guest-side helpers
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
`@napi-rs/canvas` (Skia) on Node, loaded through `importHidden` so no bundler
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
{columns, gap})` to lay images out (what `lib.grid.CombineImageGrid` does) —
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
per hop, ~2.3× the payload live in the guest, and past roughly 16 MB a run
aborted the runtime at teardown. Measured on a 45-op chain over a 2.2 MB PNG:
132 s and an abort at three ops, against 4.7 s with handles.

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
sandbox package a node declares in `packages` and imports at the top of its
body; there is no `data.*` namespace any more. Two kinds:

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
its library lazily inside itself — so nothing sits in an entry graph, esbuild
still inlines them into the packaged `server.mjs`, and Vite resolves the browser
builds for the in-browser runner, where the "host" is the page. Results go out
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

The guest's own loader serves only the sandbox packages a run declares — a Code
node's `packages` property, or a CodeAct session's allowlist; dynamic `import()`
and `require` never resolve. The browser runner fetches those modules over
`GET /api/sandbox-modules/*` and verifies each body before it runs, so the same
rules hold client-side.

A session that allows packages also carries **`get_sandbox_package_docs`**
(`capabilities/packs.ts`): it serves one pack's SKILL.md, refuses a
specifier off the session allowlist, and wraps the body of a pack the operator
has not put on the pack-loader allowlist in `<untrusted-package-docs>` — read
as reference, never as instructions. A trusted pack's skill instead registers
as an ordinary `AgentSkill` (`AgentOptions.sandboxPackages`). The ambient
prompt tier stays one sanitized, capped line per allowed specifier.

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
  assertion on runtime dispose).
- Every `Lifetime` taken from the engine must be disposed, including the one
  `ctx.getArrayBuffer()` returns. The typed-array serializer dropped it, so
  each `Uint8Array` crossing guest → host leaked a handle and a run moving
  ~16 MB tripped the same `list_empty(&rt->gc_obj_list)` assertion — *after*
  the guest had computed its answer, so the result was produced and then
  thrown away. Fixed; pinned by "guest→host binary volume" in
  `tests/js-sandbox.test.ts`.
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
- Binary crosses the boundary asymmetrically. Guest → host is handled by the
  typed-array serializers (`addSerializer`), so a guest `Uint8Array` reaches a
  bridge as a native one. Host → guest is not: a returned `Uint8Array` arrives
  in the guest as a numeric-keyed plain object. Bridges that produce bytes
  therefore return a base64 marker object and the guest prelude rebuilds a real
  `Uint8Array` — the pattern to follow for any new binary bridge.
- `serializeResult` scans for typed arrays at **any** depth. It used to look
  only one level in, so binary nested deeper fell onto the `JSON.stringify`
  path, where a `Uint8Array` becomes `{"0":137,"1":80}` — lossy, and
  indistinguishable from a user's own integer-keyed map. The streaming path hit
  this every time, since `genProcess` returns an array of yielded objects and
  the bytes are always at depth 2. The walk is cycle-safe and depth-capped
  (`SERIALIZE_MAX_DEPTH`); a cyclic value still falls through to `String`.

## Running Agents from CLI

### Interactive Chat

Every session runs the unified agent loop; `-a, --agent` and `--no-agent` are
accepted for backwards compatibility and do nothing.

```bash
# Start a session
nodetool-chat

# With specific provider and model
nodetool-chat --provider anthropic --model claude-sonnet-5

# With workspace directory
nodetool-chat --workspace /path/to/project

# Connect to WebSocket server
nodetool-chat --url ws://localhost:7777/ws
```

### Piped Input

```bash
echo "Summarize this codebase" | nodetool-chat --provider anthropic
```

### Interactive Commands

```
/agent    — Toggle agent mode on/off
/model    — Set model: /model claude-opus-4-6
/provider — Set provider: /provider openai
/tools    — List enabled tools
```

### Programmatic Usage

```typescript
import { Agent } from "@nodetool-ai/agents";
import { createRuntimeContext } from "@nodetool-ai/runtime";

const ctx = createRuntimeContext({ jobId: "...", userId: "1", workspaceDir: "." });

const agent = new Agent({
  name: "my-agent",
  objective: "Research and summarize AI trends",
  provider,          // BaseProvider instance
  model: "claude-sonnet-5",
  tools: [readFileTool, writeFileTool, searchTool],
  outputSchema: {    // Optional: structured output
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"]
  }
});

for await (const msg of agent.execute(ctx)) {
  // msg.type: "chunk" | "planning_update" | "task_update" | "tool_call_update" | "step_result" | "log_update"
}

const result = agent.getResults();
```

## Capability registry (`src/capabilities/`)

A capability is what replaced the `Tool` class: a **spec** (wire name,
description, input schema, and a required `PermissionCategory`), an **impl**
`(run, args) => result`, and a **`CapabilityRun`** that carries everything only
a run knows — the `ProcessingContext`, the permission gate, the browser router
for `ui_*`, the sub-agent runtime, and the injected singletons
(`nodeRegistry`, `providers`, `examples`, `exportDsl`, loaders). Per-run state
arrives at *call* time, not at construction time, which is what lets one
process-level registry serve every host. Design:
[docs/tool-class-retirement-design.md](../../docs/tool-class-retirement-design.md).

`registry.ts` is the table, in two halves. The **lazy** half is one `import()`
per namespace, so no implementation sits in an entry graph. The **eager** half
is a spec table: every module has a data-only sibling (`workflows.specs.ts`,
`media.specs.ts`, …) holding wire name, description, JSON schema, category and
message template, and importing no implementation, so `capabilitySpec(name)`
and `listCapabilitySpecs()` answer synchronously. That is what lets a belt be
assembled synchronously from the registry: `toolFromLazyCapability(spec, run)` /
`toolForCapabilityName(name, run)` (`capabilities/lazy-tool.ts`) return a `Tool`
whose spec is there at assembly time and whose implementation loads from its own
module at the first `process()` — `Tool.process()` was already async, so only the
spec ever had to be eager. `getBuiltinTools()`, `getAllMcpTools()` and
`getGoogleWorkspaceTools()` all build this way; the ninety-two one-line
`extends CapabilityTool` subclasses they replaced are gone.

A module imports its own specs back and attaches each to an implementation, so
one spec *object* stands behind both halves, and `eagerSpecDrift` compares them
by identity — a module that copied its spec would pass a field check and still
be two things to keep in step. `CapabilitySpec.zodSchema` carries the Zod schema
for the few capabilities whose identity is one (`view_image`, `list_images`, the
eight `ui_*` document tools), so `Tool.execute` still validates on the way in.

What the registry deliberately does *not* serve is written down where the API
it mirrors lives: `packages/websocket/src/trpc/sandbox-coverage.ts` classifies
every tRPC procedure as covered by a capability, reachable through a
differently-shaped one, withheld with the risk stated, or a recorded gap.
`packages/websocket/tests/sandbox-api-coverage.test.ts` walks the live router
and fails in both directions, so a new procedure cannot land unclassified and a
stale verdict cannot outlive what it judged. The rule the withheld set follows:
a run may act on the rows its own user owns, and may not touch credentials,
billing, other tenants, host control, the transcript of its own behaviour, or
anything that grants a third party access.

`DECLARED_CAPABILITY_MODULES` is the module list a reviewer reads. Three drift
walks keep everything honest. `capabilityModuleDrift()` reports a declared module with no loader,
a loader nobody declared, an export with no category or no schema, and one name
owned by two modules; `tests/capabilities-registry.test.ts` also pins a
checked-in `name → category` snapshot, so a reclassification is a one-line diff.
`tests/capabilities-coverage.test.ts` walks the other way: everything
`getBuiltinTools()` and `getAllMcpTools({})` assemble must resolve through
`findCapability`, or sit in that file's pinned exception list with a reason.

`invoke.ts` holds the one ladder — lookup, gate, impl. Every entrance runs it:
the guest dispatcher, a direct MCP registration, `run_subtask`'s child loop.
`gateTools` (`capabilities/gate-tools.ts`) is the door a `Tool` walks through:
it wraps each tool in a subclass whose `process()` builds a one-call run over
`capabilityFromTool` and calls `invoke`. `tests/capabilities-gate-parity.test.ts`
drives both entrances and compares transcripts.

The guest reaches a namespace by import, never by a global:

```js
import { list_workflows } from "@nodetool-ai/sandbox-nodetool/workflows";
const { workflows } = await list_workflows({ limit: 20 });
```

Exports carry the wire name — `list_workflows`, not `listWorkflows` — so the
prompt, the MCP surface and `tools.*` all say one string. The facade generator
and specifier shape live in `@nodetool-ai/protocol`
(`sandbox-capability.ts`); the module list stays in the registry here, and the
*host* decides which modules a session mounts. A third-party pack can never
declare one. `createCapabilityDispatcher` validates module key, export name and
argument list on every call, then delegates to `invoke` — it never gates on its
own, so the import path and `tools.*` reach one implementation past one gate.
The `nodetool` global survives as a generated shim over the imports for one
release.

**Import direction is one-way: `capabilities/` imports
`tools/tool-permissions.ts`, never the reverse.** That is why `gateTools` sits
in `capabilities/` and not beside the classification map it uses. The reverse
edge made the bundled backend's module wrappers an async cycle —
`init_tool_permissions` awaiting `init_adapters` awaiting
`init_tool_permissions` — which esbuild's `__esm` cannot break the way real ESM
breaks a synchronous cycle, and `server.mjs` died on an unsettled top-level
await before it served `/health`. `npm run backend:smoke` is the check that
catches it; a passing `vitest` run will not.

## The core API is in-process (`src/tools/mcp-tools.ts`)

The workflow/node/job/asset tools call NodeTool's own code, never HTTP. There
is no `NODETOOL_API_URL`, no `fetch`, and no server that has to be listening:

| Concern | Where it comes from |
|---|---|
| Workflows, jobs, assets | `@nodetool-ai/models` (`Workflow`, `Job`, `Asset`) |
| Running / debugging a workflow | `runWorkflow` in `@nodetool-ai/execution/service` |
| Interactive escalations | `submitEscalationVerdict` + the `debugSessions` registry, same module |
| Debugging an app | `runApplicationDebug`, same module |
| Building an app | `runApplicationBuild` (`src/app-build/build-service.ts`) |

`@nodetool-ai/execution/service` is the layer the REST routes call too, so a
tool result and the endpoint's response are one function's answer and cannot
drift. `packages/websocket` keeps the Fastify routes, auth and WS transport as
thin adapters over it.

Three things live above this package in the dependency order and arrive by
injection through `getAllMcpTools(options)`:

- `registry` — a `NodeRegistry`. Node discovery needs it, and so does anything
  that executes. Without one those tools answer with a "no node registry in
  this process" error instead of reaching for a network fallback.
- `examples` — the shipped example-workflow catalog (JSON inside the installed
  node packages; only the server walks the metadata roots).
- `exportDsl` — `workflowToDsl` from `@nodetool-ai/dsl`.

The server builds all three in `packages/websocket/src/mcp-tool-deps.ts` and
spreads `mcpToolHostDeps()` into every `getAllMcpTools` call site.

## Script Voicing Tools (`src/tools/script-voice-tools.ts`)

The headless path from a written script to voiced takes and an assembled
voiceover sequence. The editor voices a line over the chat WebSocket's
`generate_media` / `transcribe_audio` RPCs, and the `nodetool.script.*` nodes do
it inside a workflow; an agent outside the browser had neither. These call the
provider directly, save each take as an asset, and write it back onto the
persisted script.

| Tool | Does |
|---|---|
| `list_scripts` | Scripts newest first, with line and voiced counts |
| `get_script` | Cast, lines, and each line's voicing status |
| `voice_script_lines` | TTS per line → a take, current on its line |
| `assemble_script_timeline` | Voiced takes → a saved `timeline_sequences` row |

`get_script` reports the status the editor's gutter shows — `draft` (never
voiced), `stale` (text or voice changed since the take), `voiced`, `no_voice` —
and `voice_script_lines` defaults to every line that is draft or stale, so a
whole script is one call. Each line uses its own voice (its override, else its
speaker's) unless the call passes provider+model+voice to override them all; a
half-specified override is an error, not a guess. Lines are voiced concurrently
(default 3, max 8, 60 per call) and each take lands through a CAS on the row's
`updated_at`.

Synthesis delegates to `GenerateSpeechTool`, so the encoded/streaming-PCM
provider split is handled in one place. Word timings come from a best-effort ASR
pass (`whisper-1` by default, `transcribe: false` to skip it) and ride into the
assembled clips as captions. Take duration is ffprobe's answer, falling back to
the last word timing and then to the 3s placeholder — a take stays assemblable
without an exact length.

The voice rule (`effectiveVoice`), the staleness rule (`needsVoicing`) and the
script → timeline mapping (`buildScriptTimeline`) live in
`@nodetool-ai/timeline`; the editor's "Send to timeline" and
`nodetool.script.ScriptToTimeline` call the same functions, so the three
surfaces cannot drift. Re-assembly rewrites this script's voiceover track in
place and keeps clips other surfaces added.

Tests: `tests/script-voice-tools.test.ts` (in-memory DB, fake provider — no
network).

## Storyboard Render Tools (`src/tools/storyboard-render-tools.ts`)

The headless path from a directed storyboard to rendered media and an assembled
cut. The editor has always had this path — the Storyboard surface builds a
throwaway `TextToImage → Output` / `ImageToVideo → Output` graph per shot and
runs it in the browser — but an agent outside the browser had to author, save,
and run a workflow per shot, or drive the `ui_storyboard_*` tools, which only
work while that board is open. These call the provider directly, save each
result as an asset, and write it back onto the persisted board.

| Tool | Does |
|---|---|
| `list_storyboards` | Boards newest first, with per-board still/clip counts |
| `get_storyboard` | Shots with ids, status, and whether each has a still/clip |
| `render_storyboard_stills` | `text_to_image` per shot → the shot's keyframe |
| `render_storyboard_clips` | `image_to_video` seeded by the keyframe → the shot's clip |
| `revise_storyboard_clip` | `video_to_video` revision of one shot's clip |
| `assemble_storyboard_timeline` | Rendered clips → a saved `timeline_sequences` row |

Both render tools take `targets` (shot ids, indexes, or slugs) and default to
"whatever still needs this step", so a whole board is one call. Shots render
concurrently (default 3, max 8, 24 shots per call). Every write is a CAS on the
row's `updated_at` with a bounded retry, because concurrent renders all land on
the same board document; a conflicting write re-reads and re-applies rather than
clobbering.

The provider and model come from the call, else from the board's own
`imageModel` / `videoModel`. There is no fallback default — an unset model is an
error naming `find_model`, not silent spend on a model nobody chose.

Prompt composition, entity seasoning (`entitiesForShot`, `@nodetool-ai/protocol`)
and the shot → timeline mapping (`buildStoryboardTimeline`,
`@nodetool-ai/timeline`) are the editor's, so a board rendered headlessly matches
one rendered in the UI. Board entities are library assets carrying a
`metadata.nodetool_entity` marker; their descriptors and first reference image
ride along as the `entities` param, which the runtime expands at the provider
layer.

Tests: `tests/storyboard-render-tools.test.ts` (in-memory DB, stubbed
predictions — no provider calls).

## Google Workspace Tools (`src/tools/google-workspace-tools.ts`)

Drive, Gmail, Docs, Sheets and Calendar tools that authenticate with the access
token from the user's Google sign-in — there is no API key. The Supabase Google
login hands the browser a `provider_token`, the web app posts it to
`POST /api/oauth/google/session`, and the server stores it as an
`OAuthCredential` under provider `google`. Tools read it back through the
virtual secret key `GOOGLE_ACCESS_TOKEN`, which `getSecret` routes to
`resolveGoogleAccessToken` (refreshing a stale token when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set).

They are not in `BUILTIN_TOOL_CLASSES`. A server without a login can never
produce a token, so the chat toolbelt adds them only when
`isGoogleWorkspaceEnabled()` (`@nodetool-ai/config`) is true — Supabase auth
mode, or `NODETOOL_GOOGLE_WORKSPACE=1`.

The fourteen `lib.google.*` nodes are gone. Each wrapped a call this module
already makes, on the same sign-in token, and the module makes six more no node
ever offered: get one Drive file, get one Gmail message, list labels, create a
spreadsheet, list calendars, delete an event. The capability is the only Google
surface now, and it is two things at once — an agent tool and a guest import.

```js
// Code node `packages`: nothing to declare — capability modules are mounted
// by the host, not installed as packs.
import { drive_search, gmail_send_message } from "@nodetool-ai/sandbox-nodetool/google";

const { files } = await drive_search({ query: "name contains 'invoice'" });
await gmail_send_message({ to: "a@b.c", subject: "Invoices", body: String(files.length) });
```

```ts
import {
  getGoogleWorkspaceTools,
  registerGoogleWorkspaceTools
} from "@nodetool-ai/agents";

if (isGoogleWorkspaceEnabled()) {
  registerGoogleWorkspaceTools();   // makes resolveTool(name) work
  toolbelt.push(...getGoogleWorkspaceTools());
}
```

A missing or revoked credential surfaces as `{ error }` telling the user to sign
in with Google again, rather than throwing — the agent can then pick another
route instead of failing the whole step.

## Plan Approval Gate

`Agent` can pause after planning and present the plan for user approval before
executing it. Wire a callback either as the `requestPlanApproval` option or on
the ProcessingContext under `PLAN_APPROVAL_CONTEXT_KEY` (the websocket runner
sets the context variable for chat-triggered runs, so Agent nodes in plan mode
gate without explicit wiring):

```typescript
const agent = new Agent({
  ...,
  requestPlanApproval: async (plan) =>
    userSaysYes(plan) ? { decision: "approve" } : { decision: "reject", feedback: "..." }
});
```

- **approve** — execution proceeds.
- **reject with feedback** — the planner re-runs with the feedback appended to
  the objective (bounded by `MAX_PLAN_REVISIONS`, 3) and the revised plan is
  presented again.
- **reject without feedback** — the run ends; `getResults()` returns a
  rejection notice.

The gate emits `planning_update` events with phase `awaiting_approval`
(status Running/Success/Failed) and `revision` so UIs can show state. Over the
websocket this round-trips as `plan_approval_request` / `plan_approval_response`
messages; the web chat renders a `PlanApprovalCard` with approve/reject and a
feedback field. Without a callback, planning flows straight into execution as
before. Tests: `packages/agents/tests/plan-approval.test.ts`.

## Parallel Task Execution

The Agent class automatically decomposes objectives into parallel tasks via `TaskPlanner.planMultiTask()`. Tasks form a DAG — independent tasks run concurrently.

### How It Works

1. **Planning**: LLM generates a `TaskPlan` with multiple `Task` objects, each with `dependsOn` arrays
2. **Scheduling**: `ParallelTaskExecutor` finds tasks with satisfied dependencies and runs them concurrently
3. **Merging**: `mergeAsyncGenerators()` interleaves message streams from concurrent tasks
4. **Completion**: Results propagate to dependent tasks; cycle repeats until all tasks finish

### Task Plan Structure

```typescript
interface TaskPlan {
  title: string;
  tasks: Task[];           // Multiple tasks forming a DAG
}

interface Task {
  id: string;
  title: string;
  steps: Step[];
  dependsOn?: string[];    // Task IDs this depends on ([] = independent)
}

interface Step {
  id: string;
  instructions: string;
  dependsOn: string[];     // Step IDs within this task
  tools?: string[];        // Restrict available tools
  outputSchema?: string;   // JSON schema for step result
}
```

### Skipping Planning

Provide a pre-defined `task` to bypass the planning phase:

```typescript
const agent = new Agent({
  objective: "...",
  provider, model,
  task: {
    id: "my-task",
    title: "Direct task",
    steps: [
      { id: "s1", instructions: "Do X", dependsOn: [], completed: false, logs: [] },
      { id: "s2", instructions: "Do Y", dependsOn: ["s1"], completed: false, logs: [] }
    ]
  }
});
```

### Concurrency Defaults

| Constant | Default | Location |
|----------|---------|----------|
| `DEFAULT_MAX_TASK_ITERATIONS` | 100 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEP_ITERATIONS` | 10 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEPS` | 50 | `task-executor.ts` |
| `MAX_RETRIES` (planning) | 3 | `task-planner.ts` |

### One policy per run (`agent-policy.ts`)

`Agent` resolves `maxSteps`, `maxStepIterations`, `maxTokens` and
`maxConcurrentAgents` into a single `AgentPolicy` (`resolveAgentPolicy`,
defaults in `DEFAULT_AGENT_POLICY`) and hands the same object to every mode —
single task, multi-task plan, graph. A knob therefore means the same thing
everywhere: `maxTokens` reaches the graph runner, `maxSteps` bounds multi-task
runs, and task/fan-out dispatch is capped by one semaphore
(`utils/merge-generators.ts`). The plan-approval gate is likewise a property of
the run, not of the planning mode: a planned graph goes through it too.

### Step failure is terminal, not completion

A step that fails sets `step.failed` + `step.error` and leaves `completed`
false, and its `step_result` carries the protocol-level `error` field. Nothing
downstream may treat a failure as a satisfied dependency: `TaskExecutor` blocks
dependents and marks them failed with the blocking step named, and a plan whose
every task failed throws instead of compiling a deliverable out of nothing.

## CodeAct Execution (`src/codeact/`)

The action space of the step loop, and the only one. Each step acts by writing
JavaScript that runs in the QuickJS sandbox with the toolbelt exposed as
`tools.<name>()` functions, a `state` object that persists across actions
(including after a throw), and `finish(result)` for host-validated completion.
The prompt tells the model to assign each generate/speak result to `state`
immediately and reuse it — `return` is the observation only. Design and the
research it follows (CodeAct, ICML 2024): docs/codeact-design.md.

- `CodeActExecutor` keeps the message contract, memory writes, and failure
  semantics the step loop has always had — consumers work unchanged. Bridged
  tool calls surface as `tool_call_update` events (ids `codeact_<n>`).
- The core set goes top level. Every NodeTool tool that mirrors a Claude Agent
  SDK built-in (`CORE_TOOL_NAMES` in `@nodetool-ai/runtime` — the file set,
  `glob`/`grep`, `web_search`, `browser`/`http_request`/`download_file`,
  `todo_write`, `run_subtask`) is offered to the provider as an ordinary tool
  next to `execute_code`, for every provider. Those are the shapes models are
  trained on, so a tool call beats a sandbox round trip that only forwards one.
  They stay on the belt — `nodetool.web`, `nodetool.agents` and hand-written
  fan-out call them from code — but the prompt documents them once, under
  "Direct tools", instead of as a `tools.*` signature. `splitCoreTools` /
  `buildCoreProviderTools` in `src/codeact/tool-api.ts`.
- Discovery goes top level with it. `DISCOVERY_TOOL_NAMES` (`find_model`,
  `list_models`, `list_provider_models`, `search_nodes`, `get_node_info`,
  `list_nodes`) answers which providers, models and node types this install
  has — one question with one answer, and a wrong answer is a hallucinated
  model id that fails at generation time, after the run was paid for. The two
  sets stay apart because only the core set has SDK built-ins behind it:
  `DIRECT_TOOL_NAMES` is their union and is what the four offer sites read
  (`splitCoreTools`, the CLI turn, the websocket runner, and the MCP mount),
  while `SDK_NATIVE_TOOL_REPLACEMENTS` still reads `CORE_TOOL_NAMES` alone.
  `nodetool.models.pick` and `nodetool.nodes.search` are unchanged — the belt
  keeps every tool, so an action still composes them.
- The MCP mount subtracts. It offers `DIRECT_TOOL_NAMES` **minus every key of
  `SDK_NATIVE_TOOL_REPLACEMENTS`**, because an MCP client (Claude Code,
  ChatGPT) *is* the host agent that table describes: offering NodeTool's
  workspace-scoped `read_file` beside the client's own would put two tools of
  one name and two different roots in front of one model. What survives has no
  host equivalent — discovery, the server-side reach that runs behind
  NodeTool's SSRF guard and secrets (`browser`, `http_request`,
  `download_file`, `list_directory`), and `run_subtask`, whose child gets the
  NodeTool belt rather than the client's. It is a `belt.filter`, so a session
  missing an injected dependency (no node registry, say) advertises no node
  tools instead of a tool that cannot run. Before this the mount registered
  only `execute_code` and `view_image`: everything was still reachable as
  `tools.*` inside an action, but every discovery question cost a sandbox round
  trip, which is the tax the direct set exists to remove.
- On `claude_agent_sdk` the built-in wins outright. The provider drops every
  tool `SDK_NATIVE_TOOL_REPLACEMENTS` maps (`read_file`→`Read`,
  `write_file`→`Write`, `edit_file`→`Edit`, `glob`→`Glob`, `grep`→`Grep`,
  `web_search`→`WebSearch`, `todo_write`→`TodoWrite`) from its MCP toolset and
  lets the SDK's own tool serve the call. The path-scoped five are substituted
  only when the caller passes a `workspaceDir`, which becomes the session
  `cwd` — without it the SDK would resolve paths outside the run's workspace,
  so NodeTool's contained versions stay. `list_directory`, `browser`,
  `http_request`, `download_file` and `run_subtask` are never substituted: no
  built-in covers what they do (`Task` would hand the child SDK tools, not the
  NodeTool belt). See `packages/runtime/src/providers/core-tools.ts`.
- Progressive disclosure: resident tools (`CODEACT_RESIDENT_TOOL_NAMES` —
  the search family incl. `web_search`/`search_nodes`/`run_search`/
  `asset_search`/`grep`/`glob`, the Claude-agent file set
  (`read_file`/`write_file`/`edit_file`/`list_directory`), browser, HTTP,
  memory, `run_subtask`) are documented in full; past `CODEACT_DEFER_THRESHOLD` tools, the rest is name-only in the
  prompt and discovered in-sandbox with `await nodetool.searchTools("query")`
  (ToolSearch grammar). All tools stay callable either way. Discovery lives on
  the object model and nowhere else: the bare `searchTools()` global is gone,
  because a model that knows `nodetool.*` looked for it there and burned two
  rounds finding out it was elsewhere.
- Imports are discoverable too: `nodetool.packs.list()` reports every installed
  pack and whether this session allows it, `modules(pack)` the specifiers it
  declares, `exports(specifier)` the function names one module exports, and
  `docs(specifier)` the pack's SKILL.md. A pack installed but off the allowlist
  is listed as `allowed: false` rather than hidden — hiding it teaches the model
  the pack does not exist. The data reaches the guest as a tool
  (`list_sandbox_packages`, `capabilities/packs.ts`), which is the
  only path the object model has: it owns no host bridge. Exports are exact for
  host modules (`SANDBOX_HOST_MODULES`), WASM modules (the manifest contract)
  and platform modules (the capability registry); for a guest JS module they are
  read off its own `export` statements with acorn, and a module that re-exports
  with `export *` answers `complete: false` instead of a short list.
- Every step executor is one: `TaskExecutor`, `ParallelTaskExecutor`,
  `run_subtask`, and `run_search` all construct `CodeActExecutor`. `StepExecutor` — the older one-JSON-tool-call
  loop — is no longer exported; two callers keep it because they are one-shot
  structured verdicts on a fail-closed path where a sandbox error would only
  add a failure mode: `SupervisorAgent` and the app-build spec stage.
- Chat turns run in it too: the websocket runner swaps the toolbelt
  for `execute_code` (+ the core set, + `view_image`) via `createChatCodeActSession`
  (`src/codeact/chat-codeact.ts`), which bridges `tools.<name>()` to the chat
  runner's own tool router instead of `buildToolBridge` — permission gating
  and client (`ui_*`) round-trips stay where they are. When the belt carries
  the `ui_*` workflow document tools, actions also get the graph object model
  (`src/codeact/graph-model.ts`): `openWorkflow()` returns a model whose
  synchronous mutators queue ops against a local mirror and `commit()` replays
  them through the same `ui_*` contract.
  The CLI's local (no-server) turn runs the same session — `execute_code`,
  the core tools and `view_image` are what `processChat` sees, wired in
  `packages/cli/src/chat-codeact.ts`.
- Both executors also load the `nodetool` object model
  (`src/codeact/nodetool-api.ts`): the platform as objects instead of raw
  `tools.*` calls — `nodetool.workflows` (list/get/run/start/debug/validate/
  create/open), `nodetool.batch(items, fn, {concurrency})` for bounded fan-out (run a
  workflow once per CSV row), `nodetool.models` (`pick(capability)` resolves
  one ranked model; `find`/`list` for the long form; `forProvider(provider)`
  for one provider's own catalog), and `nodetool.media`
  (`generateImage/editImage/generateVideo/animateImage/speak/transcribe/embed`
  plus the judge loop `critique/compare/scoreAdherence` and
  `understandVideo(video, prompt, model)`, which hands a whole clip to a model
  that reads video and answers as text — each taking a pick/find result or
  `"provider/model_id"`; plus the host binaries `ffprobe(path)`, `ffmpeg(args)`
  and `downloadVideo(url, outputFile)`, whose argv is confined to the workspace
  and to local-file inputs by `src/host-binary-guard.ts` and bounded on wall
  clock, captured output, artifact size and concurrency by
  `src/host-binaries.ts`), `nodetool.nodes`
  (`search/info/list` — the graph builder's discovery half),
  `nodetool.documents` (convert, PDF text/tables, markdown↔pdf),
  `nodetool.apps` (`build/debug`), `nodetool.agents` (`run(prompt)` spawns a
  `run_subtask` child with a fresh context; fan out via
  `nodetool.batch(prompts, (p) => nodetool.agents.run(p))`), the single-node harness on `nodetool.nodes.run(type,
  inputs)`, `nodetool.web` (the outside world:
  `search(query, {provider})`, `news` and `images` are all one routed
  `web_search` with a `search_type`, which picks the first configured
  backend host-side; `provider` pins one: `"default"`, `"serpapi"`,
  `"dataforseo"`, `"brave"`, `"apify"`, `"openai"`, `"google"` — plus
  `browse(url)`, `fetch(url)`, `download`, `screenshot`), `nodetool.memory`
  (`save/list/update/remove` over `thread_memory_*`), `nodetool.shared`
  (`list/read/publish` over `list_shared`/`read_shared`/`share_result` — the
  run's own scratchpad, beside thread-scoped `nodetool.memory`),
  `nodetool.threads` (`list/get/last/message` over `list_threads`/`get_thread`/
  `get_message` — the chat history itself, read-only), `nodetool.style`
  (`profile/record`), `nodetool.email` (`search/archive/label`), plus `assets`
  (`list/search/images/get/save/read`), `jobs` (with
  `wait(id, {timeoutMs, pollMs})` polling a background job to settlement),
  `collections` (full RAG loop: `index/indexBatch/search/hybridSearch/query`),
  `timelines`, `sketches`, `scripts`, and `storyboards`. `workflows` also
  carries `resolve(sessionId, escalationId, action)` for interactive-run
  escalations and `example("<package>/<name>")` feeding `copyFrom`
  (`list({workflow_type: "example"})` enumerates the shipped examples). Every method wraps a
  belt tool, so gating and routing are untouched; a method whose backing tool
  is missing throws naming the tool, and the prompt section documents only the
  namespaces the belt can serve (`buildNodetoolApiPromptSection`). One surface
  per capability: tools the object model wraps
  (`nodetoolApiCoveredToolNames`, plus `GRAPH_MODEL_TOOL_NAMES` when the graph
  model loads) are filtered out of the prompt's tool catalog — they stay
  callable through the bridge and findable via `nodetool.searchTools()`, but the
  `nodetool.*` form is the only documented one. Workspace files are the
  deliberate exception: they are not wrapped, because the sandbox's own
  `workspace.*` API is in-process and costs no tool call — the action contract
  steers there.
- The belt carries only what a model cannot write itself. The pure-computation
  tools (`calculate`, `geometry`, `trigonometry`, `statistics`,
  `unit_conversion`) were deleted outright, MCP included, and so were the code
  tools `run_code` and `js` — `execute_code` is the code surface, and a second
  one only invited the model to run code without the sandbox's `nodetool.*` API
  and `state`. The nine provider-specific duplicates went next. The media four
  — `image_generation`, `openai_image_generation`, `google_image_generation`,
  `openai_text_to_speech` — were deleted, because `nodetool.media` covers them
  through the provider-agnostic `generate_image` / `generate_speech`. The
  search five — `openai_web_search`, `google_grounded_search`,
  `dataforseo_search`, `dataforseo_news`, `dataforseo_images` — were never
  duplicates at all: they are the backends the single `web_search` capability
  routes to, so they became plain functions with no wire name
  (`backend` still pins one). `google_news` and `google_images` later folded
  into it too, as `search_type: "news" | "images"` — three wire names and three
  routing tables for one question with a parameter on it, which also left
  Brave and Apify reachable from no tool at all. `getAgentToolbelt()`
  (`src/tools/builtin-tools.ts`) therefore returns what `getBuiltinTools()`
  returns; a saved AgentNode naming a retired tool resolves to its replacement
  through `RETIRED_TOOL_NAMES` in `@nodetool-ai/llm-nodes`.
- Authoring a graph is a **package**, not a builder. `nodetool.graph()` — a
  builder taking every node type as a free-form string — is gone; a session
  authors with `@nodetool-ai/sandbox-dsl`, which ships one generated function
  per node type with that node's real inputs, one module per namespace. A type
  the catalog does not have has no export, so a hallucinated type fails at
  import instead of surviving into a graph nobody checked.
  `withGraphDslPackage` (`src/codeact/graph-dsl-package.ts`) is the wiring: it
  puts the pack on the session allowlist when the belt carries
  `create_workflow`, `validate_workflow` and `run_workflow` **and** the catalog
  serves the pack, so a machine without it installed is never told to import
  it. `CodeActExecutor` and `createChatCodeActSession` both call it, and the
  answer also gates `GRAPH_DSL_PROMPT_SECTION`. Consent is per pack: an
  allowlist entry covers that specifier's subpaths, which is what makes
  seventy-two namespace modules one prompt line. Tests:
  `tests/codeact-graph-dsl.test.ts`.
- Eval suite `codeact` scores the executor on offline instrumented cases:
  `nodetool eval codeact -p <p> -m <m>`. Beyond the four toy-toolbelt cases
  it covers the full `nodetool.*` API surface: 19 cases over two
  deterministic in-memory worlds (`src/evals/codeact-api-core.ts`,
  `codeact-api-surfaces.ts`) whose fakes are named like real belt tools so
  the object-model prelude lights up. `tests/codeact-api-coverage.test.ts`
  fails when a namespace loses its last case.
  Four more cases (`src/evals/codeact-sandbox-pack-cases.ts`) cover sandbox
  packages: importing a pack the session allows and computing from what it
  parses, reading a pack's SKILL.md through `get_sandbox_package_docs` instead
  of guessing its API, reporting a pack as unavailable rather than working
  around it, and using two packs in one action. A case names its allowlist in
  `sandboxPackages`, and the runner puts a catalog over the shipped packs
  (`shippedPackCatalog()`) on the context: the three host packs plus
  `@nodetool-ai/sandbox-dsl`, whose modules are guest JavaScript the pack ships
  outright — a pack with an npm dependency would need
  `@nodetool-ai/sandbox-compiler`, which this package does not depend on.
  `requiredSessionTools` scores tools the
  executor adds rather than the case, which the recorder cannot see.
  Measured on `claude_agent_sdk`/sonnet: 4/4, mean score 1.00, ~2 actions each.
  `scripts/dump-codeact-run.ts <case> <provider> <model>` replays one case
  live and writes every action's code to `nodetool-debug/` — the tool to
  reach for before touching the action-contract prompt. Measured on
  `claude_agent_sdk`/sonnet (`IS_SANDBOX=1 … --max-iterations 40`): 20-22 of
  23 per run, mean score ~0.98, ~2.3 actions per case; the residual misses
  rotate with sampling, so judge prompt changes on the per-action dumps, not
  on one run's pass count.
- Tests: `tests/codeact-executor.test.ts`, `tests/codeact-eval.test.ts`,
  `tests/chat-codeact.test.ts`, `tests/nodetool-api.test.ts` and
  `tests/nodetool-api-*.test.ts` (scripted provider, real sandbox, no network).

## Sub-Agent Core (`src/subagent.ts`)

The one place that knows how to spawn, stream, and settle a child agent. A
sub-agent is an async generator of `ProcessingMessage` events whose return
value is how the run settled — CodeAct is the default producer, but anything
with that shape (a future reviewer, a researcher) streams through the same
pipe and nests in the UI the same way.

| Primitive | Does |
|---|---|
| `runSubAgent(opts)` | One CodeAct child loop: single-step task, optional `outputSchema` (structured via `finish()`, prose otherwise), yields events, returns `SubAgentOutcome` — never throws for run failures |
| `settleStepResult(sr, {hasOutputSchema})` | The unified failure detection: top-level `step_result.error`, the sole-key `{error}` payload a dying step reports, and (schemaless only) any string `error` property |
| `forwardSubAgentStream(gen, opts)` | Drives any sub-agent generator: tags events (`parent_tool_call_id`, `subtask_depth`), forwards without letting a broken forwarder kill the child, honors an abort signal between events |
| `enterSubAgentDepth(ctx, maxDepth)` | The shared recursion gate over `SUBTASK_DEPTH_KEY`: refuses past the cap, else returns a copied context with the depth bumped |
| `SubAgentTool` | Base class for tools that expose a sub-agent to a parent model — subclasses declare the tool surface, translate params into a `SubAgentToolRun`, and pick the child toolset; the base owns depth gate, streaming, tagging, settlement |

Every spawn site goes through it: `RunSubtaskTool` (inherits the full parent
belt, stitches itself in for recursion) and `RunSearchTool` (read-only
allowlist, breadth-scaled iteration budget) are thin `SubAgentTool`
subclasses. A generator that is not a CodeAct child streams through
`forwardSubAgentStream` directly. A new delegation tool should be another
subclass, not another copy of the machinery.

Tests: `tests/subagent.test.ts` (pure-function coverage), plus the spawn-site
suites (`tests/run-subtask-tool.test.ts`, `tests/run-search-tool.test.ts`)
which exercise the core end-to-end.

## Code-shaped orchestration is CodeAct, not a mode

There is no script mode. It was a third planning mode beside `TaskPlan` and the
graph planner: `ScriptPlanner` had the LLM author one JavaScript *orchestration
script* and `ScriptRunner` executed it in the sandbox, spawning a sub-agent per
`agent()` call. CodeAct made it redundant — a step already acts by writing
JavaScript in that same sandbox, so the loops, budget-scaled fan-out, dedup
between rounds and early exits a script expressed are ordinary control flow
inside an `execute_code` action:

| Script primitive | CodeAct equivalent |
|---|---|
| `await agent(prompt, opts?)` | `await nodetool.agents.run(prompt)` (a `run_subtask` child) |
| `await parallel(thunks)` | `await Promise.all(...)`, or `nodetool.batch` for a bound |
| `await pipeline(items, ...stages)` | `nodetool.batch(items, async (item) => …)` |
| `log(message)` | `console.log(message)` |
| `budget` | the run's own `AgentPolicy` bounds, enforced host-side |
| `inputs` | the step's inputs, read from `context.memory` via `read_shared` |

The difference that mattered — one authored artifact reviewed before anything
ran — is not lost: a plan still goes through the approval gate, and an action's
code is visible in the `execute_code` call. What is gone is the second sandbox
API, the second planner prompt, and the second set of budget knobs
(`maxAgentCalls`).

## Authoring a graph (`src/author-graph.ts`)

`authorGraph(objective, opts)` is how a graph gets written, and what both
graph callers use — `Agent`'s graph mode (`executeGraphPlan`) and the
app-build plan stage (one call per operation). It streams `ProcessingMessage`s
and returns the graph.

It runs no loop of its own. `runSubAgent` drives one CodeAct child whose
allowlist carries `@nodetool-ai/sandbox-dsl`, so the child authors with the
typed pack — one generated function per node type — instead of the untyped
`node(type, props)` program the retired one-shot planner took. The belt is
discovery
(`search_nodes`, `get_node_info`, `list_nodes`), `validate_workflow`, the
Code-body harness (`validate_code`, `run_code`, `test_code`) and `find_model`
when providers are configured. The graph comes back through `finish()` against
a `{nodes, edges}` output schema: the object is already in the sandbox, so
handing it over costs no tokens.

The prompt is assembled once. `renderWorkflowAuthoringKnowledge()`
(`prompts/workflow-authoring-knowledge.ts`) is the preamble — which node to
reach for, how `agent` steps and `if_` behave, what a Code node is — and the
DSL mechanics are NOT repeated there: `CodeActExecutor` renders
`GRAPH_DSL_PROMPT_SECTION` itself once the pack is on the allowlist.

There is no post-hoc Code-node refinement pass. A whole-graph one-shot had no
way to iterate on a Code body it wrote as a string literal, which is what such
a pass existed to fix; a CodeAct child validates and re-runs a body inside the
same loop. Without a catalog serving the pack the run fails immediately, naming the
pack, rather than spending a provider turn on an import that cannot resolve.

Tests: `tests/author-graph.test.ts` (brief, preamble, belt, plus one scripted
provider driving a real sandbox action over the real shipped pack).

## The graph DSL program (`src/graph-dsl.ts`)

`evaluateGraphDsl` runs a free-form graph program in the QuickJS sandbox (no
host access) and returns `{nodes, edges}`. It is the older, untyped authoring
shape — `node(type, properties)` creates a node, passing `ref.output(slot?)` as
a property value becomes an edge, and the program ends with `return graph();`:

```js
const prompt = node("nodetool.input.StringInput", { name: "prompt" });
const image = node("nodetool.image.TextToImage", {
  prompt: prompt.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
node("nodetool.output.Output", { name: "image", value: image.output() });
return graph();
```

Nothing authors this way any more — `authorGraph` writes typed calls against
`@nodetool-ai/sandbox-dsl` instead — but `validate_workflow` still accepts a
program in this shape, so the evaluator and the wiring core behind it
(`src/graph-dsl-core.ts`, shared with the pack's guest builder) stay.
`GraphBuilder` (`src/graph-builder.ts`) is what loads either shape into a
graph and validates it structurally, alongside node-sdk's `validateGraph`.

Tests: `tests/graph-dsl.test.ts`, `tests/dsl-handle-interpolation.test.ts`,
`tests/dsl-workflow-authoring.test.ts`.

### Eval suite

`src/evals/` carries a provider-agnostic evaluation harness for graph
authoring: `GRAPH_PLANNER_EVAL_CASES` (objectives + structural expectations —
input wiring, node-family patterns, branch handles, reachability, prompt text,
no provider-locked nodes) and `runGraphPlannerEval`, which drives
`authorGraph` (metrics per case: accepted, score, authoring rounds, tool
calls, duration, cost; aggregate: success rate, one-shot rate, averages). Run it
against any registered provider:

Two metrics were mapped when the suite moved off the retired one-shot planner:
**authoring rounds** replaces submit rounds and counts `execute_code` actions,
so a one-shot is a graph delivered in the first action; **attempts** is gone,
because `authorGraph` has no outer retry loop — a repair is another authoring
round.

```bash
npm run dev:nodetool -- eval graph-planner --list
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/graph-planner-eval.test.ts`.

### End-to-end eval suite (`graph-e2e`)

The `graph-planner` suite stops at the graph: it scores structure, which says
nothing about whether the workflow does what was asked. `src/evals/graph-e2e-
{cases,eval}.ts` closes that loop — every case runs three phases and only counts
as a success when all three hold:

1. **plan** — `authorGraph()` produces a graph, scored structurally by the
   same `checkExpectations` the graph-planner suite uses.
2. **execute** — `applyRunPolicy` stamps the run's provider/model onto the
   planner's Agent nodes (the planner leaves them model-less on purpose — the
   run owns that choice — so an unstamped graph dies on "Select a model"),
   then the graph runs for real with the case's inputs as run params, through a
   caller-supplied `GraphRunner`. The runner is injected so this package needs
   no execution dependency and the harness tests can drive scripted runs with
   no kernel; the CLI wires the real one over `ExecutionSession`
   (`packages/cli/src/evals/graph-runner.ts`).
3. **judge** — deterministic output checks (an output by name exists, is
   non-empty, matches/doesn't match a literal) plus an LLM judge
   (`src/evals/goal-judge.ts`) that reads the case's goal statement and the
   actual outputs and answers `{achieved, score, reasoning}` as plain JSON. A
   regex cannot tell a real German translation from the English echoed back;
   the judge can. A provider failure or unparseable answer is reported as a
   judge error, never as a pass.

Metrics per case: planned, executed, goalAchieved, score, submit rounds, node/
edge counts, plan and run duration, cost, plus the outputs themselves.
Aggregate: end-to-end success rate (the `--min-success` gate), plan rate,
execution rate, mean score. Cases whose graph needs a real model
(`needsModelProviders`) skip without configured providers; the two deterministic
cases (`concat`, `arithmetic`) run anywhere and use `skipJudge`, since their
outputs are pinned exactly by pattern.

Each case costs inference twice — the run, then the judge — so it is the most
expensive suite here. A full pass on `claude_agent_sdk`/`sonnet` runs ~$0.07.

```bash
npm run dev:nodetool -- eval graph-e2e --list
npm run dev:nodetool -- eval graph-e2e -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-e2e -p openai -m gpt-5.4-mini --cases concat,arithmetic
npm run dev:nodetool -- eval graph-e2e -p anthropic -m ... --timeout 600000 --min-success 0.8
```

Harness tests (scripted provider, fake runner, no network):
`tests/graph-e2e-eval.test.ts`.

### Code node authoring eval (`code-gen`)

`src/evals/code-gen-{cases,eval}.ts` drives the real `CodePlanner` over eight
cases — one per authoring shape the feature targets (reshape, merge/join,
compute, extract/parse, split, format, validate, seed) — and scores each
accepted `submit_code` submission structurally: declared outputs present and
typed, inputs limited to the slots the dialog offered, the destination-handle
case's expected output present with the right type, every declared output
assigned on every visible return path (`analyzeGeneratedCode`), no `state`/
`yield` when nobody asked, and no name that is neither sandbox API
(`unknownApiReferences`) nor bound by the code itself (`collectBoundNames`).

Acceptance is reported twice: **first-pass** (accepted on round 1, before the
tool fed anything back) and **post-repair** (accepted at all within the round
cap). `--min-success` gates on post-repair.

```bash
npm run dev:nodetool -- eval code-gen --list
npm run dev:nodetool -- eval code-gen -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval code-gen -p openai -m gpt-5.4-mini --min-success 0.9
```

Harness tests (scripted provider, no network): `tests/code-gen-eval.test.ts`.

### Planning-mode eval suite (`task-planner`)

The graph-planner suite covers graph mode. The task planner has a suite of its
own, scoring the *plan* statically — nothing is executed.

**`task-planner`** runs `TaskPlanner.planMultiTask` and scores the committed
`TaskPlan`. `PlanBuilder` already rejects structurally broken plans (duplicate
step ids, dangling deps, cycles), so anything that comes back is valid by
construction; what it cannot judge is quality, and that is the suite:
parallel width, decomposition proportional to the objective, real dependencies
modelled as dependencies, tool routing (`run_python` for arithmetic, not a
reasoning step), the step-id prefix convention, and the prompt's hard rule that
final synthesis belongs to the Compiler, not to an "assemble" task. Metrics per
case: tasks, steps, parallel width, critical-path depth, planner tool calls,
rejected `add_task`/`finish_plan` calls; aggregate adds a **clean rate** — the
fraction of plans built without a single rejected call.

Cases + expectations live in `src/evals/task-planner-cases.ts`, the runner in
`src/evals/task-planner-eval.ts`. It offers a never-executed tool library
(`src/evals/planner-tools.ts`: `web_search`, `fetch_page`, `read_file`,
`write_file`, `run_python`, `generate_image`) so the planner has something
concrete to route work to.

```bash
npm run dev:nodetool -- eval task-planner --list
npm run dev:nodetool -- eval task-planner -p anthropic -m claude-sonnet-5
IS_SANDBOX=1 npm run dev:nodetool -- eval task-planner -p claude_agent_sdk -m sonnet --no-find-model
```

Harness tests (scripted provider, no network):
`tests/task-planner-eval.test.ts`.

**Cost reads `$0` here under `claude_agent_sdk`.** The planner aborts the
provider loop from inside the accepting tool (`finish_plan`), and the SDK only
reports token usage on its terminal `result` message — which a cancelled query
never emits. The run is not free; the usage is simply unobservable. Score,
timing, and call counts are unaffected.

### Sub-agent execution eval suite (`subtask`)

Where the tool-loop suites score a model driving one flat tool surface, this
suite scores `RunSubtaskTool` — the primitive that decomposes work by spawning
a child agent that inherits the parent's toolset.

The harness drives a real `CodeActExecutor` equipped with `RunSubtaskTool` plus
a library of instrumented tools. Each tool records every call together with the
`SUBTASK_DEPTH_KEY` it read from its context — 0 for a parent-level call, >= 1
for one made inside a subtask. The same tool instances serve both levels, so
that field is the ground truth for who ran what, and the scorer can separate a
parent that delegated from one that did the job itself.

Scoring is structural (`checkSubtaskExpectations`): required parent and child
tools, forbidden tools, subtask-count and depth bounds, no failed subtasks,
required store keys, and answer substrings — never an exact transcript, so many
valid delegations pass. Metrics per case: expectation score, subtasks spawned,
deepest sub-agent level, tool calls at any depth, duration, cost. The aggregate
reports **success rate** (accepted over non-skipped), **mean score**, average
subtasks, and total cost; `--min-success` gates on the success rate.

The seven cases cover one tool per delegation (`delegate-compute`,
`delegate-read-write`, `delegate-lookup`, `delegate-transform`), fan-out
(`parallel-subtasks`), a child whose tool fails so the error must surface
rather than be swallowed (`error-propagation`), and one objective that
exercises every inherited tool (`all-tools`).

Cases and the instrumented tool library live in `src/evals/subtask-cases.ts`,
the runner in `src/evals/subtask-eval.ts`. The parent step and each subtask
share a turn cap of 16 unless `--max-iterations` says otherwise.

```bash
npm run dev:nodetool -- eval subtask --list
npm run dev:nodetool -- eval subtask -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval subtask -p openai -m gpt-5.4-mini --cases delegate-compute,all-tools
```

Harness tests (scripted provider, no network): `tests/subtask-eval.test.ts`.

### Tool-loop eval suites (frontend `ui_*` surfaces)

Where the graph-planner eval measures graph authoring, the tool-loop harness
measures the incremental, multi-turn tool-calling flow the browser UI exposes.
A real provider is handed the
frontend tool contract (names/descriptions/Zod schemas mirrored from
`web/src/lib/tools/builtin/*`) and drives it against a **headless bridge** —
a node-side fake that holds the same state shape and applies the same
mutations, with no browser. `runToolLoopEval` (`src/evals/tool-loop-eval.ts`)
is generic over the surface: a case supplies a `createBridge` factory
(`HeadlessSurfaceBridge<TFinal>` — `{ tools, finalState }`) plus structural
expectations, and the runner reports the same metrics as graph-planner
(accepted, score, tool calls, duration, cost). Scoring is structural
(`checkToolLoopExpectations`: required/forbidden tools, ordering, final-state
predicates, tool-call budgets, no-error-results) — never an exact transcript,
so many valid tool orderings pass.

**Checks carry a severity, and the score weighs them by it** (3/2/1 for
`critical`/`standard`/`advisory`, `scoreToolLoopChecks`). Whether the required
tools were called, what the final state looks like, and every escalation check
are `critical`; ordering and no-error-results are `standard`; the tool-call
budgets are `advisory`. A run that fails any critical check is additionally
capped at `CRITICAL_FAILURE_SCORE_CAP` (0.5).

The flat pass-fraction this replaced made scores non-comparable. A live sonnet
run of `confirm-before-delete` deleted the dead branch without ever asking —
the one behavior that case exists to measure — and scored **0.62**, because the
graph it produced satisfied every state predicate. The same run of
`escalate-missing-capability` escalated correctly, built the fallback the user
described, and scored **0.92**, docked only for exceeding a call budget. Under
weighting the first is capped at 0.5 and the second lands near 0.97, which is
the ordering the numbers should have had. `criticalFailures` per case makes it
visible without reading the check list, and the text report prefixes those
failures with `[critical]`.

Severity also decides the gated metric. A case is a **success** only when the
loop completed *and* no critical check failed, and `successRate` — what
`--min-success` reads — counts those. "The loop ran to a stop without a
provider error" is reported alongside as `completionRate`: it is a liveness
signal, not a result, and a model that called zero tools scores 100% on it.

Eleven suites are registered:

| Suite | Tools | Bridge (`src/evals/`) |
|---|---|---|
| `tool-loop` | `ui_*` graph editor | `tool-loop-bridge.ts` |
| `workflow-escalation` | `ui_*` graph editor + `ask_user` | `tool-loop-bridge.ts` + `escalation.ts` |
| `script-tools` | `ui_script_*` | `surfaces/script.ts` |
| `jsscript-tools` | `ui_jsscript_*` | `surfaces/js-script.ts` |
| `sketch-tools` | `ui_sketch_*` | `surfaces/sketch.ts` |
| `timeline-tools` | `ui_timeline_*` | `surfaces/timeline.ts` |
| `storyboard-tools` | `ui_storyboard_*` | `surfaces/storyboard.ts` |
| `model3d-tools` | `ui_3d_*` | `surfaces/model3d.ts` |
| `app-tools` | `ui_app_*` App Builder | `surfaces/app.ts` |
| `thread-memory-tools` | `thread_memory_*` / `asset_*` | `surfaces/thread-memory.ts` |
| `creative-pipeline` | the three creative surfaces, composed, plus `ui_brief_*` / `ui_review_*` | `surfaces/creative-pipeline.ts` |

`creative-pipeline` is the long-horizon suite: one commission carried through
brief → ideation → sketch → storyboard → cut → review, scoring the *seams*
rather than any one surface. It composes the real sketch, storyboard and
timeline bridges instead of reimplementing them, so it cannot drift from the
three suites that already cover those contracts, and replaces
`ui_storyboard_assemble_timeline` with a version that actually drives the
timeline bridge — the handoff is the thing under test. `ui_brief_*` and
`ui_review_*` are eval instrumentation, not a frontend contract: a brief passed
only in the prompt can't be told apart from one the model ignored.

Rendered clips come back 1.35× the requested length, the way a video model that
emits fixed-length takes does, so a cut planned to exactly fill the brief
overruns. Catching that and trimming — the *last* clip, since shortening an
earlier one only opens a gap and leaves the runtime untouched — is what
separates a scoring run from a passing-looking one.

The predicates grade outcomes, not the shape of the process. Three checks were
rewritten after live runs, all the same mistake: they encoded one valid working
order and failed models that used another.

- Severity was a three-value enum that threw on `"critical"`, failing a run on
  this harness's vocabulary. Synonyms now map.
- Overrun detection grepped the note prose for runtime/duration/length, and
  scored a run that found the overrun and fixed it as a miss on wording. It
  now reads the severity the model assigned.
- `reviewActedOn` counted edits after the first review note, requiring
  report-before-fix. A sonnet run assembled at 16.20s, trimmed and
  ripple-moved to 12.00s, verified with `ui_review_get_cut` and *then* filed
  notes as a sign-off — a complete loop scored as "review changed nothing". It
  is now `cutRevisedAfterAssembly`, which accepts either order.

Measured on `claude_agent_sdk`/sonnet: `full-pipeline` 1.00 in 93 calls (401s,
~$2.6), `review-catches-overrun` 1.00 in ~25, `brief-constraints-hold` 0.91 in
97. The SDK throws on its turn cap rather than stopping, so a low cap scores
the whole case zero — `--max-iterations 220` clears the full case. The suite
costs real money.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval creative-pipeline \
  -p claude_agent_sdk -m sonnet --max-iterations 220 --no-find-model
```

`scripts/dump-creative-run.ts` runs one case and writes the work itself —
concepts, style-frame prompt, shot list, the assembled cut with timings, review
notes, phase snapshots and the full tool transcript — to
`nodetool-debug/creative-<case>.{md,json}`. The eval report gives pass/fail and
call counts, which is right for a scoreboard and useless for seeing what the
model made.

```bash
IS_SANDBOX=1 npx tsx packages/agents/scripts/dump-creative-run.ts \
  full-pipeline claude_agent_sdk sonnet 220
```

**Live media (`--live`).** The suite fakes every generate/render, which is what
makes it a CI-priced eval. Pass `--live` and the same tool calls additionally
hit fal, so the run leaves real stills and clips in
`nodetool-debug/creative-<case>-media/` without changing a tool contract or a
predicate. One run's output is checked in at `docs/evals/creative-pipeline/`
so the suite's media can be inspected without paying for a run. `MediaBackend` is an interface in the bridge; the fal wiring lives in
the script, because `packages/agents` has no fal dependency and should not grow
one for an opt-in path.

Stills default to `openai/gpt-image-2`, clips to
`ltx-2-19b/distilled/image-to-video`; override with `CREATIVE_IMAGE_MODEL` /
`CREATIVE_VIDEO_MODEL`. The first draft used `flux/schnell` at $0.003 per
megapixel on cost grounds and it was the wrong trade — flux mangles hands and
the brief requires them in three of four shots. Video stays cheap at $0.0008
per megapixel; the agent loop driving the run is still the dominant cost at
~$2.60.

Three caveats. The timeline still lays clips at the simulated overshoot, so the
scored runtime is not the runtime of the files on disk — LTX returned 4.84s
takes for 3s requests, a 1.61× overshoot against the 1.35× modelled, so the
planted defect is conservative. The provider reads `FAL_API_KEY`, not
`FAL_KEY`. And no predicate can see the pixels: `forbiddenAvoided` reads shot
text and layer names, so a run passed it while gpt-image-2 branded a bottle
with lettering the brief forbade. The suite grades the plan; grading the
artifact needs a human or a vision model.

```bash
FAL_API_KEY=$FAL_KEY IS_SANDBOX=1 npx tsx \
  packages/agents/scripts/dump-creative-run.ts full-pipeline claude_agent_sdk sonnet 220 --live
```

#### Interactive escalation (`workflow-escalation`)

Every other tool-loop case is fully specified: the prompt carries everything the
model needs, so guessing is never required and never penalized. This suite
removes that guarantee. Each case withholds something only the user can supply
— the names for an input and output, permission to delete a node, a choice
between two node types that fit equally well, a capability the catalog does not
have — and hands the model an `ask_user` tool wired to a **scripted user**
(`src/evals/escalation.ts`). The question is matched against the case's reply
script, the matching reply comes back as the tool result, and every exchange is
recorded.

That makes the score a pair, not a single judgement: `escalation.mustAsk` names
the reply the model has to trigger, and the case's `finalState` predicates check
that it then built what the answer said. A model that guesses fails on the ask;
one that asks the right question and ignores the reply fails on state. An
off-script question gets a deliberately useless fallback answer and trips
`allQuestionsMatched`, and `askBefore` is the confirm-before-you-act constraint
— `ui_delete_node` must not precede the first `ask_user`.

The fifth case, `no-escalation-needed`, guards the opposite failure: the
objective pins every value, `ask_user` is on the table, and reaching for it is
itself the failure. Without it the suite would reward a model that asks about
everything.

Escalation is a property of the generic runner, not of the graph surface — any
tool-loop case on any surface can declare `escalation` and get the same tool and
the same checks.

```bash
npm run dev:nodetool -- eval workflow-escalation --list
npm run dev:nodetool -- eval workflow-escalation -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval workflow-escalation -p openai -m gpt-5.4-mini --min-success 0.8
```

Measured on `claude_agent_sdk`/sonnet (`--max-iterations 40 --no-find-model`,
5/5 accepted, $0.80 for the suite, scored before check weighting landed):
`ask-for-missing-names` 1.00 in 13 calls, `ask-which-step` 1.00 in 7,
`no-escalation-needed` 1.00 in 9, `escalate-missing-capability` 0.92 in 30 (24
of them `ui_search_nodes`, hunting for an image node the catalog doesn't have
before accepting it isn't there), and `confirm-before-delete` 0.62 — it read the
graph, deleted the dead branch, and never asked. The destructive-confirmation
case is the one models fail here.

Harness tests, including a golden transcript per case so no case can be
unsatisfiable: `tests/escalation-tool-loop.test.ts`.

`thread-memory-tools` is the odd one out: instead of reimplementing a browser
surface, its bridge executes the **real backend tools** (`thread_memory_save`/
`list`, `asset_search`) plus a stub `generate_image` against an in-memory DB
(`initTestDb`), so it exercises the actual persistence + resource validation a
chat turn does. It scores the creative loop: generate media → remember it with
an asset reference → recall it.

Bridges reuse the pure packages where the real logic already lives —
`@nodetool-ai/timeline` (`splitClip`, `ANIMATION_PRESETS`, subtitle assembly,
clip/track factories) — rather than reimplement. The sketch surface reimplements
its layer-stack ops directly, but not its pixels: every raster layer is an
`@napi-rs/canvas` bitmap. `ui_sketch_stroke` runs the editor's paint core
(`@nodetool-ai/image-editor/painting.js`) and fill / gradient / shape / transform
/ adjust / crop / selection-shape run `@nodetool-ai/image-editor/raster.js`, both
pointed at skia with `setPaintSurfaceFactory(createCanvas)`, so a headless edit
is the edit the browser would paint. `ui_sketch_get_layer_image` composites those layers —
opacity and blend mode included, NodeTool's `"normal"`/`"add"` mapping onto
Canvas's `"source-over"`/`"lighter"` — and hands the model a PNG of its own
work. `SketchToolBridge.compositePng()` (or `getLastSketchToolBridge()`, for a
bridge the eval runner owns) takes the finished drawing out for a human to look
at. That is what makes `draw-an-animal` scoreable: it checks that strokes
landed on several named layers and covered a real fraction of the canvas
(`strokedFraction`, measured over stroked layers only so a solid `fillColor`
backdrop cannot pass it) — outcomes, not a pixel-exact cat.
Browser-only tools (asset capture, WebGL viewport render) are scoped out:
`ui_sketch_render_to_asset`,
`ui_timeline_get_clip_frames`, `ui_3d_capture_view`. Storyboard cannot import
`@nodetool-ai/llm-nodes` (it depends on `@nodetool-ai/agents`), so its
generate/render jobs are faked by flipping shot status. Its board holds wire
`Shot` objects and normalizes every write through
`normalizeStoryboardScreenplay` (`@nodetool-ai/protocol/api-schemas`), and
`finalState().savable` reports whether `storyboards.update` would accept what
the board now holds — a bridge that minted the `id`/`index`/`status` a model
omits kept this suite green through a bug that lost a user's board. The
app-builder surface
reimplements only the Puck *layout* ops (nested slot tree: top-level content plus
slot-valued props on Panel/Columns) headlessly — those live in `web/`
(`puckDataOps.ts`), which a backend package can't import. Its operation,
variable, resource, and binding-target tools call the shared doc-ops in
`@nodetool-ai/app-runtime` (`src/doc-ops.ts`), the same module the browser
handler calls, so that half of the contract cannot drift. The widget types it
offers come from `WIDGET_CATALOG` in the same package — every widget the editor
ships, with the fields each accepts — so `ui_app_list_component_types` reports
the same catalog headlessly that the browser reads off the live Puck config.

```bash
npm run dev:nodetool -- eval timeline-tools --list
npm run dev:nodetool -- eval script-tools -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval sketch-tools -p ollama -m qwen-3.5:4b --cases compose-layers
npm run dev:nodetool -- eval model3d-tools -p openai -m gpt-5.4-mini --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/tool-loop-eval.test.ts`
plus one per surface (`tests/{script,js-script,sketch,timeline,storyboard,model3d,app,thread-memory,creative-pipeline}-tool-loop.test.ts`).
For a live check against a real model, run the eval command above — a suite
whose verdict depends on what a model chose belongs behind an explicit
invocation, not in the unit suite, where a weak local model fails the run for
everyone.

**Running against the `claude_agent_sdk` provider.** Two gotchas, both from the
SDK's own agent loop (not the harness):

- **Turn cap throws.** The SDK raises `error_max_turns` when it reaches its turn
  limit, so a run that would merely *stop* under a stateless provider (Anthropic,
  Ollama) instead errors and the case scores `accepted=false`. Its turn
  accounting also counts each tool round, so the default `--max-iterations 12`
  is easily exhausted by an over-searching model. Pass a higher cap
  (`--max-iterations 40`) when driving these suites with `claude_agent_sdk`.
- **`uid=0` refusal.** The tool path runs the CLI under `bypassPermissions`, which
  it refuses as root; set `IS_SANDBOX=1` (or run non-root). It must be **exactly
  `1`** — the SDK's sandbox check is value-sensitive, so an ambient
  `IS_SANDBOX=yes` (as in Claude Code on the web) does **not** satisfy it and the
  child exits with code 1 and zero tool calls, which looks like an auth/spawn
  failure but isn't. Override it explicitly: `IS_SANDBOX=1 npm run …`. See
  [docs/AGENTS.md § Claude Agent SDK](../../docs/AGENTS.md) for the full
  nested-session recipe.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval timeline-tools \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

### Sub-agent execution eval (`subtask`)

Where the tool-loop suites score a model on one flat tool surface, the
`subtask` suite scores `RunSubtaskTool` — the primitive that lets an agent
decompose work by spawning a fresh child agent that inherits the parent's
toolset. It runs a real `CodeActExecutor` parent equipped with `run_subtask` plus
six instrumented worker tools (`calculate`, `kv_write`, `kv_read`,
`lookup_fact`, `slugify`, `flaky_fail`), each objective written to force
delegation. The tools are shared instances at both levels; each records the
`SUBTASK_DEPTH_KEY` it ran at, so the scorer distinguishes "the parent did it
itself" (depth 0) from "the parent delegated and the child did it" (depth >=
1). Scoring is structural (`checkSubtaskExpectations`): required parent tools,
required *child* tools, forbidden tools, subtask-count and depth bounds, no
failed subtasks, required store keys, and answer/subtask-result substrings.
Cases + tools live in `src/evals/subtask-cases.ts`, the runner in
`src/evals/subtask-eval.ts`.

```bash
npm run dev:nodetool -- eval subtask --list
npm run dev:nodetool -- eval subtask -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval subtask -p openai -m gpt-5.4-mini --cases all-tools
IS_SANDBOX=1 npm run dev:nodetool -- eval subtask \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

Its cases do not use `find_model`, so `--no-find-model` does not skip them —
the primary `-p` provider runs both the parent and every subtask. A low score
with `subtasks=0` is a real finding, not a harness bug: a capable model often
does trivial single-step work inline instead of delegating. Harness tests
(scripted provider, no network): `tests/subtask-eval.test.ts`.

### Mini-app build eval (`app-build`)

The only suite that scores a whole product loop rather than one stage:
`buildApp` (`src/app-build/`) takes a prompt through spec → plan → author →
check → run → judge, repairing what the oracle complains about, and the suite
counts how often that ends green and how much repair it took. Cases in
`src/evals/app-build-cases.ts`, runner in `src/evals/app-build-eval.ts`.

Metrics per `docs/mini-app-build-harness-design.md` §5.3: **one-shot rate**
(green with zero repair rounds — the PRD's north-star number), **green-within-
budget rate** (the suite's `successRate`, what `--min-success` gates on), repair
rounds, cost, and duration.

A case is green only when the build's own verdict is ok **and** its target-shape
checklist holds — operations, workflows, widget count, a widget nested in a
container, a `persist: true` variable, a streaming output shown by a display
widget, an operation reading a variable another wrote, and a widget carrying a
condition. Without the checklist a build that shipped one operation and three
widgets would score as a success. Each of the eight prompt cases declares which
of the six medium-complexity traits (PRD §4) it exercises;
`uncoveredAppBuildTraits()` names any trait that lost its last case, and the
harness test fails on a non-empty answer.

The two deterministic cases (`greeting-card`, `draft-then-publish`) pin the
spec, bind template graphs (text transforms — no model in the app under test),
author from a scripted list of `ui_app_*` calls, skip the judge, and assert
exact widget values. They call no provider, so they run on every PR as the
Quality Gate's `app-build` leg; what they regress is the harness, not a model.
The full suite runs nightly (`.github/workflows/app-build-eval.yml`), reports,
and gates nothing — a model's off night is not a broken build.

```bash
npm run dev:nodetool -- eval app-build --list
npm run dev:nodetool -- eval app-build -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval app-build --cases greeting-card,draft-then-publish \
  -p ollama -m none --no-find-model --min-success 1   # no API key needed
```

Harness tests (scripted authoring, stub kernel runner, no network):
`tests/app-build-eval.test.ts`.

## Observing LLM Steps and Planning

### Execution Tree (CLI)

The CLI renders a real-time tree view during agent execution:

```
✓ initialization    Starting parallel task planning...
✓ generation        Generating parallel plan...
✗ validation        Plan validation failed: duplicate step IDs
✓ generation        Retry attempt 2/3...
✓ complete          Plan created: 5 tasks, 5 steps, 5 parallelizable

◆ Plan  (3/5 tasks)
├─ ✓ Task 1: Search sources            3.2s (1/1 steps)
├─ ◐ Task 2: Analyze findings
│  ├─ ✓ google_search(query: "AI trends")
│  └─ ◐ llm_call
└─ ○ Task 3: Write report              waiting
```

### Message Types

All execution events are yielded as `ProcessingMessage`:

| Type | Description |
|------|-------------|
| `planning_update` | Planning phase progress (initialization, generation, validation, complete) |
| `task_update` | Task lifecycle (task_created, step_started, step_completed, step_failed, task_completed) |
| `tool_call_update` | Tool invocation with name and args |
| `step_result` | Step completion with result or error |
| `chunk` | Streaming text output |
| `log_update` | Informational log messages |
| `llm_call` | Full LLM call details (provider, model, messages, response, tokens, cost, duration) |

### Debug Logging

```bash
# Verbose logging to stderr
export NODETOOL_LOG_LEVEL=debug

# Log to file
export NODETOOL_LOG_FILE=/tmp/agents.log
```

### OpenTelemetry Tracing

Span hierarchy (an analyzer agent can read this tree to optimize prompts):

```
workflow.run
  node.process
    agent.execute
      agent.plan        (TaskPlanner.planMultiTask / authorGraph)
        llm.chat        (BaseProvider.generateMessageTraced)
        llm.stream      (BaseProvider.generateMessagesTraced)
      agent.step        (CodeActExecutor.execute)
        llm.chat
        llm.stream
```

Span attributes:

- `agent.*`: `agent.kind` (execute/plan/step), `agent.objective`, `agent.provider`, `agent.model`, `agent.tools_count`, `agent.task` (for steps), `agent.plan.kind` (multi/single/graph)
- `llm.*`: `llm.provider`, `llm.model`, `llm.request.message_count`, `llm.request.tools_count`, `llm.request.max_tokens`, `llm.request.stream`, `llm.response.content` (first 2000 chars), `llm.response.tool_calls_count`
- `gen_ai.*` (OTel GenAI semconv): `gen_ai.system`, `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, `gen_ai.usage.cost_usd`
- `workflow.*` / `node.*`: `workflow.id`, `workflow.name`, `workflow.node_count`, `node.id`, `node.type`

Sinks (simultaneous, each on its own SpanProcessor):

```bash
# JSONL trace file — one span per line, analyzer-friendly
export NODETOOL_TRACE_FILE=/tmp/nodetool-trace.jsonl

# Stdout — pretty (human) or json (JSONL)
export NODETOOL_TRACE_STDOUT=pretty       # or "json"

# OpenTelemetry — console (legacy)
export OTEL_TRACES_EXPORTER=console
export TRACELOOP_DISABLE_BATCH=true

# OpenTelemetry — Traceloop cloud
export TRACELOOP_API_KEY=your-key

# OpenTelemetry — custom OTLP backend (Jaeger, Grafana, etc.)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

CLI flags pass these through:

```bash
nodetool-chat --trace-file trace.jsonl
nodetool-chat --trace-stdout pretty
nodetool --trace-file trace.jsonl run workflow.ts
```

Telemetry must be initialized before use:

```typescript
import { initTelemetry } from "@nodetool-ai/runtime";
await initTelemetry({
  traceFile: "trace.jsonl",   // optional
  stdout: "pretty",            // optional: "pretty" | "json" | false
});
```

The CLI calls `initTelemetry()` at startup automatically. The WebSocket server requires env vars to be set before starting.

### Web UI

The web UI renders the same tree view in the chat panel (`ExecutionTree` component). The `TracePanel` provides a detailed event inspector with token counts, costs, and full request/response payloads.

## Evaluation and Optimization

### Cost Tracking

`CostCalculator` in `@nodetool-ai/runtime` tracks per-call costs based on provider pricing:

```typescript
provider.trackUsage(model, { inputTokens: 100, outputTokens: 50 });
console.log(provider.getTotalCost()); // USD
```

Costs are logged via `logProviderCall()` and included in `llm_call` messages.

### Model Selection

Use separate models for planning vs execution to optimize cost/quality:

```typescript
const agent = new Agent({
  model: "claude-haiku-4-5",           // Fast/cheap for step execution
  planningModel: "claude-sonnet-5",  // Better for plan decomposition
  reasoningModel: "claude-opus-4-6",   // Best for complex reasoning
  ...
});
```

### Tool Result Truncation

- Tool results are truncated to 20,000 chars (`MAX_TOOL_RESULT_CHARS`) before being added to history.
- Step executors delegate the tool-calling loop to `provider.generateLoop`, so each provider manages its own context window (the Claude Agent SDK compacts internally; stateless providers send the full transcript). There is no NodeTool-side per-step token budget, compaction, or eviction.

### Plan Validation

Plans are validated before execution:
- Step/task IDs must be unique across the entire plan
- Dependencies must reference valid IDs
- No circular dependencies (DAG validation via DFS)
- On failure, error is fed back to LLM for retry (up to `maxRetries`)

### Output Schema Validation

Steps can enforce structured output via JSON schema:
- `additionalProperties: false` enforced automatically
- Schema'd steps finalize ONLY through the `finish_step` tool — there is no JSON-from-text extraction path. If `finish_step` is never called, the step fails on `maxIterations` and emits an explicit error result.
- Unstructured steps (no schema) finalize when the model emits a no-tool-call assistant message; that text becomes the result.

### Skills System

Skills inject domain-specific instructions into the agent system prompt:

```
.claude/skills/my-skill/SKILL.md
~/.claude/skills/shared-skill/SKILL.md
```

Skill format:
```markdown
---
name: data-analysis
description: Analyze CSV datasets and produce summary statistics
---

When analyzing data:
1. Load the dataset using read_file
2. Identify column types
3. Compute summary statistics
```

Control via environment variables:
```bash
NODETOOL_AGENT_SKILL_DIRS=/path/to/skills   # Additional skill directories
NODETOOL_AGENT_SKILLS=skill-a,skill-b       # Explicitly enable skills
NODETOOL_AGENT_AUTO_SKILLS=0                # Disable auto-matching (default: enabled)
```

### Tuning Checklist

1. **Reduce cost**: Use cheaper `model` for execution, better `planningModel` for decomposition
2. **Improve plan quality**: Increase `maxRetries` on `TaskPlanner`, use custom `systemPrompt`
3. **Speed up execution**: Decompose into more independent tasks (maximizes parallelism)
4. **Control scope**: Set `maxSteps` and `maxStepIterations` to prevent runaway execution
5. **Validate output**: Use `outputSchema` to enforce structured results
6. **Restrict tools**: Per-step `tools` arrays limit which tools a step can call
7. **Observe**: Enable tracing (`OTEL_TRACES_EXPORTER=console`) to see every LLM call
8. **Iterate on skills**: Add domain-specific SKILL.md files to improve agent behavior

## Authoring Agent Nodes — Pitfalls

When building a node that wraps an agent (e.g. `llm-nodes` `AgentNode`):

- **Every tool named in an agent's system prompt must actually be registered in
  its toolset.** A prompt-referenced-but-unregistered tool is a silent
  no-op. Resolve real builtin tools (`resolveBuiltinAgentTool`) and don't reference
  tools you didn't wire.
- **Every declared prop must be consumed by `process()` or injected into the
  prompt.** A declared-but-unwired prop (`max_output_chars`, `url`, `output_dir`)
  does nothing — inject node props via a `promptContext()` hook.
- **`yield` structured results so the kernel routes them to dynamic output
  handles; don't `return` them from a generator** (`yield*` discards the return
  value). Keep structured-output emission consistent across modes (loop vs plan).
