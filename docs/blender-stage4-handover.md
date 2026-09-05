# Blender Stage 4 — handover

Stages 0-3 are merged (PR #5570). Stage 4, the worker tier, is built on both
sides and staged on `feat/blender-headless`. What remains is one measurement
against a real worker, one cap on the worker side, and one allowlist decision.

The design is [blender-headless-integration-design.md](blender-headless-integration-design.md).
Read D4, D6 and D7 before touching any of this; the invariants below are its
invariants, not local conventions.

## Where the work sits

| Repository | Branch | State |
|---|---|---|
| `nodetool` | `main` (#5570) | Stages 0-3: five `nodetool.blender.*` nodes, `render_model3d`, job contract, `LocalBlenderRunner`, `blender_ops/` |
| `nodetool` | `feat/blender-headless` | Stage 4a committed: `blender.execute` / `blender.event` frames, `worker.status.blender.enabled`, `blender-executor.ts`. Stage 4b staged, uncommitted: `WorkerBlenderRunner`, `resolveBlenderRunner`, `render_model3d` background mode |
| `nodetool-core` | `feat/blender-worker`, PR #1050 | The worker side: `blender_handler.py`, 26 tests, one real render |

Stage 4 is not part of #5570 and needs its own PR.

## What 4b built

**`WorkerBlenderRunner`** (`packages/blender-nodes/src/runner.ts`) sends every
file under `blender_ops/` as an extra blob keyed by relative path
(`run_job.py`, `framing.py`, `ops/render_image.py`, …). The worker writes them
into its scratch directory and runs `run_job.py`, so a worker image carries
Blender and nothing from NodeTool, and cannot drift from the release that
issued the job. `executeBlender` keeps these blobs outside `job.inputs` and
rejects a blob whose key collides with a declared input. `BlenderExecutorError`
codes map to `BlenderJobError` one for one, and an unknown code keeps the
worker's message instead of collapsing to a bare `bad_result`.

**`resolveBlenderRunner`** (`packages/blender-nodes/src/run-job.ts`, D7):

1. A local Blender binary that resolves wins. A desktop with Blender never
   pays for a worker.
2. No binary and no `NODETOOL_WORKER_URL` returns `LocalBlenderRunner` anyway.
   The run fails later on the missing binary, with the binary error.
3. No binary and a URL returns `WorkerBlenderRunner` after `assertAvailable`
   checked `worker.status`. A worker that does not report `blender.enabled`
   fails here with a message that names `NODETOOL_WORKER_URL`: a configuration
   error, not a `bad_result`.

A configured worker is never silently replaced with local after a connection
or capability failure. The URL is a deployment choice.

**`render_model3d` takes `background: true`** through the same
`context.runGeneration` / `await_generation` path as `media.ts`. The per-run
cap is `MAX_BACKGROUND_GENERATIONS` in
`packages/agents/src/capabilities/background-generation.ts`, shared with the
provider media calls. This resolves the design's Q2 and is recorded there. The
five nodes stay synchronous: a node that returns a job handle changes what
every downstream edge means, and the kernel already runs nodes concurrently.

## What is left

1. **Run the round-trip test once against a real worker.**
   `packages/blender-nodes/tests/worker-roundtrip.test.ts` skips when
   `NODETOOL_WORKER_URL` is empty. `NODETOOL_REQUIRE_WORKER=1` turns the skip
   into a failure. CI sets neither, so this is a manual gate. Until it passes,
   the client side rests on the fake in `tests/worker-runner.test.ts`.

   ```bash
   # terminal 1 — the worker, from a nodetool-core checkout on PR #1050
   conda activate nodetool
   python -m nodetool.worker --port 8787

   # terminal 2 — this repo
   export NODETOOL_WORKER_URL=ws://127.0.0.1:8787
   export NODETOOL_REQUIRE_WORKER=1
   npm run build:packages
   npx vitest run --root packages/blender-nodes tests/worker-roundtrip.test.ts
   ```

2. **A worker-side output cap** in PR #1050, mirroring `MAX_OUTPUT_BYTES` and
   `MAX_TOTAL_OUTPUT_BYTES`. The client refuses from `sizes`, but a rogue op
   can exhaust worker memory before any size is reported.
3. **The cloud allowlist.** `nodetool.blender` and `render_model3d` stay
   excluded until a real worker answers a real job in an environment we
   provision. Flipping it is a one-line follow-up with that evidence behind it.

## Still unmeasured

The fake in `tests/worker-runner.test.ts` pins the blob layout and the
size-before-transfer refusal. Three client assumptions still have no
measurement, and item 1 above is what settles them:

1. the worker enforces the request's `timeout`;
2. its progress totals match what `onProgress` expects;
3. an older worker answers an unknown frame type with `Unknown message type`
   rather than hanging. No old worker was available to test against.

## Known gaps in the worker (PR #1050)

- **No output cap** (item 2 above).
- **Terminal `error` frames flatten to `bad_result`** on the worker side,
  losing the detail the client now preserves.
- **Scratch is system temp**, not the workspace seam the local tier uses.
  Intended, since the worker has no workspace, but the two tiers clean up
  different places.

## Invariants that must survive any change here

A node must not be able to tell which tier ran it. Both tiers therefore:

- read back **only** outputs the job declared. A name the op invents is ignored
  and logged; a path inside `result.json` is never opened. The FIFO sentinel in
  `packages/blender-nodes/tests/runner.test.ts` fails if that ever changes.
- check sizes **before** reading bytes, so an oversize output never enters
  memory.
- delete the scratch directory on success, op failure, timeout, cancel and
  crash.
- run Blender with `--factory-startup --disable-autoexec` and an allowlisted
  environment with the `BLENDER_USER_*` redirects, so neither the user's
  add-ons nor `process.env` secrets reach the child.

## Pitfalls

- **Blender 5.2 is the floor, not 4.2.** `scene.compositing_node_group` and
  `image_settings.media_type` do not exist in 4.2. A backport would need the
  compositor rebuilt on the legacy `Scene.node_tree` API.
- **`node is tex` never matches.** Every Blender collection access returns a
  fresh Python proxy. An identity comparison silently deselected every bake
  target, `bpy.ops.object.bake` returned `CANCELLED` unchecked, and every baked
  map was black. Check operator return values the way `_export_glb` does.
- **The object index pass is Cycles-only.** EEVEE's Render Layers node does not
  expose it, which is why the mask has two paths.
- **The compositor stages `1e10`, not `+inf`, on both engines.** The op
  rewrites it before the EXR output is written.
- **There are two DSL generators.** `codegen:dsl:check` covers
  `packages/dsl`; the sandbox guest pack has its own gate,
  `build:sandbox-dsl:check`. A new node package needs both.
- **`git stash` is not a red-proof baseline.** It leaves committed work in
  place, so you measure your own branch. Use `git checkout <base> -- <paths>`
  or a fresh worktree.
- **Verify per-package and you will miss suites.** Two failures reached CI
  because only the obvious packages were run locally. `npm run test:packages`
  is what the shards run.

Blender must be on `PATH`, at `BLENDER_PATH`, or in a well-known location, and
must be 5.2 or newer. `NODETOOL_REQUIRE_BLENDER=1` turns a missing binary into
a failure instead of a skip; CI sets it.
