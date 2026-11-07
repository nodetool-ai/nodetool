# Guest-side host capability wrappers

Each file here is the guest half of one host capability in `src/host/`, or a
module built on them. It calls `globalThis.__host.<name>.<function>` and
exposes the API that node code expects. `guest/host-modules.mjs` maps the
module specifiers node code imports onto these files, in both build profiles.

| File | Stands in for | Capability |
|---|---|---|
| `sqlite.mjs`, `sqlite-vec.mjs` | `better-sqlite3`, `sqlite-vec` | `sqlite` |
| `fs.mjs`, `fs-promises.mjs` | `node:fs`, `node:fs/promises` | `files` |
| `path.mjs`, `os.mjs`, `url.mjs` | `node:path`, `node:os`, `node:url` | `files` (working directory) |
| `workspace.mjs` | `context.workspace` | `files` |
| `storage.mjs` | `@nodetool-ai/storage` | `assets` |
| `context.mjs` | `ProcessingContext` | `files`, `assets`, `secrets`, `http` |
| `media-fetch.mjs` | the runtime's `external-media-fetch.js` | `http` |
| `runtime.mjs` | `@nodetool-ai/runtime` and its subpaths | through the modules above |
| `output.mjs` | `OutputNode.process` for media values | through the context |

`guest-real:<specifier>` imports a real package module, also a `dist/` file
the package does not export. These files use it to take pure functions from
the packages instead of copying them. An export the guest lacks is absent
(default profile) or a stub that throws an error naming it (parity profile).
A capability the host did not grant fails as Node would: `EACCES` for a path,
`null` for a secret or asset, an error for a fetch.

SQLite aliases are registered in `modules.mjs` before other shims.
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
