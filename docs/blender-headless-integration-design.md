# Blender Headless Integration — Design

Status: Stages 0–3 implemented, revised after review. Stage 4 (worker
tier) is not started. The implementation lives in `packages/blender-nodes`
(TypeScript: binary discovery, job contract, `LocalBlenderRunner`,
`runBlenderJob`, the five nodes) and `packages/blender-nodes/blender_ops`
(the Python op scripts each node runs headless).

## Summary

Blender runs as a headless processor over the glTF document NodeTool already
has. A new `packages/blender-nodes` package ships `nodetool.blender.*` nodes
that take a `Model3DRef` and return an image, a video, a model, or an exported
file. Every node builds a JSON job and hands it, with its input bytes, to a
`BlenderRunner` that works on logical file names only. The local runner owns a
scratch directory and spawns `blender -b --python` on a vendored Python op
script through the bounded host binary runner ffmpeg already uses. The worker
runner, a later stage, sends the same job and bytes as bridge blobs to a GPU
worker, the way the ComfyUI worker works. Nodes never know which tier ran
them, and the local tier is hardened but not sandboxed: the worker is where an
isolation boundary exists.

## Goals

- Render a glTF scene to a still, to render passes (depth, normal, mask), and
  to an animation, at a quality the three.js preview renderer cannot reach.
- Prepare a generated mesh for a game engine: remesh, decimate, unwrap, bake,
  export FBX, OBJ, USD, or GLB.
- Feed video models with camera-consistent frames and control passes from the
  same scene.
- Keep the existing 3D editor, `ui_3d_*` tools, and `model3d` agent
  capability working on the same asset before and after a Blender step.
- Fail with a message that names the fix when Blender is missing, too old, or
  the scene cannot be imported.

## Non-goals

- A Blender scene editor in the web app. The document stays glTF and the
  existing editor stays the editor.
- Arbitrary user Python inside Blender in the first release. A gated
  `RunScript` node is listed under alternatives, not in scope.
- Bundling Blender into the Electron installer or the Fly server image.
- Simulation, physics, geometry nodes, and rigging. The op catalog can grow,
  but none of these are in the stages below.
- Background jobs with a ledger row. Long renders stay synchronous under the
  node's timeout until the worker tier exists.

## Current State

### The 3D document and its nodes

- `packages/model3d` is the scene document: glTF 2.0, `parseModel3D`,
  `serializeModel3D`, the `Model3DOperation` union, `validateModel3D`.
  `Model3DRef` is `{ type: "model_3d", uri, asset_id?, temp_id? }` in
  `packages/protocol/src/api-types.ts`. It has no `format` field. Node code
  reads the looser `Model3DRefLike` with `data`, `format`, `vertices`, `faces`
  (`packages/video-nodes/src/nodes/model3d/types.ts`), and `format` does not
  survive a crossing into the protocol type. The generic stored-file type is
  `AssetRef` (`type: "asset"`, `uri`, `asset_id`, `metadata`).
- `packages/video-nodes/src/nodes/model3d/` ships 18 `nodetool.model3d.*`
  nodes: load and save, `FormatConverter`, `Transform3D`, `Decimate`,
  `Boolean3D`, `RepairMesh`, `MergeMeshes`, `TextTo3D`, `ImageTo3D`, and
  `RenderToImage`. They are pure TypeScript over `@gltf-transform/core`,
  `manifold-3d`, and `meshoptimizer`.
- `RenderToImage` launches headless Chromium over CDP with SwiftShader and
  renders through three.js (`render3d-headless.ts`). It produces previews:
  one still, preset lighting, no animation, no shadows of quality, no passes.
- `packages/agents/src/capabilities/model3d.ts` exposes `list_model3ds`,
  `create_model3d`, `get_model3d`, `edit_model3d`, `validate_model3d`. They
  apply `Model3DOperation`s to the asset bytes headlessly.

### Host binaries

- `packages/agents/src/host-binaries.ts` owns `runHostBinary(cmd, args,
  { cwd, timeoutMs, artifactPath?, maxArtifactBytes? })`. It spawns without a
  shell, bounds wall clock (SIGTERM then SIGKILL), captured output
  (`MAX_CAPTURED_BYTES`), artifact size, and concurrency
  (`maxConcurrentHostBinaries`, env `NODETOOL_HOST_BINARY_CONCURRENCY`). A
  missing binary is `HostBinaryMissingError`. `host-binary-guard.ts` confines
  model-authored argv to the workspace.
- `@nodetool-ai/agents` depends on `@nodetool-ai/video-nodes`, so a node
  package cannot import `runHostBinary` today without a dependency cycle.
- Files reach a binary through `Workspace` (`packages/runtime/src/workspace.ts`):
  `materialize`, `absorb`, `scratchDir`, and `localDir`, which is null on a
  cloud workspace.
- `ProcessingContext.signal` is the run-level `AbortSignal` the kernel aborts
  on `WorkflowRunner.cancel()`.

### Remote tools

- `createPythonBridge` (`packages/runtime/src/python-bridge-factory.ts`)
  returns a websocket bridge when `NODETOOL_WORKER_URL` is set and a stdio
  bridge otherwise. The stdio bridge refuses to run in production.
- The ComfyUI worker image co-locates a loopback-only ComfyUI and proxies it
  over `comfy.execute` and `comfy.event` frames
  (`packages/protocol/src/bridge-frames.ts`, `packages/runtime/src/comfy-executor.ts`).
  Media inputs travel as bridge blobs. `packages/compute` provisions and reaps
  such workers on RunPod and Vast.

