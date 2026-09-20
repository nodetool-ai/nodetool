---
name: nodetool-js-scripting
description: "Write JavaScript that runs in NodeTool's QuickJS sandbox: Code node bodies, saved JS script documents, sandbox package imports, and calling nodes from code."
---

# Write NodeTool sandbox JavaScript

Three places take the same guest JavaScript, with the same globals, the same
imports and the same limits.

| Where | What it is | Reach it with |
|---|---|---|
| **Code node** | A body inside a workflow graph | `validate_code`, `run_code`, `test_code` |
| **JS script document** | A named, versioned script with declared ports, secrets, a timeout and saved tests | `list_js_scripts`, `get_js_script`, `save_js_script`, `validate_js_script`, `run_js_script`, `test_js_script` |
| **Native flow** | Guest code calling nodes as async functions, no graph | `import "@nodetool-ai/sandbox-nodetool/flow"` |

Pick a Code node when the logic belongs to one graph. Pick a script document
when the same logic is called from several places, needs its own tests, or needs
version history. Pick native flow when the control flow is easier to write than
to wire.

## The body contract

```js
// inputs: { rows: [...], threshold: 10 }
const kept = inputs.rows.filter((r) => r.score > inputs.threshold);
progress(50, `kept ${kept.length}`);
for (const row of kept) await emit("row", row);   // streams as it goes
await output("count", kept.length);               // final, posted at the end
```

- **Inputs arrive on the `inputs` object**, never as globals of their own name.
  Values are deep-copied through JSON before entering the guest.
- **Outputs leave through `await output(name, value)` and `await emit(name,
  value)`, and nothing else.** `name` must be a declared output handle. A second
  `output` on the same handle throws. `return` is ordinary control flow and its
  value is ignored. For a script document this is enforced: a body that declares
  outputs and returns them instead of emitting them is an **error**, because a
  script has no legacy return contract. A Code node still accepts the old
  return/yield contract for one more release, with a deprecation warning.
- **Media inputs arrive as refs.** Read one with `media.bytes` / `media.text` /
  `media.info`, and build one with `media.toDocument` / `toImage` / `toAudio` /
  `toVideo`. Pass the whole input object, not its `uri`, so the ref's own type
  travels with it. Every `media.*` call is async.
- **`stream` is the input side of `emit`.** A body that mentions `stream` runs
  **once** over the whole stream and pulls its own items. A body that never
  mentions it runs once per incoming item. Nothing is configured: deleting the
  last `stream` call flips the node back.

```js
for await (const item of stream(name))            // one handle, in order, until EOS
for await (const [handle, item] of stream.any())  // every handle, arrival order
const item = await stream.first(name)             // next value, undefined at EOS
stream.open(name)                                 // could more still arrive?
```

- **`state`** survives across streaming invocations and resets at each run.
- **`progress(percent, message)`** drives the node's progress bar.

## Capabilities are globals, libraries are imports

Globals need no declaration: `console`, `fetch`, `workspace`, `getSecret`,
`nodetool.secrets.*`, `sleep`, `crypto`, `format`, `image`, `audio`, `video`,
`media`, `canvas`, `assetToSandbox` / `sandboxToAsset`, `progress`, `emit` /
`output`, and the pure helpers `toBase64` / `fromBase64` / `toHex` / `fromHex` /
`parallelMap`. `media.*` and `workspace.*` need a `ProcessingContext`, so they
throw in a bare sandbox call with no run behind it.

Everything else is a **sandbox package** the body imports:

```js
import yaml from "@nodetool-ai/sandbox-yaml";
```

Discover them with `list_sandbox_packages` and read one's API with
`get_sandbox_package_docs`. Do not guess a specifier: a pack this host does not
carry fails validation with "Install `<pack>`". `npm run dev:nodetool -- packs
compile` builds one for a dependency that is not shipped.

`image.*`, `audio.*` and `video.*` transforms return a `sandbox://media/<id>`
handle, not bytes. Chain the calls, then `<type>.toAsset(handle)` before the run
ends. A handle does not survive into a later run.

