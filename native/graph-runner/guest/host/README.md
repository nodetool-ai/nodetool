# Guest-side host capability wrappers

Each file here is the guest half of one host capability in `src/host/`, or a
module built on them. It calls `globalThis.__host.<name>.<function>` and
exposes the API that node code expects. The [module contract](#the-module-contract)
maps the module specifiers node code imports onto these files, in every build
profile.

| File | Stands in for | Capability |
|---|---|---|
| `sqlite.mjs`, `sqlite-vec.mjs` | `better-sqlite3`, `sqlite-vec` | `sqlite` |
| `fs.mjs`, `fs-promises.mjs` | `node:fs`, `node:fs/promises` | `files` |
| `path.mjs`, `os.mjs`, `url.mjs` | `node:path`, `node:os`, `node:url` | `files` (working directory) |
| `workspace.mjs` | `context.workspace` | `files` |
| `storage.mjs` | `@nodetool-ai/storage` | `assets` |
| `context.mjs`, `context-services.mjs` | `ProcessingContext`, partly through the runtime's shared context modules (`node-context/`) | `files`, `assets`, `packageAssets`, `secrets`, `http`, `providers` |
| `fake-providers.mjs` | the provider resolver of `createFakeContext` | `providers` |
| `media-fetch.mjs` | the runtime's `external-media-fetch.js` | `http` |
| `runtime.mjs` | `@nodetool-ai/runtime` and its subpaths | through the modules above |
| `output.mjs` | `OutputNode.process` for media values | through the context |

`guest-real:<specifier>` imports a real package module, also a `dist/` file
the package does not export. These files use it to take pure functions from
the packages instead of copying them. A capability the host did not grant
fails as Node would: `EACCES` for a path, `null` for a secret or asset, an
error for a fetch.

## The module contract

[`guest/module-contract.mjs`](../module-contract.mjs) declares every
specifier node code may import from the packages the host provides:
`@nodetool-ai/runtime` and its subpaths, `@nodetool-ai/storage`,
`@nodetool-ai/config`, `@nodetool-ai/kernel`, the Node builtins, the packages a
capability provides (`@nodetool-ai/agents`, `better-sqlite3`, `sqlite-vec`,
`file-type`, `@napi-rs/canvas`, `@nodetool-ai/gpu/node`) and the native
packages QuickJS cannot load (`sharp`, `playwright`, `@hyzyla/pdfium` and
others). Each record names its provider file and classifies every export
bundled code imports from it:

| Kind | Meaning | Names |
|---|---|---|
| `guest` | The real package code, bundled through `guest-real:` or the normal resolution. | the module it comes from |
| `guest-impl` | A hand-written guest module. | the file, relative to `guest/` |
| `host` | Forwards to C++ host operations through `media-native.mjs`. | each `__host.<ns>.<op>` it calls |
| `unavailable` | Not provided. | a reason and a note |

The reasons are `server-only` (a NodeTool server service, process or
account), `python` (the Python bridge), `host-binary` (a host program),
`native-addon` (a native addon or WebAssembly module), `kernel` (the
TypeScript workflow kernel, which the C++ kernel replaces) and
`not-yet-ported` (no guest implementation yet). A record with `whole` marks every export of a
package unavailable, and `rest` classifies the exports a record does not
list, for code that uses the module as a whole.

`guest/module-contract-build.mjs` applies the table in `guest/build.mjs`. A
`wrap` record resolves straight to its provider. Any other record becomes a
generated stub with every export of the real package: an export the provider
has comes from it, and any other throws when called or read, for example
"guest: @nodetool-ai/runtime.executeComfy is unavailable in the native runner
(server-only: talks to a ComfyUI server)". The default and parity profiles
share these stubs. The core profile resolves a record to its provider, where
a missing name reads as undefined.

After bundling, the build checks the table against the bundle and fails when
they disagree:

- Bundled code imports a name the table does not classify, or a specifier it
  does not declare. Names come from the bundle: esbuild's metafile lists the
  files and how each import resolved, and `guest/contract-analysis.mjs` reads
  the names from each file's source: static imports, `export ... from`,
  namespace member reads, and `import()` or `require()` results that are
  destructured or read by member.
- An available entry's provider, source module or file does not export the
  name, or a `host` entry's function calls other host operations.
- An `unavailable` entry is provided after all, or the real package does not
  export it.
- In a build of every node module, no bundled code imports an entry.

To add an entry after such a failure, put the name under its specifier in
`module-contract.mjs`. Use `guest` when `host/runtime.mjs` (or the record's
provider) re-exports the real function, `guest-impl` when a file here
implements it, and `host` when `media-native.mjs` forwards it. Otherwise
classify it `unavailable` with the reason and a note that says what it needs.
A new specifier needs a new record.

### Node requirements

The build also writes `<bundle>.node-requirements.json` next to the bundle,
`{ "<node type>": [{ "spec", "name", "reason", "note" }] }`, and embeds the
same object as the module `nodetool:node-requirements`. It lists the
`unavailable` exports each node type's code reaches. `contract-analysis.mjs`
starts at the class with a literal `static nodeType`, or at the descriptor
object a node factory receives, and follows every identifier that names a
top-level declaration into the declaring file, through imports and
re-exports. Top-level statements that are not declarations, such as decorator
calls, belong to no node. The result over-approximates: a condition around a
call is not evaluated, and a local variable that shadows a top-level name
counts as a use. A whole-module use of a record with `rest` is not counted.
`NODE_EXCEPTIONS` in the table lists the node types and exports the native
runner does not reach in practice, such as the Subgraph body the C++ kernel
replaces. The build fails when an exception no longer matches.

`guest/entry.mjs` reports each node with requirements as a validation issue,
so the runner fails the job before any node starts and names the node, the
export and the reason. `describe` returns them as `requires`, and
`GraphRunner` leaves those types out of `supportedNodeTypes()`, so
`canRun()` is false and the node editor sends such a graph to the server.
Each file here is the guest half of one host capability in `src/host/`. It
calls `globalThis.__host.<name>.<function>` and exposes the API that node code
expects, for example the functions a node imports from `@nodetool-ai/runtime`.
`guest/build.mjs` maps those module specifiers onto these files. A wrapper
throws an error naming the missing capability when the host did not grant it.

| File | Capability | Provides |
|---|---|---|
| `process.mjs` | `process` (`src/host/process.cpp`) | the `process` and `node:process` modules |
| `timers.mjs` | `timers` (`src/host/timers.cpp`) | `setTimeout`, `setInterval`, `setImmediate` and their clear functions, installed as globals by `guest/env/index.mjs` and as the `timers` module |

Globals that need no host, such as `Intl` and `structuredClone`, live in
`guest/env/`.
| File | Capability | Replaces |
|---|---|---|
| `gpu.mjs` | `gpu` (`src/host/gpu.cpp`) | `runShaderNode`, `runRecipeNode` (image-nodes `lib-shader-utils`), `getGpuContext`, `readbackTextureRef`, `releaseRunTextures` (`gpu-device`) |
| `image.mjs` | `image` (`src/host/image.cpp`) | `loadImageBytes`, `decodeRgba`, `imageDimensions`, `encodeRgbaToPng`, `encodePngFromRef`, `resolveImageRefForTransport` (image-nodes `image-io`) |

Two build-time files support them:

- `plugins.mjs` holds the esbuild plugins `guest/build.mjs` puts ahead of every
  profile. An import of `./lib-shader-utils.js`, `./gpu-device.js` or
  `./image-io.js` from inside `@nodetool-ai/image-nodes` resolves to a wrapper
  that re-exports the real module and takes the functions above from
  `gpu.mjs` or `image.mjs`. Everything else in those modules stays real.
- `gpu-catalog.mjs` exports the shader catalog of `@nodetool-ai/gpu` as JSON,
  in Node, from the real registry: the WGSL `tgpu.resolve` produced, entry
  points, workgroup sizes, the bind group layout typegpu builds, sampler
  descriptors, the uniform struct layout with the defaults typegpu packs, and
  the recipe pass graphs. `plugins.mjs` embeds it in the bundle as
  `nodetool:gpu-catalog`, and `gpu.mjs` hands it to `__host.gpu.init` on first
  use. `node guest/host/gpu-catalog.mjs <file>` writes it for the C++ tests.

`encodedImageBytes` in `gpu.mjs` is the one loader for encoded input images:
inline bytes, base64 `data`, and `data:` URIs. Every other reference
(`asset://`, storage keys, files, http) goes to `loadMediaRefBytes` from
`@nodetool-ai/runtime/media-ref-bytes`, which the media capability provides.
