# Blender Headless Integration — Design

Status: proposed. Nothing in this document is implemented.

## Summary

Blender runs as a headless processor over the glTF document NodeTool already
has. A new `packages/blender-nodes` package ships `nodetool.blender.*` nodes
that take a `Model3DRef` and return an image, a video, or another model. Every
node builds a JSON job, and one function, `runBlenderJob`, spawns
`blender -b --python` on a vendored Python op script through the bounded host
binary runner that ffmpeg already uses. Tier one is a Blender executable on the
machine running the workflow. Tier two, a later stage, routes the same job to a
GPU worker over the bridge the ComfyUI worker uses. Nodes never know which
tier ran them.

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
  `packages/protocol/src/api-types.ts`. Node code reads the looser
  `Model3DRefLike` with `data`, `format`, `vertices`, `faces`
  (`packages/video-nodes/src/nodes/model3d/types.ts`).
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
- `electron/` gains a Blender path setting in the worker stage or earlier.

## Assumptions

- A1. Blender 4.2 LTS is the floor. The glTF importer and exporter are core
  add-ons enabled under `--factory-startup`. EEVEE Next and Cycles both
  render headless on CPU with no display.
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

`RunHostBinaryOptions` gains `signal?: AbortSignal`. On abort the runner
sends SIGTERM and follows the existing SIGKILL path. This is the only change
to the runner's behavior.

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
The first candidate that runs `--version` wins. Below 4.2 throws
`BlenderVersionError` naming the found version and the floor. No candidate
throws `HostBinaryMissingError("blender")`. The result is cached per process
and invalidated when `BLENDER_PATH` changes.

### D4. The job contract

Every node produces a `BlenderJob`. The Python side consumes it and writes a
`BlenderResult`. Both are versioned so the TypeScript and Python halves can
drift by one version during an upgrade.

```ts
// packages/blender-nodes/src/job.ts
export const BLENDER_JOB_VERSION = 1;

export type BlenderOp =
  | { op: "render_image"; params: RenderImageParams }
  | { op: "render_passes"; params: RenderPassesParams }
  | { op: "render_animation"; params: RenderAnimationParams }
  | { op: "prepare_for_engine"; params: PrepareForEngineParams }
  | { op: "export_model"; params: ExportModelParams };

export interface BlenderJob {
  version: typeof BLENDER_JOB_VERSION;
  /** File names relative to the scratch dir, written by the node. */
  inputs: { model: string };
  /** Output file names the op must write, relative to the scratch dir. */
  outputs: Record<string, string>;
  job: BlenderOp;
}

export const blenderResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    outputs: z.record(z.string()),          // name -> written file
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

### D5. The op script

`packages/blender-nodes/blender_ops/run_job.py` plus one module per op.
Declared in `PACKAGE_RUNTIME_ASSET_DIRS` as
`{ pkg: "@nodetool-ai/blender-nodes", path: "blender_ops", bundleDir: "_blender_ops", files: [...] }`
with every file named, so an unstaged module fails the bundle verifier
instead of the product.

Invocation, built by `runBlenderJob`:

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
`bpy.ops.import_scene.gltf(filepath=inputs.model)`, then either the scene's
own camera and lights when the glTF carries them, or a camera placed by the
same auto-framing math `render3d-core.ts` uses (`computeFraming`,
`orbitOffset`), ported once into `blender_ops/framing.py` and pinned by a
fixture test on both sides (T3).

Video output for `render_animation` uses Blender's own FFMPEG writer
(`image_settings.file_format = "FFMPEG"`, MPEG-4 container, H.264, `yuv420p`),
so the package needs no ffmpeg on PATH and no Mediabunny dependency.

### D6. `runBlenderJob`

```ts
// packages/blender-nodes/src/run-job.ts
export interface RunBlenderJobOptions {
  timeoutMs: number;
  signal: AbortSignal;
  onProgress?: (frame: number, total: number) => void;
}

export interface BlenderJobOutputs {
  files: Record<string, Uint8Array>;   // keyed by job.outputs name
  stats: BlenderResult["stats"];
}

