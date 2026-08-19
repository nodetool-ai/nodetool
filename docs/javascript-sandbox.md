---
layout: page
title: "JavaScript Sandbox"
permalink: /javascript-sandbox
description: "How NodeTool runs untrusted JavaScript in a QuickJS WebAssembly guest — the capability surface, the limits, the module system, and how the Code node and CodeAct agents use it."
---

**Navigation**: [Architecture](architecture.md) | [Chat &amp; Agents](global-chat-agents.md) | [CodeAct design](codeact-design.md) | [Sandbox packages](sandbox-package-design.md)

Every piece of JavaScript NodeTool did not write itself runs in one place: a
QuickJS WebAssembly guest built by `runInSandbox`
(`packages/agents/src/js-sandbox.ts`). A workflow's Code node, an agent's code
action and a planner's graph program all enter through that function, and they all get the same engine, the same limits, and the same
marshaling rules.

The guest has its own heap inside the WASM instance, so a runaway or hostile
program cannot corrupt the host V8 heap the way it could under `node:vm`. What
it can reach is a curated set of host bridges, and each one is a capability the
caller granted for that run.

## Where it runs

| Caller | Code | What runs |
|---|---|---|
| `nodetool.code.Code` | `packages/code-nodes/src/nodes/code-node.ts` | A user's node body, with dynamic inputs on `inputs` |
| CodeAct step / chat turn | `packages/agents/src/codeact/` | One model-written action per `execute_code` call |
| `validate_workflow` with `code` | `packages/agents/src/graph-dsl.ts` | A legacy graph DSL program with no host access at all |
| Browser runner | `packages/workflow-runner/` | The same Code nodes, in the page, fetching modules over HTTP |

One engine (`loadQuickJs`, the `quickjs-ng` release variant) is loaded once per
process and shared. Each invocation gets a fresh runtime and context.

## Anatomy of a run

1. **Resolve limits.** `resolveSandboxLimits` applies defaults and clamps every
   caller override to a hard ceiling. A caller can tighten a limit, or raise it
   within bounds, but never switch a protection off.
2. **Build the bridges.** `buildSandbox` constructs the host-side objects
   (`fetch`, `workspace`, `crypto`, …) bound to this run's context, limits and
   abort signal. Each async bridge is wrapped in `neverReject` and `guardAbort`.
3. **Build the entry module.** `buildEntryModule` parses the code with acorn,
   hoists static `import` declarations above the wrapper, and emits the rest as
   the body of a top-level-awaited async IIFE, so `return value` becomes the
   module's default export. Code acorn cannot parse falls through to `wrapCode`
   unchanged, so a syntax error reaches the user as they wrote it.
4. **Install the module loader** — only when the run declares modules. Without
   `modules`, no loader exists and every `import` resolves nothing.
5. **Init prelude.** `eval`, `Function` and the wrapper's unconditional stubs
   (`Buffer`, `process`, `env`, `Headers`, `Request`, `Response`, `performance`)
   are deleted. The entry module additionally deletes the timer globals, which
   the wrapper library re-installs on every evaluation.
6. **Run**, under an interrupt handler on a CPU deadline and a wall-clock race.
7. **Serialize.** `serializeResult` walks the returned value (cycle-safe,
   depth-capped at 32) converting typed arrays at any depth, then truncates to
   `maxOutputSize`. Object-typed globals are deep-replaced on the host, which is
   how the Code node's `state` survives between invocations.

## The guest surface

Two kinds of thing, and the difference matters: **capabilities are globals,
libraries are imports.**

### Capabilities (globals)

