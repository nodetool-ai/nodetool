# blender-nodes — Blender Headless Integration

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **blender-nodes**

Substrate for `nodetool.blender.*` nodes (Stages 0–3): binary discovery,
the versioned job contract, the runner interface with its local
implementation, `runBlenderJob`, and the `RenderImage`, `RenderPasses`,
`RenderAnimation`, `PrepareForEngine`, and `ExportModel` nodes over
`blender_ops/` (`render_image`, `render_passes`, `render_animation`,
`prepare_for_engine`, `export_model` plus shared `common`, `depth`, `exr`).

- **Read only declared outputs.** `LocalBlenderRunner` stats each path in
  `job.outputs` before reading any byte; a `produced` name the job did not
  declare is ignored at warn, and nothing in `result.json` is ever opened
  as a path. `tests/runner.test.ts` pins this with a fake blender.
- **Binary discovery order**: `BLENDER_PATH`, then `blender` on PATH, then
  well-known OS locations. Floor is Blender 5.2 (`BlenderVersionError`).
- **Argv guard is a copy**: `src/argv-guard.ts` duplicates
  `refuseFlagLikeValue` from `packages/agents/src/host-binary-guard.ts`
  (no agents dependency); `tests/job.test.ts` pins both to the same
  behavior.
- **Fake blender mode travels in the filename** (`fake-<mode>.mjs`), not env:
  the runner scrubs the child environment by design.
- **The runner stages through the workspace seam**: `runBlenderJob` passes
  `context.workspace.scratchDir()` as the scratch parent; the runner owns a
  per-run subdir under it and deletes only that. No `os.tmpdir()` fallback
  in production code — context-free calls fail `bad_job` on the local tier.
- **Blender 5.x API facts (measured, not assumed)**: compositing runs
  through `scene.compositing_node_group` (legacy `node_tree` is gone,
  Math/Mix/MapRange nodes are gone); File Output nodes always write
  multilayer EXR under the factory render base, so the passes op stages
  through a pid-unique subdir and reads it back with the pure-Python
  `exr.py`; video output needs `media_type = "VIDEO"` before `FFMPEG`;
  `Fra:` progress lines are gone, so `render_animation` prints its own from
  a `render_write` handler. EEVEE writes 1e10 (not +inf) off-geometry and a
  world-space Normal pass — the op gates and rotates in Python.