export async function runBlenderJob(
  context: ProcessingContext,
  modelBytes: Uint8Array,
  job: BlenderOp,
  outputs: Record<string, string>,
  options: RunBlenderJobOptions
): Promise<BlenderJobOutputs>;
```

Steps:

1. `const runner = await resolveBlenderRunner()` (D7).
2. `const cwd = await context.workspace.scratchDir()`. Write `input.glb`
   and `job.json` there. The scratch directory is the job's whole filesystem.
3. Spawn through `runHostBinary(runner.path, argv, { cwd, timeoutMs, signal,
   artifactPath: <largest declared output> })` with an env allowlist:
   `PATH`, `HOME`, `TMPDIR`, `LANG`, `SYSTEMROOT`, `CUDA_VISIBLE_DEVICES`,
   plus `BLENDER_USER_CONFIG`, `BLENDER_USER_SCRIPTS`, and
   `BLENDER_USER_EXTENSIONS` pointed at an empty directory under `cwd`, so
   the user's add-ons and startup scripts never load.
4. Read `result.json`. Parse with `blenderResultSchema`. A missing or
   unparsable file is a `BlenderJobError("bad_result")` carrying the last
   4 KiB of stderr.
5. On `ok: false`, throw `BlenderJobError(code, message)`.
6. Read every declared output. A declared output the op did not write is
   `BlenderJobError("missing_output")`.
7. Delete the scratch files in `finally`, including on abort.

Progress: Blender prints `Fra:<n>` lines on stderr during animation renders.
`runHostBinary` captures stderr as a string after exit, so live progress needs
a line callback. D2 adds `onStderrLine?: (line: string) => void` to
`RunHostBinaryOptions`, fed from the same stream the capture reads. The node
turns `Fra:` lines into `node_progress` messages through
`context.postMessage`, the way the ComfyUI node does.

### D7. Runner selection

```ts
export interface BlenderRunner {
  kind: "local" | "worker";
  run(cwdFiles: Record<string, Uint8Array>, argv: string[], opts): Promise<...>;
}
export async function resolveBlenderRunner(): Promise<BlenderRunner>;
```

Stage 1 ships `local` only. Stage 4 adds `worker`, selected when
`NODETOOL_WORKER_URL` is set and the worker reports
`worker.status.blender.enabled`, the same selector `createPythonBridge` uses.
A local binary wins when both exist, so a desktop with Blender installed never
pays for a worker. Nodes call `runBlenderJob` and never see the runner.

### D8. Nodes

All nodes: `model` input (`model_3d`), `timeout` prop in seconds (default
600, the ComfyUI node's default), and `@prop` metadata in the `video-nodes`
style. Outputs are inline refs (`{ type, uri: "", asset_id: null, data:
<base64> }`) like `RenderToImage`, so downstream save nodes decide
persistence.

| Node | Op | Inputs beyond `model` | Outputs |
|---|---|---|---|
| `nodetool.blender.RenderImage` | `render_image` | camera and engine params (D4) | `image` |
| `nodetool.blender.RenderPasses` | `render_passes` | same, plus `passes` multi-select | `color`, `depth` (16-bit PNG, plus `depth_near`/`depth_far` floats), `normal`, `mask` |
| `nodetool.blender.RenderAnimation` | `render_animation` | `frame_start`, `frame_end`, `fps`, `camera_path` (`orbit` \| `dolly` \| `scene_camera`), `orbit_degrees` | `video` |
| `nodetool.blender.PrepareForEngine` | `prepare_for_engine` | `target_faces`, `unwrap`, `bake` (`none` \| `ao` \| `normal` \| `both`), `bake_resolution`, `lod_count` | `model` (GLB), `lods` (list of GLB) |
| `nodetool.blender.ExportModel` | `export_model` | `format` (`fbx` \| `obj` \| `usd` \| `glb`) | `model` with `format` set |

`ExportModel` output is a `Model3DRefLike` whose `format` is not `glb`. The
existing `RenderToImage` already refuses non-GLB input by format, so no
downstream node silently misreads an FBX.

Cloud profile: the `nodetool.blender` namespace is not in the cloud allowlist
until Stage 4. `validate_workflow` then reports the nodes as unavailable on a
cloud server instead of failing at run time.

### D9. Agent capability

`render_model3d` joins `packages/agents/src/capabilities/model3d.ts`: input
`model_id` plus the `render_image` params, output `{ image_id, url, stats }`.
It reuses `runBlenderJob` and stores the PNG through `context.createAsset`.
Permission category `write` (it creates an asset). Extending the existing
module keeps the 3D capabilities in one place for the eval surface.

### D10. Configuration

| Setting | Where | Default |
|---|---|---|
| `BLENDER_PATH` | env, Electron settings field | unset |
| `NODETOOL_HOST_BINARY_CONCURRENCY` | env, existing | 2 |
| `NODETOOL_WORKER_URL`, `NODETOOL_WORKER_TOKEN` | env, existing | unset |

No new database rows. No feature flag: a namespace that is absent from a
profile and a node that throws a named error when Blender is missing are the
gates.

## Execution Flow

`RenderImage.process(context)`:

1. `resolveModelBytes(this.model, context)`, shared with `RenderToImage`
   (moved to `nodes-utils` so both packages import it). Empty bytes throw
   before Blender is touched.
2. Build `job = { op: "render_image", params }` and
   `outputs = { image: "render.png" }`.
3. `runBlenderJob(context, bytes, job, outputs, { timeoutMs, signal:
   context.signal, onProgress })`.
4. Return `{ image: { type: "image", uri: "", asset_id: null, data:
   bytesToBase64(files.image) } }`.

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

## API / Interface Changes

- `@nodetool-ai/runtime` exports `runHostBinary`, `HostBinaryMissingError`,
  `MAX_CAPTURED_BYTES`, `MAX_ARTIFACT_BYTES`, `maxConcurrentHostBinaries`.
  `@nodetool-ai/agents` keeps re-exporting them.
- `RunHostBinaryOptions` gains `signal?: AbortSignal`, `env?: Record<string,
  string>`, and `onStderrLine?`. All optional, so existing callers are
  unchanged.
- New node types listed in D8.
- New capability `render_model3d` (D9).
- Stage 4: `blender.execute` request with `{ job, inputs: blob keys,
  timeout }` and `blender.event` progress frames in
  `packages/protocol/src/bridge-frames.ts`, `executeBlender` in
  `packages/runtime/src/blender-executor.ts`, and
  `worker.status.blender.enabled` in the status schema. Shapes mirror
  `comfy.execute` and `comfy.event`.

## Data Model Changes

None. `Model3DRef` is unchanged. Rendered outputs are ordinary image and
video assets. `BlenderJob` and `BlenderResult` are files in a scratch
directory that is deleted after the run, never persisted.

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

### A gated `RunScript` node for user Python

Advantages: unbounded flexibility, the Blender community's scripts run as
is. Disadvantages: `bpy` reaches the filesystem, the network, and
`subprocess`. Confining it needs a sandbox this design does not have.
Deferred. If it ships, it goes in the Developer Tools group, off in the
cloud profile, and runs only on a local workspace.

## Edge Cases

- Two nodes render at once. `maxConcurrentHostBinaries` queues the second.
  Each has its own scratch directory, so no file collides.
- The same asset rendered twice with the same params produces the same
  bytes only when `samples` and the seed are fixed. Cycles is seeded from
  `scene.cycles.seed`, which the op sets to a constant. Idempotency is by
  construction, not by caching.
- A glTF with no mesh: `no_geometry`, before any render time is spent.
- A glTF with its own camera and lights: used as is. A camera preset on the
  node overrides the camera, never the lights. A test pins both branches.
- A GLB above the artifact cap or an animation whose MP4 passes
  `maxArtifactBytes`: the watchdog kills Blender and the node reports which
  cap was hit.
- `BLENDER_PATH` points at a file that is not Blender: `--version` fails,
  the error quotes the path and the first stderr line.
- Blender writes a `.crash.txt` next to the scratch files on a segfault. It
  is included in the `bad_result` message when present.
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

Concurrency is bounded by `maxConcurrentHostBinaries`, shared with ffmpeg and
yt-dlp. A render farm needs the worker tier, not a higher local cap.

No caching in this design. When the same scene is rendered repeatedly with
the same job, the win is real, but no evidence yet says it is a bottleneck,
and the hash key (bytes plus job) is a small follow-up if it becomes one.

## Security and Privacy

- Trust boundary: the glTF bytes and the props come from the workflow
  author. The op script and Blender come from the install. Blender never
  receives a path outside the scratch directory.
- `--disable-autoexec` and `--factory-startup` stop scripts embedded in a
  scene and user add-ons from running. The env allowlist keeps secrets in
  `process.env` out of the child.
- No network: the op script imports nothing that opens sockets, and the job
  carries no URLs. Blender's own online access (extensions, update checks)
  is off under `--factory-startup`.
- Argv is built from typed props with `refuseFlagLikeValue` from
  `host-binary-guard.ts` applied to every string prop, so a value starting
  with `-` cannot become a Blender flag.
- Worker tier: bearer token as today. Blobs are the only file channel.
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
  `background_color` of `--python`.
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
- T6 concurrency: three fake renders with concurrency 2 assert the third
  starts only after one finishes.
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
   `env`, `onStderrLine`. Update the agents import. Tests: T1.
2. Stage 1, `RenderImage` local tier. New package, `blender-binary.ts`,
   `job.ts`, `run-job.ts`, `run_job.py` with `render_image` and `framing.py`,
   asset dir registration, `base-nodes` registration, `resolveModelBytes`
   move, registry surface, CI Blender install. Tests: T2, T3, T4, T5, T6,
   T7, T9.
3. Stage 2, `RenderPasses` and `RenderAnimation`. Compositor node tree for
   passes, FFMPEG output, `Fra:` progress. Tests: T2 additions, T4 for each
   output, a progress test against the fake Blender.
4. Stage 3, `PrepareForEngine`, `ExportModel`, and `render_model3d`.
   Tests: T2 additions, T4 asserting exported FBX magic bytes and GLB
   validity through `validateModel3D`, T8.
5. Stage 4, worker tier. Bridge frames, `blender-executor.ts`, the
   `worker` runner, status flag, cloud allowlist. Tests: T10. The worker
   image is a separate deliverable outside this repository.
6. Stage 5, Electron. A Blender path field in settings writing
   `BLENDER_PATH` for the backend, and a doctor line in `start.sh doctor`.

## Open Questions

- Q1. Does the explainer use case need scene-side camera and text authoring
  (U1) in the same release? If yes, `packages/model3d` grows a `camera` and
  `text` primitive first, and `RenderAnimation` gains `scene_camera` as the
  default path.
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
- R4. Code execution through scenes or add-ons. Mitigation:
  `--disable-autoexec`, `--factory-startup`, the env allowlist, and no
  user Python in scope.
- R5. Job contract lock-in once worker images exist. Mitigation: the
  version field and a `bad_job` rejection path from day one.