## Calling nodes from code

```js
import "@nodetool-ai/sandbox-nodetool/flow";   // mounts the bridge, required
import { concat } from "@nodetool-ai/sandbox-flow/nodetool.text";

const r = await concat({ a: inputs.left, b: inputs.right });
await output("joined", r.output);
```

`await` is the edge, a variable is the wire, `Promise.all` is the fan-out. Both
imports are required: the facade does not mount without the capability module.
Streaming-output nodes carry `.stream(inputs)`, an async iterable where an early
`break` closes the stream and runs node cleanup. Every call passes the per-call
permission gate and bills through the invoking run, bounded by a recursion depth
cap of 4 and 16 concurrently open streams per run. Streaming *inputs* accept
arrays only in v1.

A program that must open in the editor, be validated, or run on the server still
builds a graph. Use [nodetool-workflow-builder](../nodetool-workflow-builder/SKILL.md)
for that.

## The loop

1. **Write or read the body.** `get_js_script` for a saved script.
2. **`validate_code` / `validate_js_script` after every edit.** It catches
   syntax, imports against the installed catalog, undefined names, undeclared
   `inputs.*` reads, outputs no `emit`/`output` call reaches, duplicate or
   non-identifier port names, and tests naming ports the script does not
   declare. It is far cheaper than running.
3. **`run_code` / `run_js_script`** with real inputs. `output` values come back
   as `outputs`, `emit` values as `streamed`, an ordered list of `{name, value}`.
   Stage a streamed input with `input_streams`, keyed by handle.
4. **`test_code` / `test_js_script`** as the regression check. A case supplies
   `inputs` (or `input_streams`) and optionally `expect` — final values per
   handle, compared structurally, with unnamed outputs ignored, and
   `expected_streamed`, the full ordered emit list. A case with neither passes
   when the body runs without error.
5. **Save.** `save_js_script` validates first and is CAS on update.

Script documents get the same version family as the other documents:
`list_js_script_versions`, `get_js_script_version`, `create_js_script_version`,
`restore_js_script_version`, `delete_js_script_version`.

## Secrets and limits

Read a credential with `nodetool.secrets.get(name)` — never inline one, and
never write one into a body or a test case. A script's declared secrets are
intersected with whatever allowance the invoking context carries. There is no
`set_secret`: `request_secret` asks the user's own client for one and the value
never enters the guest, the transcript, or the model's context. A headless run
carries no secret prompt, so the call is refused by name rather than quietly
writing something nobody approved.

Script composition is bounded like sub-agents: depth cap 4 with a script id
chain, so a cycle fails the call naming it. Execution time defaults to 30s and
every limit is overridable per invocation and clamped to a ceiling.

## Verify from a shell

```bash
npm run dev:nodetool -- jsscript validate <id|file.json> --json
npm run dev:nodetool -- jsscript run <id|file.json> --inputs '{"numbers":[1,2,3]}'
npm run dev:nodetool -- jsscript run <id|file.json> --input-streams '{"numbers":[1,2,3]}'
npm run dev:nodetool -- jsscript test <id|file.json> --json
npm run dev:nodetool -- jsscript versions list|show|create|restore|delete <id>
```

A path that exists on disk wins over an id, and a file target needs no database.
`jsscript test` exits non-zero on any failure and is the keyless selfcheck the
harness gate runs.

## Reference

- [docs/javascript-sandbox.md](../../../docs/javascript-sandbox.md) — the guest
  surface, marshaling, limits, concurrency and the security model.
- [docs/js-script-document-design.md](../../../docs/js-script-document-design.md)
  — document shape, storage, invocation from agents, Code nodes and mini apps.
- [docs/harnesses.md § nodetool jsscript](../../../docs/harnesses.md#nodetool-jsscript-js-script-harness)
- [packages/sandbox-packs/README.md](../../../packages/sandbox-packs/README.md)