### Distribution

- The Fly image (`Dockerfile`, `node:22-slim`) installs ffmpeg, chromium,
  pandoc, and a Python venv. Blender is not there.
- Electron installs tools on demand through `CondaRuntimePackage`
  (`electron/src/runtime/packages/definitions.ts`). conda-forge has no
  `blender` package, so that path is closed for the executable. PyPI ships
  `bpy` wheels pinned to one Python minor per release.
- Package runtime files are declared in `PACKAGE_RUNTIME_ASSETS` and
  `PACKAGE_RUNTIME_ASSET_DIRS` (`packages/config/src/package-asset-registry.ts`)
  so the Electron bundle stages them.

### Harness

- `packages/cli/src/harness/registry.ts` maps diff paths to surfaces and
  checks. `capability-table.ts` is generated by `npm run capabilities:sync`
  and fails `capabilities:check` on an uncovered capability.

## Affected components

- `packages/agents/src/host-binaries.ts` moves to `packages/runtime`.
- New `packages/blender-nodes`.
- `packages/base-nodes/src/index.ts` registers the new node array.
- `packages/config/src/package-asset-registry.ts` declares the op script
  directory.
- `packages/agents/src/capabilities/model3d.ts` gains `render_model3d`.
- `packages/cli/src/harness/registry.ts` gains a `blender` surface.
- `packages/protocol/src/bridge-frames.ts` and `packages/runtime` gain
  `blender.execute` in the worker stage.
- `electron/` gains a Blender path setting, and `start.sh doctor` a Blender
  line, in Stage 1.

## Assumptions

- A1. Blender 5.2 LTS is the floor. The glTF importer and exporter are core
  add-ons enabled under `--factory-startup`. EEVEE Next and Cycles both
  render headless on CPU with no display.
- Revision (Stage 3): the floor moved from 4.2 LTS to 5.2 LTS. Nothing ever
  ran on 4.2: `render_passes.py` reads `scene.compositing_node_group` (the
  5.x compositor entry point; 4.2 has only the legacy `use_nodes`/`node_tree`
  pair) and `render_animation.py` sets `image_settings.media_type` (the 5.x
  image/video split; 4.2 exposes `file_format` directly). On a 4.2 binary
  both ops raise `AttributeError`, so the old floor promised what the code
  could not do. A 4.2 backport would need the compositor tree rebuilt on the
  legacy `Scene.node_tree` API and the animation output set through
  `file_format = "FFMPEG"` with no `media_type` flip — untested here, since
  the only binary available is 5.2 LTS.
- A2. Desktop users who want Blender nodes install Blender themselves. The
  node discovers it. This holds until a first-use download exists.
- A3. The Python worker image is built outside this repository. Stage 4 here
  covers the protocol and the TypeScript client only.
- A4. Cycles on CPU is minutes per frame at production samples. Stills at
  preview samples and EEVEE animations are seconds to a minute.

## Unclear or conflicting requirements

- U1. Explainer animation needs authored camera paths and text objects. The
  `Model3DOperation` union has no camera or text primitive. This design adds
  camera presets on the render node and defers scene-side camera authoring.
  If explainers need per-shot camera keyframes soon, `add_object` needs a
  `camera` kind and `set_transform` needs keyframes, which is a change to
  `packages/model3d`, not to this package.
- U2. Cloud profile. On Fly there is no Blender and no worker by default. The
  nodes are excluded from the cloud profile until the worker stage ships
  (D8), so a cloud user never sees a node that cannot run.

## Proposed Design

### D1. One package, one namespace

`packages/blender-nodes` (`@nodetool-ai/blender-nodes`), node types
`nodetool.blender.*`. Dependencies: `node-sdk`, `runtime`, `protocol`,
`config`, `nodes-utils`. Layout mirrors `video-nodes`: `src/nodes/*.ts`, a
`BLENDER_NODES` array, `tests/`, and the `./nodes/*` subpath export so
`base-nodes` imports the array. The Python op script lives at
`packages/blender-nodes/blender_ops/` next to the sources.

A new package rather than a subdirectory of `video-nodes` because the op
script is a runtime asset directory with its own staging rule, and because a
cloud profile allowlists by namespace.

### D2. `runHostBinary` moves to runtime

`packages/agents/src/host-binaries.ts` moves to
`packages/runtime/src/host-binaries.ts` with the same exports.
`@nodetool-ai/agents` re-exports it so `media.ts` and its tests change only
their import path. `host-binary-guard.ts` stays in agents. It confines argv a
model wrote. Blender argv is built by the node from typed props, and every
path in it is a file the node itself wrote into the scratch directory.

`RunHostBinaryOptions` gains four optional fields. `signal?: AbortSignal`:
on abort the runner sends SIGTERM and follows the existing SIGKILL path.
`env?: Record<string, string>`: the child's whole environment when set,
instead of `process.env`. `onStderrLine?: (line: string) => void`: fed from
the same stream the capture reads. `concurrencyClass?: string`: selects the
semaphore. The default class keeps today's `NODETOOL_HOST_BINARY_CONCURRENCY`
cap for ffmpeg and yt-dlp. A `render` class is capped by
`NODETOOL_BLENDER_CONCURRENCY`, default 1, so a two-minute Cycles render never
holds a slot a two-second ffmpeg call is waiting for. Existing callers pass
none of the four and see no change.