| Global | What it does |
|---|---|
| `console.*` | Log lines land in the run's `logs` array |
| `fetch(url, options?)` | HTTP, returning `{ok, status, headers, body, json, text(), arrayBuffer(), bytes()}`. A `Uint8Array` body is sent as raw bytes |
| `workspace.*` | `read`, `write`, `list`, `readBytes`, `writeBytes`, `stat`, `root`, `copy`, `move`, `mkdir`, `remove`. Needs a `ProcessingContext` |
| `getSecret(name)` | The run's secret store, limited to the run's declared secret scope |
| `nodetool.secrets.*` | `get` (throws when unset), `tryGet`, `list` — over the same bridge |
| `sleep(ms)` | The only timer |
| `crypto.*` | `randomUUID`, `getRandomValues`, `digest`, `hmac` (WebCrypto-backed; SHA-1/256/384/512) |
| `format.*` | `number`, `date`, `relativeTime`, `list` — host `Intl`, which QuickJS does not ship. All four are async |
| `image.*` | `info`, `stats`, `decode`, `blank`, `pad`, `grid`, `resize`, `crop`, `rotate`, `flip`, `adjust`, `composite`, `convert`. Transforms return image handles |
| `audio.*` | `info`, `normalize`, `trim`, `concat`, `mix`, `reverse`, `fadeIn`, `fadeOut`, `repeat`. Transforms return audio handles |
| `video.*` | `info`, `trim`, `resize`, `rotate`, `addAudio`, `extractAudio`, `extractFrame`. Transforms return video, audio, or image handles as appropriate |
| `media.*` | `bytes`, `text`, `info` read a document/image/audio/video input; `toDocument`, `toImage`, `toAudio`, `toVideo` build one to emit or output. Needs a `ProcessingContext` |
| `canvas.measureText` / `createCanvas(w, h)` | Canvas 2D drawing, recorded in the guest and replayed on a real host context by `await surface.toBytes()` |
| `assetToSandbox(assetId, path)` / `sandboxToAsset(path)` | Move an asset in and out of the workspace |
| `progress(percent, message?)` | Fire-and-forget progress, rate-limited and capped |
| `emit(name, value)` / `output(name, value)` | The Code node's output contract: stream a value now, or record a handle's final value. Awaitable; `emit` awaits drain under backpressure |
| `toBase64` / `fromBase64` / `toHex` / `fromHex` / `parallelMap` | Pure guest helpers, no host call behind them |

Core JavaScript — `JSON`, `Math`, `Date`, `Map`, `Set`, `RegExp`, `URL`,
`URLSearchParams`, `TextEncoder`/`TextDecoder` — is QuickJS's own, not a
host-bridged version.

Callers add their own globals through `RunSandboxOptions.globals`:
`inputs` and `state` for the Code node, `tools`/`state`/`finish` for CodeAct,
`node`/`graph` for the graph DSL. Names in `RESERVED_SANDBOX_NAMES` cannot be
overwritten this way.

#### `media.*` — media inputs and outputs

A `document`, `image`, `audio` or `video` input arrives in the guest as a ref
object, not as bytes. `media` is the bridge that resolves one, and the bridge
that turns bytes back into a ref the next node can read:

```js
const bytes = await media.bytes(inputs.pdf);
const page = await media.text(inputs.notes);          // utf-8 unless `encoding` says otherwise
const { mimeType, size } = await media.info(inputs.pdf);
await output("report", await media.toDocument(bytes, { mimeType, filename: "report.pdf" }));
```

| Call | Returns |
|---|---|
| `media.bytes(ref)` | `Uint8Array` |
| `media.text(ref, { encoding? })` | `string` |
| `media.info(ref)` | `{ type, mimeType, uri, size }` |
| `media.toDocument(bytes, { mimeType?, filename? })` | `DocumentRef` |
| `media.toImage(bytes, { mimeType? })` | `ImageRef` |
| `media.toAudio(bytes, { mimeType? })` | `AudioRef` |
| `media.toVideo(bytes, { mimeType? })` | `VideoRef` |

Every call is async — `await` all seven.

A ref resolves from any of the forms the rest of NodeTool produces: `asset://`,
a storage path (`/api/storage/<key>`), an `https:` URL, a `data:` URI, a
`package://` asset shipped inside a node package, and a plain file path. Pass
the whole input object, not its `uri` — `media.bytes(inputs.pdf)` — so the ref's
own type travels with it.

These are **capabilities, not libraries**: they need a `ProcessingContext`, so
they resolve inside a workflow run and throw in a bare `runInSandbox` call with
no context. For the libraries that read what the bytes contain — a PDF, a
spreadsheet, a zip — import a sandbox package.

#### Media editing handles

`image.*`, `audio.*`, and `video.*` accept a media ref, encoded bytes, or a
handle from an earlier operation in the same run. A transform returns a small
`sandbox://media/<id>` handle with its media type. The encoded payload stays on
the host while calls
chain:

```js
const joined = await audio.concat([inputs.intro, inputs.voiceover]);
const clip = await video.trim(inputs.video, { start: 2, end: 12 });
const finished = await video.addAudio(clip, joined, {
  keepOriginalAudio: true
});
await output("video", await video.toAsset(finished));
```

