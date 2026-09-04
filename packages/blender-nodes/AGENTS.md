# blender-nodes — Blender Headless Integration

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **blender-nodes**

Substrate for `nodetool.blender.*` nodes (Stage 1a): binary discovery,
the versioned job contract, the runner interface with its local
implementation, and `runBlenderJob`. No nodes yet — `BLENDER_NODES` is
empty.

- **Read only declared outputs.** `LocalBlenderRunner` stats each path in
  `job.outputs` before reading any byte; a `produced` name the job did not
  declare is ignored at warn, and nothing in `result.json` is ever opened
  as a path. `tests/runner.test.ts` pins this with a fake blender.
- **Binary discovery order**: `BLENDER_PATH`, then `blender` on PATH, then
  well-known OS locations. Floor is Blender 4.2 (`BlenderVersionError`).
- **Argv guard is a copy**: `src/argv-guard.ts` duplicates
  `refuseFlagLikeValue` from `packages/agents/src/host-binary-guard.ts`
  (no agents dependency); `tests/job.test.ts` pins both to the same
  behavior.
- **Fake blender mode travels in the filename** (`fake-<mode>.mjs`), not env:
  the runner scrubs the child environment by design.
