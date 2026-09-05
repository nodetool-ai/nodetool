# blender-nodes — Blender Headless Integration

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **blender-nodes**

Substrate for `nodetool.blender.*` nodes: binary discovery, the versioned job
contract, local and worker runner implementations, `runBlenderJob`, and the
`RenderImage`, `RenderPasses`,
`RenderAnimation`, `PrepareForEngine`, and `ExportModel` nodes over
`blender_ops/` (`render_image`, `render_passes`, `render_animation`,
`prepare_for_engine`, `export_model` plus shared `common`, `depth`, `exr`).

- **Read only declared outputs.** `LocalBlenderRunner` stats each path in
  `job.outputs` before reading any byte; a `produced` name the job did not
  declare is ignored at warn, and nothing in `result.json` is ever opened
  as a path. `tests/runner.test.ts` pins this with a fake blender.
- **Binary discovery order**: a user-scoped `BLENDER_PATH` setting outside the
  cloud profile, then process `BLENDER_PATH`, then `blender` on PATH, then
  well-known OS locations. Stored paths are ignored under the cloud profile
  and are never copied into process environment. Floor is Blender 5.2
  (`BlenderVersionError`).
- **No flag-injection check here**: Blender's argv is fixed in
  `LocalBlenderRunner` and every param travels inside `job.json`, so no
  value can become a flag. `host-binary-guard.ts` stays in agents, where
  it confines model-authored argv for ffmpeg and yt-dlp.
- **Fake blender mode travels in the filename** (`fake-<mode>.mjs`), not env:
  the runner scrubs the child environment by design.
- **The runner stages through the workspace seam**: `runBlenderJob` passes
  `context.workspace.scratchDir()` as the scratch parent; the runner owns a
  per-run subdir under it and deletes only that. No `os.tmpdir()` fallback
  in production code — context-free calls fail `bad_job` on the local tier.
- **Worker ops travel with every job**: `WorkerBlenderRunner` sends every file
  under `blender_ops/` as a blob keyed by relative path. The worker image does
  not vendor the ops, so it always runs the scripts shipped by this NodeTool
  release. A resolved local Blender binary wins over a configured worker.
- **Blender 5.x API facts (measured, not assumed)**: compositing runs
  through `scene.compositing_node_group` (legacy `node_tree` is gone,
  Math/Mix/MapRange nodes are gone); File Output nodes always write
  multilayer EXR under the factory render base, so the passes op stages
  through a pid-unique subdir and reads it back with the pure-Python
  `exr.py`; video output needs `media_type = "VIDEO"` before `FFMPEG`;
  `Fra:` progress lines are gone, so `render_animation` prints its own from
  a `render_write` handler. The staged Z pass carries 1e10 (not +inf)
  off-geometry on both engines, and the Normal pass is world-space —
  the op rewrites the EXR background to +inf, gates, and rotates in
  Python.