### D3. Binary discovery

`packages/blender-nodes/src/blender-binary.ts`:

```ts
export interface BlenderBinary {
  path: string;
  version: [number, number, number];
}

export async function resolveBlenderBinary(): Promise<BlenderBinary>;
```

Order: `BLENDER_PATH`, then `blender` on PATH, then well-known locations
(`/Applications/Blender.app/Contents/MacOS/Blender`, `/usr/bin/blender`,
`/snap/bin/blender`, `%ProgramFiles%\Blender Foundation\Blender *\blender.exe`).
The first candidate that runs `--version` wins. Below 5.2 throws
`BlenderVersionError` naming the found version and the floor. No candidate
throws `HostBinaryMissingError("blender")`. The result is cached per process
and invalidated when `BLENDER_PATH` changes.

### D4. The job contract

Every node produces a `BlenderJob`. The Python side consumes it and writes a
`BlenderResult`. Both are versioned so the TypeScript and Python halves can
drift by one version during an upgrade. The job names every file on both
sides. The result never names a file: it reports which declared outputs were
produced, and the host reads only the paths the job itself declared. This is
the invariant that keeps a buggy or compromised op script from turning result
processing into an arbitrary file read, and T2 tests it.

```ts
// packages/blender-nodes/src/job.ts
export const BLENDER_JOB_VERSION = 1;

export type BlenderOp =
  | { op: "render_image"; params: RenderImageParams }
  | { op: "render_passes"; params: RenderPassesParams }
  | { op: "render_animation"; params: RenderAnimationParams }
  | { op: "prepare_for_engine"; params: PrepareForEngineParams }
  | { op: "export_model"; params: ExportModelParams };

/** A bare file name: no separator, no `..`, no leading dot. */
export const jobFileNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export interface BlenderJob {
  version: typeof BLENDER_JOB_VERSION;
  /** Logical input name -> bare file name. The runner writes these. */
  inputs: { model: string };
  /** Logical output name -> bare file name the op must write. */
  outputs: Record<string, string>;
  job: BlenderOp;
}

export const blenderResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    /** Logical output names the op wrote. Must be a subset of job.outputs. */
    produced: z.array(z.string()),
    stats: z.object({
      blender_version: z.string(),
      render_seconds: z.number(),
      frames: z.number().int().optional(),
      objects: z.number().int().optional()
    })
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum([
        "import_failed", "no_geometry", "unsupported_format",
        "render_failed", "export_failed", "bad_job"
      ]),
      message: z.string()
    })
  })
]);
```

Camera params reuse the `RenderToImage` vocabulary so a user can swap the
preview node for the Blender node without relearning: `azimuth`, `elevation`,
`fov`, `zoom`, `lighting`, `light_intensity`, `background_color`,
`transparent`. Blender-specific additions: `engine` (`eevee` | `cycles`),
`samples`, `denoise`, `resolution_percentage`.

`camera_mode` decides whose camera renders, because the orbit props always
carry a default and a default cannot signal intent:

| `camera_mode` | Behavior |
|---|---|
| `auto` (default) | The scene's first camera when the glTF carries one, else an orbit camera from the props. |
| `scene` | The scene's first camera. No camera is `no_camera`, an error. |
| `orbit` | Always an orbit camera from the props. The scene's cameras are ignored. |

Lights follow the same rule without a switch: the scene's lights when it has
any, else the `lighting` preset. A test pins each branch.

Output contracts the ops must honor:

- `depth`: linear distance along the camera's view axis, in scene units, from
  the Z pass. `depth_format` is `png16` (default) or `exr`. In `png16` the
  value is normalized to `[0, 65535]` between `depth_near` and `depth_far`,
  the min and max finite depth in the frame, both returned as floats, and
  background pixels are `65535`. In `exr` the value is the raw float, and
  background is `+inf`, as Blender writes it. Control-pass consumers get
  `png16`. Anything that needs precision gets `exr`.
- `normal`: camera-space normals from the Normal pass, mapped from `[-1, 1]`
  to 8-bit RGB. Background is `(128, 128, 255)`.
- `mask`: 8-bit alpha of the object index pass, foreground `255`.
  The pass is enabled before the Render Layers node is created (measured
  5.2.1: Cycles then lists Image/Alpha/Depth/Object Index/Noisy Image) and
  every mesh renders with object index 1, so the mask keys on a positive
  index with background 0.
  Deviation (recorded, not silent, EEVEE only): EEVEE's
  `CompositorNodeRLayers` exposes no index socket (measured 5.2.1: only
  Image/Alpha/Depth appear with `use_pass_object_index` on), so EEVEE keys
  the mask on finite Z instead. The gate agrees with the index pass on
  opaque geometry and disagrees for alpha-blended, holdout, and volume
  materials. EEVEE's no-hit Z value `1e10` is a measured EEVEE behavior on
  5.2.1, not a documented API value: re-measure it if the version floor
  moves.
- `render_animation`: the scene fps is set to `fps`. A glTF animation
  channel's timestamp `t` seconds lands on frame `round(t * fps)`.
  `frame_start` and `frame_end` are frames in that timeline. When the glTF has
  no animation and `camera_mode` is `orbit`, the orbit turns `orbit_degrees`
  across the frame range.