Use `<type>.bytes(handle)` only when code must inspect the encoded payload.
Use `<type>.toAsset(handle)` or `media.toImage/toAudio/toVideo(handle)` before
the run ends when the result must persist. Handles do not work in a later run.
Audio and video transforms use Mediabunny. Browsers use WebCodecs, and Node
uses Mediabunny's server codec adapter. The sandbox does not expose workflow
nodes or their packages.

### Libraries (imports)

There is no library global. Every library the sandbox offers is a **sandbox
package** the run declares and imports:

```js
import yaml from "@nodetool-ai/sandbox-yaml";
const config = yaml.load(inputs.text);
await output("config", config);
```

NodeTool ships thirty-eight (`packages/sandbox-packs/`): `-dates` (date-fns),
`-yaml` (js-yaml), `-markdown` (marked), `-qr` (uqr), `-color` (culori),
`-decimal` (decimal.js), `-jmespath` (jmespath), `-stats` (simple-statistics),
`-rrule` (rrule), `-gif` (gifenc), `-dsl` (NodeTool's graph builder) and
`-flow` (NodeTool's node callables) run
inside the guest; `-csv` (papaparse), `-html` (cheerio + turndown), `-xml`
(fast-xml-parser), `-xlsx` (exceljs), `-diff` (diff), `-zip` (fflate), `-ocr`
(tesseract.js), `-tfjs` (TensorFlow.js and its model zoo), `-docx` (docx),
`-mammoth` (mammoth), `-epub` (epub2), `-fabric` (Fabric.js — SVG and vector
scenes), `-pdflib` (pdf-lib), `-pptxgen` (PptxGenJS), `-chrono` (chrono-node),
`-exif` (exifr), `-expr` (expr-eval), `-ics` (ics), `-subtitle` (subtitle),
`-tokens` (js-tiktoken), `-pptx` (office-text-extractor) and `-pdf`
(pdf-parse) run on the host behind a
generated facade, because they need Node builtins or a DOM, or carry a limit
the guest could not enforce on itself (zip's 50 MB inflation cap), or hold
state no run can keep alive (the tfjs weights). Four more carry
NodeTool's own code rather than a library — `-aws` signs a request with SigV4,
and `-notion`, `-supabase` and `-twilio` build an authenticated one —
and none of them sends it:
the guest passes what comes back to its own `fetch`, under the run's fetch cap
and SSRF guard. Every shipped pack is available out of the box — a checkout, the
desktop app and the server image each read them from where their own build put
them. A third-party pack is installed through the Package Manager and is
discovered the same way. See
[Sandbox packages](sandbox-package-design.md) and
`packages/sandbox-packs/README.md`.

## Limits

Every default below is overridable per invocation through
`RunSandboxOptions.limits` and clamped to the ceiling in the last column.

| Limit | Default | Enforced by | Ceiling |
|---|---|---|---|
| Execution time | 30 s (`timeoutMs`) | interrupt handler on a CPU budget + wall-clock race | — |
| CodeAct action timeout | 600 s | `DEFAULT_CODEACT_ACTION_TIMEOUT_MS` | — |
| Suspended time | 30 min | `suspendAllowanceMs`, only with a `clock` | — |
| Guest heap | 64 MB | `runtime.setMemoryLimit` | 512 MB |
| Call stack | 512 KB | `runtime.setMaxStackSize` | 8 MB |
| Fetch calls | 20 per run | counter in the bridge | 100 |
| Fetch body | 1 MB | truncation in the bridge | 50 MB |
| Fetch timeout | 15 s | per-request `AbortController` | 120 s |
| Fetch redirects | 5 hops | the bridge | — |
| Output size | 100 KB | `serializeResult` | 10 MB |
| Random bytes | 64 KB per call | `crypto.getRandomValues` clamp | — |
| Progress reports | 1000 per run, one per 100 ms | counter + timestamp | — |
| Host module text input | 5 MB | `host-modules/limits.ts` | — |
| Host module byte input | 10 MB | `host-modules/limits.ts` | — |
| Image input | 25 MB, 32 M pixels, 16384 px longest edge | `assertSurfaceSize` | — |
| Run media handles | 256 MB total encoded payload | `SandboxMediaStore` | — |
| Canvas ops | 10 000 per render | `renderCanvas` | — |
| Tool calls per action | 50 | `DEFAULT_MAX_TOOL_CALLS_PER_ACTION` | — |

QuickJS's memory limiter counts its own heap objects. String and typed-array
payloads are not charged against it, so `memoryLimitBytes` bites on object
allocation, not on `new Uint8Array(n)`.

## Concurrency

The sandbox is fully asynchronous, and a bridge call starts its host-side work
when it is **invoked**, not when it is awaited. `Promise.all` over five fetches
therefore takes one round trip, not five:

```js
const pages = await Promise.all(urls.map((u) => fetch(u)));
```

`parallelMap(items, fn, concurrency = 5)` is the bounded form — order-preserving,
maximum concurrency 32, rejecting on the first failure. Parallel calls count
against the per-run fetch cap exactly like serial ones.

Timer globals (`setTimeout`, `setInterval`, `setImmediate` and their clears) are
deleted inside the user-code module. Their callbacks would fire through
`ctx.callFunction` with errors discarded, outside the never-reject and
abort-guard conventions every bridge follows. `sleep` is the only timer.

## Marshaling rules

Anything crossing the WASM boundary follows four rules. Break one and the
symptom is silent data corruption, not an error.

- **Host async functions never reject.** A failing bridge resolves a tagged
  `{__nodetool_sandbox_error__: true, name, message}` object, and a guest
  prelude re-throws it as a real `Error`. This works around a handle leak in
  `@sebastianwessel/quickjs@3.0.1` that trips an assertion
  (`list_empty(&rt->gc_obj_list)`) when the runtime is freed.
- **Binary crosses asymmetrically.** Guest → host is native: typed-array
  serializers registered with `addSerializer` turn a guest `Uint8Array` into a
  host one. Host → guest is not: a returned `Uint8Array` would arrive as a
  numeric-keyed plain object, so byte-producing bridges return a base64 marker
  object that the guest prelude rebuilds. Follow this for any new binary bridge.
- **Results are scanned at any depth.** `serializeResult` walks for typed arrays
  through the whole value; the streaming path always nests bytes two levels
  down, and a `Uint8Array` that falls to `JSON.stringify` becomes
  `{"0":137,"1":80}` — lossy and indistinguishable from a user's integer-keyed
  map.
- **Object globals sync back.** After the guest runs, object-typed globals are
  deep-replaced on the host. Primitives pass by value and do not sync.

## Security model

The guest starts with less than plain QuickJS, and every capability past that is
one the host granted.

- **No dynamic code generation.** `eval` and `Function` are deleted before any
  user code evaluates.
- **No ambient modules.** A body that imports nothing gets no loader at all.
  With one, only the packs the run resolved and their intra-pack siblings
  resolve; dynamic `import()` is always denied. Enforcement sits in the
  *normalizer*, not the loader, because QuickJS serves an already-cached module
  without consulting the loader — that is what keeps `node:buffer` and the rest
  of the wrapper's compat preamble out of reach after bootstrap.
- **Scoped secrets.** A run may declare the secret names it needs
  (`limits.secretScope`, host-set). The `getSecret` bridge refuses every other
  name, so a node that talks to one service cannot read another's credentials —
  and because the check is at the bridge, `nodetool.secrets.get` cannot route
  around it. An absent scope is unscoped, which is what a Code node authored
  before scopes existed still gets; an empty declared scope denies everything.
  Writing one is a separate question with a stricter answer: guest code cannot
  set a secret at all. The `settings` capability module
  (`@nodetool-ai/sandbox-nodetool/settings`) reads and writes ordinary
  configuration, refuses `get_setting`/`set_setting` on anything the catalog
  marks a credential, and offers `request_secret` — which takes a *name and a
  reason*, never a value. It opens a dialog in the user's client, the user types
  the key there, and the client saves it with its own authenticated call, so the
  credential never passes through the guest, the websocket frame, or the model's
  context. A run with no interactive client is refused by name rather than
  falling back to a write nobody saw.
- **SSRF guard.** `fetch` refuses loopback, link-local and private ranges,
  including IPv6 forms and IPv4-mapped addresses, and re-checks on every
  redirect. `limits.allowPrivateNetwork` lifts it; it is host-set only, so guest
  code cannot enable it for itself.
- **Workspace containment.** `workspace.*` resolves inside the workspace root
  and re-checks the symlink-resolved real path immediately before each
  operation. `limits.filesystemAccess: "host"` lifts that to the whole
  filesystem the process can reach. Both switches exist because `lib.http` and
  `lib.os` nodes always had that reach and a Code node replacing one must match
  it; both default to the restrictive value, and the graph migration sets the
  filesystem switch only on nodes rewritten from such a node.
- **Cancellation.** Once the abort signal fires, every subsequent bridge call
  fails fast and the guest unwinds. A purely CPU-bound loop still runs to its
  execution timeout — QuickJS's wrapper exposes no interrupt input — but
  `runInSandbox` returns as soon as the signal fires.
- **The platform API is scoped to the caller's own rows.** Every capability
  that reads or writes NodeTool's own data resolves the row against the run's
  user id, and missing and not-yours are one answer so a run cannot probe for
  ids. What is deliberately *not* reachable is written down per procedure in
  `packages/websocket/src/trpc/sandbox-coverage.ts` and checked against the
  live router: credentials, billing, other tenants, host control, the
  transcript of the run's own behaviour, and anything that grants a third
  party access. Publishing is the one exception, and it asks —
  `set_workflow_access` is classified `external`, so the permission gate
  prompts before a workflow becomes readable outside the account.
- **Bridges are the boundary, not the hiding.** The host and WASM module
  dispatchers validate module identity, export name and argument list before any
  implementation loads, and their bindings are deleted before user code starts.
  A pack module that captures a binding during linking gains nothing beyond the
  run's own declared surface.

Known accepted risk: the realpath check and the filesystem call after it are
separate awaits, so an in-workspace symlink swapped between them is a TOCTOU
window. Closing it needs fd-based operations (`O_NOFOLLOW`/`openat`) that
`node:fs/promises` does not expose. It requires a local attacker racing inside
the workspace, on surfaces that run first-party or already-trusted code.

## The module system

A pack declares its sandbox modules in the `nodetool` field of its
package.json. Three kinds, one import surface:

| Kind | Runs | Declared as |
|---|---|---|
| Guest JS | inside QuickJS | authored source, or `{"npm": "<dependency>"}` compiled by `packages/sandbox-compiler` |
| Host JS | where the sandbox runs | `{"kind": "host", "host": "<id>"}`, resolved only through `SANDBOX_HOST_MODULES` in `@nodetool-ai/protocol` |
| WASM | host worker pool | manifest exports with scalar-only signatures, behind a generated facade |

A host id resolves only if the registry pins that exact package as the one
allowed to declare it, so a third-party pack can never bring host code. WASM
calls are stateless by contract: each instantiates fresh from the cached module,
runs, and is discarded.

Compilation of an npm-declared module is cached by content digest, never by
version:

```bash
npm run dev:nodetool -- packs compile          # every installed pack
npm run dev:nodetool -- packs compile --force  # recompile and re-probe
```

Anything that stops a module short of admission is a named skip, not an error:
`npm-module-builtin-import`, `npm-module-unresolved`, `npm-module-too-large`
(1 MB), `npm-module-forbidden-global`, `npm-module-probe-failed`.

The browser runner fetches module sources over
`GET /api/sandbox-modules/*` by opaque module id, and the catalog authorizes and
retrieves in one call — the route never touches the filesystem. Bodies are
verified before they run, so the loading and denial contract is the same in the
page as on the server.

## The Code node

`nodetool.code.Code` is the sandbox as a workflow node.

```js
// inputs: { rows: [...], threshold: 10 }
const kept = inputs.rows.filter((r) => r.score > inputs.threshold);
progress(50, `kept ${kept.length}`);
for (const row of kept) await emit("row", row);   // streams as it goes
await output("count", kept.length);               // final, posted at the end
// outputs: row, count
```

- **Inputs** arrive on the `inputs` object, never as globals of their own name.
  Sharing the global namespace let an input called `env` shadow a bridge and
  made every undeclared identifier ambiguous between a typo and a missing slot.
  Values are deep-copied through JSON before entering the guest.
- **Outputs** leave the body through two awaitable calls, and nothing else.
  `await output(name, value)` records a handle's final value; all final values
  post together as one bag when the body completes, and a second `output` on the
  same handle throws. `name` must be a declared output handle. `return` is
  ordinary control flow — its value is ignored.
- **Media inputs** arrive as refs. Read one with `media.bytes` / `media.text`,
  and output one built by `media.toDocument` / `toImage` / `toAudio` /
  `toVideo`.
- **Streaming.** `await emit(name, value)` delivers `{[name]: value}`
  downstream immediately, while the body keeps running — call it any number of
  times per handle. Awaiting it applies backpressure once the queue is full.
  A body that emits nothing simply never streams; there is no separate
  streaming mode to opt into.
- **Legacy bodies.** A body that calls neither `emit` nor `output` runs the old
  return/yield contract — returned object keys as outputs, implicit return of
  the last expression, `yield` replayed after the run — for one more release,
  with a deprecation warning from `validate_code` and from the editor. See
  [code-node-emit-design.md](code-node-emit-design.md) for the contract and the
  migration.
- **`state`** is a plain object that survives across streaming invocations and
  resets at the start of each workflow run.
- **`progress(percent, message)`** posts `node_progress` to the kernel — the
  same channel the Python worker uses — so a long snippet drives the node's
  progress bar.

### Input streams

`stream` is the input side of `emit`: four verbs that read the node's connected
handles as values arrive, instead of once per item.

```js
for await (const item of stream(name))            // one handle, in order, until EOS
for await (const [handle, item] of stream.any())  // every handle, arrival order
const item = await stream.first(name)             // next value, undefined at EOS
stream.open(name)                                 // could more still arrive?
```

`stream(name)` and `stream.any()` are async iterables that complete at
end-of-stream; `stream.first` is for a value that arrives once; `stream.open` is
synchronous and consumes nothing. Values are marshaled exactly like buffered
inputs — JSON deep copy, media as refs readable through `media.*`.

```js
// Running total, live, with a summary at the end.
let sum = 0;
for await (const n of stream("numbers")) {
  sum += n;
  await emit("running", sum);
}
await output("total", sum);
```

**The body decides the mode.** A body that mentions `stream` runs **once** for
the whole stream and pulls its own items; a body that never mentions it keeps
today's contract — one invocation per incoming item, with `inputs` holding that
item's snapshot. Nothing is configured: hydration re-reads the body each time
(`usesStreamInputContract`), so deleting the last `stream` call flips the node
back.

The split has three consequences worth knowing:

- **`inputs.<name>` in a streaming body carries the node's *configured*
  property values**, never per-item edge data. A connected handle is reachable
  only through `stream(name)`; reading one via `inputs.` is a validation error
  naming the call to use.
- **Outputs leave through `emit`/`output` only.** There is one invocation, so
  its return value is control flow. `output` finals post as one bag when the
  body ends; a body that throws mid-stream keeps what it already emitted and
  drops the finals.
- **`state` still exists and is pointless here.** One invocation means plain
  local variables already survive across items.

Waiting is not executing: time parked on a take is clock-suspended, so
`timeout` meters the body's own work and a slow upstream cannot kill a correct
consumer. What bounds the run is cancellation — a cancelled run unparks every
take as end-of-stream and the body unwinds. Backpressure is free in the other
direction too: the guest pulls, so an item the body has not asked for stays in
the kernel's inbox.

`run_code` and `test_code` take the same bodies: stage items with
`input_streams: {handle: [...]}` and the harness answers takes from them,
interleaving `stream.any()` round-robin by index across the handles you
declared. Design:
[code-node-input-streaming-design.md](code-node-input-streaming-design.md).

Node props map onto sandbox policy: `timeout` (seconds, 0 for none),
`max_response_mb`, `allow_local_network` → `limits.allowPrivateNetwork`,
`allow_host_filesystem` → `limits.filesystemAccess`, `secrets` →
`limits.secretScope`. Modules come from the body itself: the packs its static
imports name are resolved against the installed catalog. A pack no install
serves fails the node before the guest starts rather than surfacing as a
resolve error inside it; version or digest drift only warns on the node's log.

On a server host the node's code also gets the `nodetool` object model, backed
by the agent toolbelt. A JS script run uses that same belt, and one function
assembles it for both (`assembleSandboxToolbelt`). The belt is loaded
lazily and only on Node, since the in-browser runner bundles this module:
without one, `nodetool.capabilities()` reports `{}` and each method throws
naming the tool it needs instead of a `ReferenceError`. `run_code` stays
hermetic so an authoring probe does not get the belt.

It is not the chat belt: `ui_*` needs a browser, and a session can add tools of
its own. What it does carry is everything a chat action can reach on the
server, Apify and SerpAPI included — a call a chat made and a node then repeats
resolves to the same tool.

**Static checking.** `nodetool validate` parses each Code node body and reports
what a run would hit: invalid JavaScript, top-level `export`, an import no
installed pack serves, a bare read of a name that is neither a
sandbox API nor one of the node's own inputs (they live on `inputs`, so a bare
read is a `ReferenceError`), an `inputs.<name>` the node does not declare, an
`emit`/`output` call naming a handle the node does not declare, and a declared
handle no reachable call ever writes. The analysis lives
in `@nodetool-ai/node-sdk` (`code-analysis.ts`, `code-node-validation.ts`), so
the validator, the `submit_code` planner and the editor read one AST.

## Agents

### CodeAct: code as the action space

Every agent step acts by writing a program, not by emitting one JSON tool call.
The model sees a single provider tool, `execute_code({code})`; the program runs
in the sandbox with the step's toolbelt exposed as async functions, and one
round trip can chain, loop over, branch on and reduce any number of tool calls.
Design and the research behind it: [CodeAct design](codeact-design.md).

What an action gets on top of the standard surface:

- **`tools.<name>(args)`** — one wrapper per tool on the belt, generated by
  `TOOLS_PRELUDE` over a single `__callTool` bridge. A name the belt does not
  carry is a thrower that says so and points at `nodetool.searchTools`, rather
  than the `undefined` whose call reads as `TypeError: not a function`. A tool
  returning an
  `{error}` payload throws in the guest, so `try/catch` is the idiom. Each
  invocation surfaces to the host as a `tool_call_update` (id `codeact_<n>`), so
  composition inside one action stays observable.
- **`state`** — persists across the actions of a step, host-side, synced back
  after every run, including a run that throws. Assign generation results
  (`asset://` refs) to `state` immediately so a later failure does not re-run
  them. Handles from `image.*` / `audio.*` / `video.*` die between actions;
  convert with `nodetool.media.toImage` / `toAudio` / `toVideo` first.
- **`finish(result)`** — completes the step. For schema'd steps the host
  validates, and an invalid result throws in the guest with the violation list,
  so the same action can repair.
- **`nodetool.searchTools(query)`** — in-sandbox discovery for tools the prompt lists by
  name only, past the disclosure threshold. Deferred tools stay callable; the
  split spends prompt tokens, not capability.
- **`nodetool.packs`** — what this action may import: `list()` reports every
  installed pack and whether the session allows it, `modules(pack)` the
  specifiers it declares, `exports(specifier)` the function names one module
  exports, and `docs(specifier)` the pack's SKILL.md.
- **`nodetool.*`** — the platform as objects (`workflows`, `graph()`, `nodes`,
  `agents`, `models`, `media`, `assets`, `jobs`, `collections`, `web`, `memory`,
  and the rest), each method wrapping a belt tool. A method whose backing tool
  is absent throws naming it. `nodetool.media.understandVideo(video, prompt,
  model)` is the video half of the judging methods: it hands a whole clip to a
  model that reads video (Gemini) and answers `prompt` as `{text}`.
- **`nodetool.media.ffmpeg` / `ffprobe` / `downloadVideo`** — the host binaries.
  `ffprobe(path)` reads a file's format and streams; `ffmpeg(args)` takes argv,
  and that argv is bounded on the way out: every path is resolved against the
  workspace and refused when it lands outside (symlinks resolved), inputs may
  open local files only (`-protocol_whitelist file,crypto,data` before every
  `-i`, plus a token scan for `://`, `concat:`, `pipe:`, `/dev/…`), and the run
  is bounded on wall clock, captured output, artifact size, and how many host
  binaries may run at once. Fetch what you need with `downloadVideo` or
  `fetch`, then pass the local path. `downloadVideo` carries its own boundary:
  the URL must be public (loopback, link-local and the private ranges are
  refused, by literal and by DNS answer), the download is capped at 2 GiB, and
  the run ignores config files — yt-dlp reads `yt-dlp.conf` from its working
  directory, which is the workspace guest code writes, and that file can ask
  for `--exec`.
- **`openWorkflow(id)`** — when the belt carries the `ui_*` document tools, a
  graph object model whose synchronous mutators queue operations against a local
  mirror, replayed through the same tool contract by `await wf.commit()`.

The action inherits exactly the privileges tool mode already granted: every
`tools.*` function is a tool the model could have called directly, and per-step
allowlists stay a privilege boundary. What is genuinely new is composition —
one action can chain calls without per-call visibility in the provider
transcript — which the per-action tool-call cap, the `tool_call_update` events
and the action timeout bound.

### Package consent

A Code node runs a body a person saved; an action is code the model just
wrote. So an action imports only what the session allowed
(`sandboxPackages`), and the prompt advertises only those specifiers, one
sanitized line each, never the installed catalog. A session that allowed nothing
imports nothing, and an off-allowlist import stops the action before the guest
starts — the model sees the refusal as its observation and can correct it. A
session with packages also carries `get_sandbox_package_docs`, which serves one
pack's SKILL.md and wraps an untrusted pack's body in
`<untrusted-package-docs>`: reference, never instructions.

### The suspending clock

A chat action that calls a gated tool parks on a person's answer. Charged to the
same budget, that wait kills the program that asked, and answering then resolves
nothing. `createSandboxClock` gives the caller `clock.suspend()`: suspended time
is added back to `timeoutMs`, suspensions nest, and the engine's own abort moves
out to `timeoutMs + suspendAllowanceMs` as the backstop for a prompt nobody
answers. The interrupt handler still cuts a runaway loop at exactly `timeoutMs`
of running time. The websocket chat runner owns one clock per turn and suspends
it around every tool- and plan-approval round trip.

### Other agent surfaces

- **`validate_workflow`** evaluates a legacy graph DSL program (its `code`
  parameter) in the sandbox with *no* host access — only `node()` and `graph()`
  — so a malformed or hostile program cannot reach anything.
- **The plain `js` tool is gone.** `execute_code` is the one code path an agent
  *acts* through; it declares the session's sandbox packages. `run_code` remains
  as a hermetic authoring harness — it executes a Code-node body with no
  toolbelt and only the secrets the call names — and library-backed work outside
  an agent goes through a Code node that imports the pack.

## Failure modes

| Symptom | Cause |
|---|---|
| `url.searchParams.set()` does not affect the parent URL | QuickJS URL limitation. Build the query with `URLSearchParams` directly |
| A `Uint8Array` arrives as `{"0":137,…}` | A host → guest byte path that skipped the base64 marker convention |
| An `import` resolves nothing | The run declared no modules, or the specifier is off the allowlist |
| `setTimeout is not defined` | Deleted deliberately. Use `sleep`, `Promise.all` or `parallelMap` |
| A bare identifier is a `ReferenceError` in a Code node | Node inputs live on `inputs`, not in the global scope |
| `nodetool.*` throws naming a tool | The host has no toolbelt (browser runner, no context) or that tool is not on the belt |
| `tools.<name> is not on this toolbelt` | This host's belt has no such tool. `nodetool.searchTools(name)` lists what it does have; `ui_*` is browser-only and never on a Code node's belt |
| A Code node has an empty `nodetool.capabilities()` and cannot import `@nodetool-ai/sandbox-nodetool/*` | The host never called `setCodeNodeAgentsModule`. The node resolves `@nodetool-ai/agents` by bare specifier, which resolves in a checkout and nowhere in the bundled backend (esbuild inlines the workspace packages into `server.mjs`); `packages/websocket/src/server.ts` hands over the inlined copy at bootstrap |
| A CPU-bound loop outlives its cancellation | The signal ends `runInSandbox`, but the guest loop still runs to the execution timeout |

## Extending it

- **A new bridge**: add it in `buildSandbox`, wrap async work in `neverReject` +
  `guardAbort`, return bytes as a base64 marker object, add the name to
  `EXPOSED_BRIDGE_NAMES`, and describe it in
  `packages/agents/src/code-gen/sandbox-manifest.ts`. The manifest reads limits
  and names out of `js-sandbox.ts` rather than restating them, so a prompt
  derived from it cannot advertise an API the sandbox does not marshal —
  `tests/sandbox-manifest-drift.test.ts` holds that line.
- **A new library**: ship a sandbox pack. Guest-side if it compiles under the
  admission probe, host-side if it needs Node builtins, a DOM, or a limit the
  guest could not enforce. Host implementations live in
  `packages/agents/src/host-modules/` with every safety limit inside them, where
  nothing can route around them.

Tests: `packages/agents/tests/js-sandbox.test.ts` (surface, limits, async
concurrency), `js-sandbox-modules.test.ts`, `js-sandbox-wasm.test.ts`,
`host-modules.test.ts`, `codeact-executor.test.ts`, `chat-codeact.test.ts`,
`nodetool-api*.test.ts`, and `packages/sandbox-compiler/tests/packs.test.ts` for
every shipped pack through the real install path.

## Related

- [CodeAct design](codeact-design.md) — the action protocol and its research
- [Sandbox packages](sandbox-package-design.md) — the pack system, trust model, milestones
- [Chat &amp; Agents](global-chat-agents.md) — the agent surfaces whose actions run here
- [Execution strategies](execution-strategies.md) — where sandboxed work sits among the run modes
