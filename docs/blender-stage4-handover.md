# Blender Stage 4 — handover

Stages 0-3 are merged (PR #5570, `34f8ecb36`). Stage 4, the worker tier, is
half built across two repositories. This document says what exists, what is
left, and the one defect that blocks the two halves from talking.

The design is [blender-headless-integration-design.md](blender-headless-integration-design.md).
Read D4, D6 and D7 before touching any of this; the invariants below are its
invariants, not local conventions.

## Where the work sits

| Repository | Branch / commit | State |
|---|---|---|
| `nodetool` | merged into `main` (#5570) | Stages 0-3: five `nodetool.blender.*` nodes, `render_model3d`, job contract, `LocalBlenderRunner`, `blender_ops/` |
| `nodetool` | `feat/blender-headless`, `2b2954c8d` | Stage 4a: `blender.execute` / `blender.event` frames, `worker.status.blender.enabled`, `blender-executor.ts` |
| `nodetool-core` | `feat/blender-worker`, PR #1050 | The worker side: `blender_handler.py`, 26 tests, one real render |

Stage 4a is committed but **not** part of #5570 — it needs its own PR.

## The blocker

**Today's client cannot talk to the worker.** Stage 4a's request carries only
the job's input bytes. The worker needs the op script too, because of a
decision taken after 4a was written:

> The op script travels with the job as blobs. The client sends every file of
> `blender_ops/`; the worker writes them into its scratch directory and runs
> `run_job.py`. Nothing is vendored into `nodetool-core`.

The point is that a worker image cannot drift from a NodeTool release: the
worker runs exactly the ops that release shipped, and the image needs Blender
and nothing else from NodeTool. The alternative — baking `blender_ops/` into
the image — recreates the version-skew risk R5 in the design warns about, on a
release cycle nobody here controls.

So `WorkerBlenderRunner` must send `blender_ops/` as extra blobs keyed by
relative path (`run_job.py`, `framing.py`, `ops/render_image.py`, …). The
worker already accepts exactly that. Until then every `blender.execute`
request fails.

This is worth dwelling on: the fake worker in
`packages/runtime/tests/blender-executor.test.ts` passes today, because it was
written against the same assumption the client was. The real worker found it
in one round trip.

## What is left (Stage 4b)

1. **`WorkerBlenderRunner implements BlenderRunner`** in
   `packages/blender-nodes/src/runner.ts` or beside it. It ships the ops blobs
   (above), calls `executeBlender`, and maps `BlenderExecutorError` codes to
   `BlenderJobError` one for one — the codes are already verbatim.
2. **`resolveBlenderRunner`** (D7): worker when `NODETOOL_WORKER_URL` is set
   *and* `worker.status` reports `blender.enabled`, but a **local binary wins
   when both exist**, so a desktop with Blender never pays for a worker.
3. **`render_model3d` gains `background: true`**, through the existing
   `context.runGeneration` / `await_generation` path that `media.ts` uses,
   including the `MAX_BACKGROUND_GENERATIONS` cap. This is the answer to the
   design's open question Q2. **The five nodes stay synchronous**: a node
   returning a job handle instead of an image changes what every downstream
   edge means, and the kernel already runs nodes concurrently. Record that
   resolution in the design doc under Q2.
4. **A real round-trip test**, opt-in, skipped unless `NODETOOL_WORKER_URL` is
   set — the same shape as the Blender skip, which `NODETOOL_REQUIRE_BLENDER`
   makes non-vacuous. Start a worker with
   `python -m nodetool.worker --port <p>` from a nodetool-core checkout on
   PR #1050, point the variable at it, and run a node through
   `WorkerBlenderRunner`. Until that passes, everything on the client side
   rests on a fake.
5. **Leave the cloud profile alone.** `nodetool.blender` and `render_model3d`
   stay excluded until a real worker answers a real job in an environment we
   provision. Flipping the allowlist is a one-line follow-up with evidence
   behind it, not part of 4b.

## Assumptions the client copied from Comfy and has never measured

`blender-executor.ts` was written against a fake. These five are assumptions,
not facts, and the round-trip test in 4b is what settles them:

1. the worker reads `data.blobs`, not `data.blob`;
2. it enforces the request's `timeout`;
3. its progress totals match what `onProgress` expects;
4. its `sizes` are honest, which is what lets the client refuse an oversize
   result before transfer;
5. an older worker answers an unknown frame type with `Unknown message type`
   rather than hanging.

PR #1050's handler satisfies 1-4 by construction; 5 is still unverified, since
no old worker was available to test against.

## Known gaps in the worker (PR #1050)

- **No worker-side output cap.** The client refuses from `sizes`, but a rogue
  op can exhaust worker memory before any size is reported. Add a cap mirroring
  `MAX_OUTPUT_BYTES` / `MAX_TOTAL_OUTPUT_BYTES`.
- **Terminal `error` frames flatten to `bad_result`**, losing the worker's
  detail.
- **Scratch is system temp**, not the workspace seam the local tier uses. That
  is intended — the worker has no workspace — but it means the local and
  worker tiers clean up different places.

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

## Things that bit us, so they do not bite you

- **Blender 5.2 is the floor, not 4.2.** `scene.compositing_node_group` and
  `image_settings.media_type` do not exist in 4.2. A backport would need the
  compositor rebuilt on the legacy `Scene.node_tree` API.
- **`node is tex` never matches.** Every Blender collection access returns a
  fresh Python proxy. An identity comparison silently deselected every bake
  target, `bpy.ops.object.bake` returned `CANCELLED` unchecked, and every baked
  map was black. Check operator return values the way `_export_glb` does.
- **The object index pass is Cycles-only.** EEVEE's Render Layers node does not
  expose it, which is why the mask has two paths.
- **The compositor stages `1e10`, not `+inf`, on both engines** — the op
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

## Running it locally

```bash
# terminal 1 — the worker, from a nodetool-core checkout on PR #1050
conda activate nodetool
python -m nodetool.worker --port 8787

# terminal 2 — this repo
export NODETOOL_WORKER_URL=ws://127.0.0.1:8787
npm run build:packages
npx vitest run --root packages/blender-nodes
```

Blender must be on `PATH`, at `BLENDER_PATH`, or in a well-known location, and
must be 5.2 or newer. `NODETOOL_REQUIRE_BLENDER=1` turns a missing binary into
a failure instead of a skip; CI sets it.