### D5. The op script

`packages/blender-nodes/blender_ops/run_job.py` plus one module per op.
Declared in `PACKAGE_RUNTIME_ASSET_DIRS` as
`{ pkg: "@nodetool-ai/blender-nodes", path: "blender_ops", bundleDir: "_blender_ops", files: [...] }`
with every file named, so an unstaged module fails the bundle verifier
instead of the product.

Invocation, built by `LocalBlenderRunner`:

```
blender -b --factory-startup --disable-autoexec \
  --python-exit-code 64 --python <asset_dir>/run_job.py -- job.json
```

`run_job.py` reads `job.json`, dispatches on `job.op`, and always writes
`result.json`, including on exception (`ok: false`, code from the exception
class, message from the exception). It sets `sys.excepthook` before importing
op modules so an import error also lands in `result.json`. Exit code 64 is
reserved for "the script raised", distinct from Blender's own crash codes.

Scene setup is the same for every render op: `bpy.ops.wm.read_factory_settings(use_empty=True)`,
`bpy.ops.import_scene.gltf(filepath=inputs.model)`, then the camera
`camera_mode` selects (D4). An orbit camera is placed by the same
auto-framing math `render3d-core.ts` uses (`computeFraming`, `orbitOffset`),
ported once into `blender_ops/framing.py` and pinned by a fixture test on both
sides (T3).

Video output for `render_animation` uses Blender's own FFMPEG writer
(`image_settings.file_format = "FFMPEG"`, MPEG-4 container, H.264, `yuv420p`),
so the package needs no ffmpeg on PATH and no Mediabunny dependency.

### D6. The runner interface and `runBlenderJob`

The runner works on logical files and nothing else. No scratch directory, no
argv, and no path crosses the interface, so the local and worker
implementations differ only in where the bytes go.

```ts
// packages/blender-nodes/src/runner.ts
export interface BlenderRunOptions {
  timeoutMs: number;
  signal: AbortSignal;
  onProgress?: (frame: number, total: number) => void;
  /** Per-output byte cap. Default MAX_OUTPUT_BYTES (512 MiB). */
  maxOutputBytes?: number;
  /** Cap on the sum of all outputs. Default MAX_TOTAL_OUTPUT_BYTES (1 GiB). */
  maxTotalOutputBytes?: number;
}

export interface BlenderRunResult {
  outputs: Record<string, Uint8Array>;   // keyed by job.outputs name
  stats: BlenderStats;
}

export interface BlenderRunner {
  readonly kind: "local" | "worker";
  run(
    job: BlenderJob,
    inputs: Record<string, Uint8Array>,  // keyed by job.inputs name
    options: BlenderRunOptions
  ): Promise<BlenderRunResult>;
}
```

`runBlenderJob(context, modelBytes, op, outputs, options)` is the thin
function nodes call. It validates every input and output file name with
`jobFileNameSchema`, refuses more than `MAX_OUTPUT_COUNT` (32) declared
outputs, builds the `BlenderJob`, picks a runner (D7), and returns the
runner's result. A node never touches a runner.

`LocalBlenderRunner.run`:

1. `const cwd = await context.workspace.scratchDir()`. Write each input
   under its declared bare file name, then `job.json`.
2. Spawn through `runHostBinary(binary.path, argv, { cwd, timeoutMs, signal,
   concurrencyClass: "render", env })`. `env` is an allowlist: `PATH`,
   `HOME`, `TMPDIR`, `LANG`, `SYSTEMROOT`, `CUDA_VISIBLE_DEVICES`, plus
   `BLENDER_USER_CONFIG`, `BLENDER_USER_SCRIPTS`, and
   `BLENDER_USER_EXTENSIONS` pointed at an empty directory under `cwd`, so the
   user's add-ons and startup scripts never load. No `artifactPath`: the host
   runner's single-file watchdog cannot cover a multi-output job, so
   enforcement lives in step 5.
3. Read `result.json`. Parse with `blenderResultSchema`. A missing or
   unparsable file is `BlenderJobError("bad_result")` carrying the last 4 KiB
   of stderr.
4. On `ok: false`, throw `BlenderJobError(code, message)`.
5. For every name in `job.outputs`, `stat` the declared path before reading
   it. A declared output missing from disk or absent from `produced` is
   `missing_output`. A file above `maxOutputBytes`, or a running total above
   `maxTotalOutputBytes`, is `output_too_large` naming the output and the cap,
   thrown before the file is read into memory. A name in `produced` that the
   job did not declare is ignored and logged at warn.
6. Delete the scratch directory in `finally`, including on abort and on the
   cap errors above.

`WorkerBlenderRunner.run` (Stage 4) sends the same `inputs` as bridge blobs,
the `job` inside a `blender.execute` frame, and applies the same step 5 caps
to the blobs that come back, by declared size before transfer where the
bridge reports one.

Progress: Blender prints `Fra:<n>` lines on stderr during animation renders.
The local runner turns them into `onProgress` calls through `onStderrLine`;
the worker runner reads `blender.event` frames. The node turns either into
`node_progress` messages through `context.postMessage`, the way the ComfyUI
node does.

### D7. Runner selection

```ts
export async function resolveBlenderRunner(): Promise<BlenderRunner>;
```

Stage 1 ships `LocalBlenderRunner` only. Stage 4 adds `WorkerBlenderRunner`,
selected when `NODETOOL_WORKER_URL` is set and the worker reports
`worker.status.blender.enabled`, the same selector `createPythonBridge` uses.
A local binary wins when both exist, so a desktop with Blender installed never
pays for a worker.

### D8. Nodes

All nodes: `model` input (`model_3d`), `timeout` prop in seconds (default
600, the ComfyUI node's default), and `@prop` metadata in the `video-nodes`
style. Outputs are inline refs (`{ type, uri: "", asset_id: null, data:
<base64> }`) like `RenderToImage`, so downstream save nodes decide
persistence.

| Node | Op | Inputs beyond `model` | Outputs |
|---|---|---|---|
| `nodetool.blender.RenderImage` | `render_image` | `camera_mode`, camera and engine params (D4) | `image` |
| `nodetool.blender.RenderPasses` | `render_passes` | same, plus `passes` multi-select and `depth_format` | `color`, `depth`, `depth_near`, `depth_far`, `normal`, `mask` (contracts in D4) |
| `nodetool.blender.RenderAnimation` | `render_animation` | `camera_mode`, `frame_start`, `frame_end`, `fps`, `orbit_degrees` | `video` |
| `nodetool.blender.PrepareForEngine` | `prepare_for_engine` | `target_faces`, `unwrap`, `bake` (`none` \| `ao` \| `normal` \| `both`), `bake_resolution`, `lod_count` | `model` (GLB), `lods` (list of GLB) |
| `nodetool.blender.ExportModel` | `export_model` | `format` (`fbx` \| `obj` \| `usd`) | `file` (`AssetRef`) |

`ExportModel` does not return a `Model3DRef`. FBX, OBJ, and USD are not glTF
documents, and `Model3DRef` has no `format` field, so a socket typed
`model_3d` carrying an FBX would misread the moment it crossed a strict
boundary. The node persists the export through `context.createAsset` and
returns `{ type: "asset", uri: "asset://<id>", asset_id, metadata: { format,
mime } }`. GLB is not an `ExportModel` format because `PrepareForEngine` and
the existing `FormatConverter` already produce a `Model3DRef` for it. The
`model_3d` socket keeps meaning glTF everywhere.

Cloud profile: the `nodetool.blender` namespace is not in the cloud allowlist
until Stage 4. `validate_workflow` then reports the nodes as unavailable on a
cloud server instead of failing at run time.

### D9. Agent capability

`render_model3d` joins `packages/agents/src/capabilities/model3d.ts`: input
`model_id` plus the `render_image` params, output `{ image_id, url, stats }`.
It reuses `runBlenderJob` and stores the PNG through `context.createAsset`.
Permission category `write` (it creates an asset). Extending the existing
module keeps the 3D capabilities in one place for the eval surface.

Availability follows the `yt_dlp` / `browser_*` pattern exactly: the
cloud profile drops `render_model3d` from the offered belt
(`availableBuiltinToolNames`, via `isBlenderEnabled` in
`packages/agents/src/blender-gate.ts` — the same `NODETOOL_NODE_PROFILE`
switch D8 uses for the `nodetool.blender` namespace), and the
implementation refuses on its own when reached by name, so a guest that
imports the module still gets a deployment answer instead of a run failure.
A non-cloud server without the binary still serves the capability and fails
with the cause named ("this server has no Blender installed...").

### D10. Configuration

| Setting | Where | Default |
|---|---|---|
| `BLENDER_PATH` | env, Electron settings field (Stage 1) | unset |
| `NODETOOL_BLENDER_CONCURRENCY` | env, the `render` class cap | 1 |
| `NODETOOL_HOST_BINARY_CONCURRENCY` | env, existing, the default class | 2 |
| `NODETOOL_WORKER_URL`, `NODETOOL_WORKER_TOKEN` | env, existing | unset |
| `MAX_OUTPUT_BYTES`, `MAX_TOTAL_OUTPUT_BYTES`, `MAX_OUTPUT_COUNT` | constants in `runner.ts`, overridable per call | 512 MiB, 1 GiB, 32 |

No new database rows. No feature flag: a namespace that is absent from a
profile and a node that throws a named error when Blender is missing are the
gates.

## Execution Flow

`RenderImage.process(context)`:

1. `resolveModelBytes(this.model, context)`, shared with `RenderToImage`
   (moved to `nodes-utils` so both packages import it). Empty bytes throw
   before Blender is touched.
2. Build `op = { op: "render_image", params }` and
   `outputs = { image: "render.png" }`.
3. `runBlenderJob(context, bytes, op, outputs, { timeoutMs, signal:
   context.signal, onProgress })`, which resolves the runner and calls
   `runner.run(job, { model: bytes }, options)`.
4. Return `{ image: { type: "image", uri: "", asset_id: null, data:
   bytesToBase64(result.outputs.image) } }`.

Failure paths:

- Blender absent: `HostBinaryMissingError("blender")` from step 3 before any
  file is written. The message names `BLENDER_PATH`.
- Blender too old: `BlenderVersionError` with both versions.
- glTF the importer rejects: `result.json` with `import_failed` and the
  importer's message. The node rethrows it with the node name prefixed.
- Timeout: `runHostBinary` kills the child. The scratch directory is deleted.
  The error names the timeout and suggests lower samples or EEVEE.
- Cancellation: `context.signal` aborts, the runner kills the child, the
  node rejects with the abort reason. No partial output is returned.
- Blender crashes (segfault, exit code outside 0 and 64) with no
  `result.json`: `BlenderJobError("bad_result")` with the stderr tail.
- An output over its cap: `output_too_large` from the `stat` in D6 step 5,
  before any byte is read. The scratch directory is deleted.
- `camera_mode: scene` on a glTF with no camera: `no_camera` from the op,
  before any render time is spent.

## API / Interface Changes

- `@nodetool-ai/runtime` exports `runHostBinary`, `HostBinaryMissingError`,
  `MAX_CAPTURED_BYTES`, `MAX_ARTIFACT_BYTES`, `maxConcurrentHostBinaries`.
  `@nodetool-ai/agents` keeps re-exporting them.
- `RunHostBinaryOptions` gains `signal?`, `env?`, `onStderrLine?`, and
  `concurrencyClass?` (D2). All optional, so existing callers are unchanged.
- `BlenderRunner`, `BlenderRunOptions`, `BlenderRunResult`, and
  `runBlenderJob` in `@nodetool-ai/blender-nodes` (D6).
- New node types listed in D8. `ExportModel` returns an `AssetRef`.
- New capability `render_model3d` (D9).
- Stage 4: `blender.execute` request with `{ job, inputs: blob keys,
  timeout }` and `blender.event` progress frames in
  `packages/protocol/src/bridge-frames.ts`, `executeBlender` in
  `packages/runtime/src/blender-executor.ts`, and
  `worker.status.blender.enabled` in the status schema. Shapes mirror
  `comfy.execute` and `comfy.event`.

## Data Model Changes

None. `Model3DRef` is unchanged and keeps meaning glTF. Rendered outputs are
ordinary image and video assets. An `ExportModel` output is an ordinary
stored asset with `format` and `mime` in its `metadata`. `BlenderJob` and
`BlenderResult` are files in a scratch directory that is deleted after the
run, never persisted.

## Alternatives Considered

### `bpy` wheel from PyPI instead of a Blender executable

Advantages: pip-installable into the existing Python venv or conda env,
so the Electron Package Manager could install it, and the Python worker
already has Python. Disadvantages: each `bpy` release pins one Python minor
(the current one requires 3.13 exactly), the wheel is a few hundred MB, and
the op script would run inside NodeTool's Python process instead of a child
the host runner can bound and kill. Rejected for now. The job contract in D4
is process-agnostic, so a `bpy` runner can be added as a third `BlenderRunner`
without changing a node.

### Extend `RenderToImage` with an `engine: "blender"` option

Advantages: no new package, one render node. Disadvantages: the node's
props would fork on engine, `video-nodes` would take on the op script asset
directory, and the cloud profile could not exclude Blender without excluding
the preview renderer. Rejected.

### Separate worker node types, like `lib.comfy.RunWorkflowOnWorker`

Advantages: explicit `worker_url` and `worker_token` props, no hidden
selection. Disadvantages: every Blender node doubles, and a graph authored
on a desktop stops working on a worker without editing every node.
Rejected in favor of the `createPythonBridge` selector, which the repository
already uses for the same question.

### Add `format` to `Model3DRef` and return exports as models

Advantages: one 3D socket type, FBX and USD flow through the same edges as
GLB. Disadvantages: every consumer of `model_3d` today assumes glTF, from the
editor to `validate_model3d` to `RenderToImage`, so the field would need a
check at each of them, and a missing `format` on old refs would have to mean
`glb` forever. Rejected until NodeTool decides `Model3DRef` is a general 3D
asset. An `AssetRef` with `metadata.format` carries the same information
today without changing what an existing edge means.

### A gated `RunScript` node for user Python

Advantages: unbounded flexibility, the Blender community's scripts run as
is. Disadvantages: `bpy` reaches the filesystem, the network, and
`subprocess`. Confining it needs a sandbox this design does not have.
Deferred. If it ships, it goes in the Developer Tools group, off in the
cloud profile, and runs only on a local workspace.

## Edge Cases

- Two nodes render at once. The `render` class semaphore queues the second.
  Each has its own scratch directory, so no file collides. An ffmpeg call in
  the default class runs alongside either.
- The same asset rendered twice with the same params produces the same
  bytes only when `samples` and the seed are fixed. Cycles is seeded from
  `scene.cycles.seed`, which the op sets to a constant. Idempotency is by
  construction, not by caching.
- A glTF with no mesh: `no_geometry`, before any render time is spent.
- A glTF with its own camera and lights under `camera_mode: auto`: both used
  as is. Under `orbit`: the node's camera, the scene's lights. A test pins
  each of the three modes with and without a scene camera.
- An animation whose MP4, or a `RenderPasses` run whose four images
  together, pass a cap: `output_too_large` from the post-run `stat`, before
  the bytes are read. Blender is not killed mid-write, because the caps are
  checked after exit, so a single runaway frame sequence is bounded by the
  timeout and the scratch disk, not by the cap. That is accepted for Stage 1
  and noted in R6.
- `result.json` lists a `produced` name the job did not declare, or a path
  appears anywhere in it: the name is ignored, the path is never read, and
  the run is logged at warn.
- `BLENDER_PATH` points at a file that is not Blender: `--version` fails,
  the error quotes the path and the first stderr line.
- Blender writes a `.crash.txt` into its temp directory (`$TMPDIR`) on a
  segfault, never next to the scratch files. It is included in the
  `bad_result` message when present.
- Process crash of the NodeTool server mid-render: the child is orphaned.
  Stage 1 accepts this. Stage 4's worker owns its process tree.
- Cloud workspace: `scratchDir()` returns a real temp directory on the
  server, so the node runs without `localDir`. Nothing is written to the
  workspace itself.

## Performance and Scalability

The hot path is Blender itself. Startup is one to three seconds. An EEVEE
still at 1024 px is a few seconds on CPU. Cycles at 128 samples is tens of
seconds to minutes per frame. Node overhead is one GLB write, one PNG read,
and JSON parsing, all negligible against that.

Concurrency is bounded by the `render` class cap,
`NODETOOL_BLENDER_CONCURRENCY`, separate from the ffmpeg and yt-dlp class
because a render holds a core for minutes. A render farm needs the worker
tier, not a higher local cap.

Output memory is bounded by `maxTotalOutputBytes`, and the check runs on file
sizes before any file is read, so the peak is one job's outputs, never an
unbounded record of buffers.

No caching in this design. When the same scene is rendered repeatedly with
the same job, the win is real, but no evidence yet says it is a bottleneck,
and the hash key (bytes plus job) is a small follow-up if it becomes one.

## Security and Privacy

What the local runner is: hardening. What it is not: a sandbox. Blender runs
as the NodeTool OS user with that user's filesystem and network reach, and
nothing in this design changes that. The claims below are the ones the
implementation can keep.

- Trust boundary: the glTF bytes and the props come from the workflow
  author. The op script and Blender come from the install. The only paths
  NodeTool passes to Blender are files it wrote into the scratch directory,
  and the only paths it reads back are the ones the job declared (D4).
  Neither stops `bpy` code from opening other paths. Nothing in Stage 1 runs
  `bpy` code NodeTool did not ship.
- `--disable-autoexec` stops scripts embedded in a scene from running.
  `--factory-startup` and the `BLENDER_USER_*` redirects stop the user's
  add-ons and startup scripts from loading. A glTF carries no script, so the
  first of these matters only once `.blend` inputs exist.
- The env allowlist keeps the secrets in `process.env` out of the child. It
  does not stop outbound connections. The op script opens no socket, and the
  job carries no URL, but Blender itself is not network-isolated here.
- Argv is built from typed props with `refuseFlagLikeValue` from
  `host-binary-guard.ts` applied to every top-level string param, so a value
  starting with `-` cannot become a Blender flag. Nested values (the
  `passes` list) are filtered against known constants by the node instead.
  File names in the job pass
  `jobFileNameSchema`, so `..` and separators never reach `job.json`.
- Untrusted Blender execution, meaning a `RunScript` node or a `.blend` from
  someone else, needs the worker tier. The worker is a container NodeTool
  provisions and reaps, with a bearer token and blobs as the only file
  channel. That is the isolation boundary, and the cloud profile keeps the
  nodes off the shared server until it exists (D8).
- Logs carry Blender's stderr tail. It can contain file names from the
  scratch directory, never user secrets.

## Observability

- The kernel's `node.process` span wraps the run. `runBlenderJob` adds
  attributes: `blender.version`, `blender.op`, `blender.engine`,
  `blender.runner` (`local` | `worker`), `blender.render_seconds` from
  `stats`, `blender.exit_code`, and `blender.queued_ms` when the concurrency
  slot waited.
- `node_progress` per frame on animation renders.
- One structured log line per run at info with the same fields, and at
  warn on non-zero exit with the stderr tail.
- `nodetool node run nodetool.blender.RenderImage --props ...` is the
  diagnostic entry point. `--no-secrets` applies because the node needs
  none.

## Rollout and Migration

- Stage 0 is a pure move plus additive options. It ships alone and can be
  reverted alone.
- Stages 1 to 3 add a package that no existing graph references. Absent
  Blender, the nodes throw a named error and nothing else changes.
- Stage 4 adds bridge frames with a new `type`, ignored by older workers,
  and a status flag that defaults to false.
- Rollback at any stage is a revert. No migration, no persisted schema.
- Hard to reverse: the `BlenderJob` version 1 shape once graphs and worker
  images depend on it. Version it from day one (D4) and reject an unknown
  version in `run_job.py` with `bad_job`.

## Testing Strategy

- T1 unit (`packages/runtime/tests/host-binaries.test.ts`): abort through
  `signal` kills a `sleep` child, `onStderrLine` receives lines, env
  allowlist excludes an injected `SECRET` variable. Invert each once.
- T2 unit (`packages/blender-nodes/tests/job.test.ts`): every node builds
  the expected `BlenderJob` from its props, `blenderResultSchema` rejects a
  result with an unknown error code, `refuseFlagLikeValue` rejects a
  `background_color` of `--python`, `jobFileNameSchema` rejects
  `../x.png` and `/tmp/x.png`. Against the fake Blender: a `result.json`
  whose `produced` names an undeclared output, or that carries a path, is
  ignored and the path is never opened (asserted with a sentinel file that
  must stay unread). A fake that writes one output over `maxOutputBytes`,
  and one that writes four outputs whose sum passes `maxTotalOutputBytes`,
  each fail with `output_too_large` before any read, with the scratch
  directory gone. Invert each once.
- T2b unit (`camera-mode.test.ts`): the three `camera_mode` values against a
  fixture with a camera and one without, asserting which camera the job
  selects and that `scene` without a camera is `no_camera`.
- T3 unit, two sides (`framing.test.ts` and `blender_ops/tests/test_framing.py`):
  the same fixture bounds and camera params produce the same camera position
  to four decimals. The Python test runs under Blender's own interpreter in
  CI when Blender is present and is skipped otherwise.
- T4 integration (`packages/blender-nodes/tests/render-image.test.ts`):
  render a fixture GLB and assert the PNG decodes, has the requested size,
  and is not uniform. Skipped without Blender, the way
  `model3d-render.test.ts` skips without Chrome. CI installs Blender on the
  Linux leg so the test runs there.
- T5 failure paths: a fake `blender` script on PATH that exits 64 without
  `result.json`, one that writes `ok: false`, one that never exits (timeout
  at 1 s), and a job aborted mid-run. Each asserts the error class and that
  the scratch directory is gone.
- T6 concurrency: two fake renders with `NODETOOL_BLENDER_CONCURRENCY=1`
  assert the second starts only after the first finishes, and a fake ffmpeg
  call in the default class starts while a render holds the `render` slot.
- T6b runner seam: a `FakeBlenderRunner` implementing `BlenderRunner`
  records the `job` and `inputs` it receives, and every node test runs
  against it. This is what proves a node never reaches past the interface.
- T7 regression: `RenderToImage` tests pass unchanged after
  `resolveModelBytes` moves to `nodes-utils`.
- T8 capability: `packages/agents/tests/capabilities-model3d.test.ts` gains
  `render_model3d` against the fake Blender, and `capabilities:check`
  passes.
- T9 harness: the `blender` surface in `registry.ts` names the suites above,
  with a `selfcheck` running `node run nodetool.blender.RenderImage` on a
  fixture, cost `expensive`, so `harness gate` runs it on diffs touching
  `packages/blender-nodes/`.
- T10 worker stage: bridge frame round-trip tests in `packages/protocol`
  mirroring the `comfy.execute` ones, and a fake worker in
  `packages/runtime/tests` that answers `blender.execute` with blobs.

## Implementation Plan

1. Stage 0, runner move. Move `host-binaries.ts` to runtime, add `signal`,
   `env`, `onStderrLine`, `concurrencyClass`. Update the agents import.
   Tests: T1, T6.
2. Stage 1, `RenderImage` local tier. New package, `blender-binary.ts`,
   `job.ts`, `runner.ts` with `BlenderRunner` and `LocalBlenderRunner`,
   `run-job.ts`, `run_job.py` with `render_image` and `framing.py`, asset
   dir registration, `base-nodes` registration, `resolveModelBytes` move,
   registry surface, CI Blender install, the Electron `BLENDER_PATH` settings
   field, and a Blender line in `start.sh doctor`. Tests: T2, T2b, T3, T4,
   T5, T6b, T7, T9.
3. Stage 2, `RenderPasses` and `RenderAnimation`. Compositor node tree for
   passes with the D4 contracts, FFMPEG output, `Fra:` progress. Tests: T2
   additions, T4 for each output including a depth image whose near and far
   match a known fixture, a progress test against the fake Blender.
4. Stage 3, `PrepareForEngine`, `ExportModel`, and `render_model3d`.
   Tests: T2 additions, T4 asserting exported FBX magic bytes, the
   `AssetRef` metadata, and GLB validity through `validateModel3D`, T8.
5. Stage 4, worker tier. Bridge frames, `blender-executor.ts`,
   `WorkerBlenderRunner`, status flag, cloud allowlist. Tests: T10, plus
   T6b re-run with the worker runner behind the fake worker. The worker
   image is a separate deliverable outside this repository.

## Open Questions

- Q1. Does the explainer use case need scene-side camera and text authoring
  (U1) in the same release? If yes, `packages/model3d` grows a `camera` and
  `text` primitive first, and `RenderAnimation` under `camera_mode: auto`
  picks them up with no further change.
- Q2. Should Stage 4 route long renders through the generation ledger with
  `background: true` so agents `await_generation`? It changes the node from
  synchronous to a job handle and is the point where the timeout stops
  being the only bound.

## Risks

- R1. Blender availability. Highest. Desktop users must install it and the
  server has none until the worker ships. Mitigation: named errors, the
  `BLENDER_PATH` setting, and the profile exclusion, so no user meets a node
  that fails silently.
- R2. Renderer parity drift. The preview node and the Blender node share
  camera params but not a renderer, so the same numbers frame differently.
  Mitigation: T3 pins the framing math on both sides.
- R3. Render time versus timeouts. Mitigation: EEVEE and low samples as
  defaults, the `timeout` prop, progress messages, and Q2 for the long tail.
- R4. Code execution in Blender. The local runner is not a sandbox.
  Mitigation: no user Python in scope, `--disable-autoexec`,
  `--factory-startup`, the env allowlist, and the rule that untrusted
  execution waits for the worker tier.
- R5. Job contract lock-in once worker images exist. Mitigation: the
  version field, a `bad_job` rejection path, and a runner interface that
  carries no paths, so Stage 4 adds an implementation instead of rewriting
  `runBlenderJob`.
- R6. Disk use during a run. The output caps are checked after Blender
  exits, so a runaway animation can fill the scratch disk up to the timeout.
  Mitigation: the timeout, and a follow-up that watches the scratch
  directory's total size while the child runs, which `runHostBinary`'s
  watchdog can be extended to do.
