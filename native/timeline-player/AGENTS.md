# Native timeline player

**Navigation:** [Root AGENTS.md](../../AGENTS.md) → [Native](../AGENTS.md) → Timeline player

This module holds the timeline preview that the timeline app and the node
editor share. Read the [plan](../../docs/plans/timeline-player/plan.md) and
the [README](README.md) before changes. The [native rules](../AGENTS.md) apply.

- Code here must not include or link the timeline app, the node editor or
  editing code. `TimelineModel`, the track list models and the edit registry
  stay in `native/timeline`.
- `nodetool_timeline_scene` uses Qt Core, Yoga and [native/audio-io](../audio-io/AGENTS.md) only.
- QML here imports `NodeTool.TimelinePlayer` and `NodeTool.UiPrimitives`,
  never `NodeTool.Timeline`. `TimelineSource` is registered with QML only in
  this module. See [QML module](README.md#qml-module).
- A host that renders timelines must get the standard hooks, through the
  registrar object libraries or `nt::registerStandardHooks()`. See
  [Standard hooks](README.md#standard-hooks). A new process-wide registration
  that documents need belongs in `registerEffectHooks()`,
  `registerRender2dHooks()` or `registerPlaybackHooks()`, with a check in
  its `missing…Hooks()`.
- Keep the folder layout of `native/timeline/src`, so a moved file keeps its
  include path.
- Tests that need the timeline's fixtures or `packages/` stay in
  `native/timeline`.
- Run `python3 native/ui_primitives/tools/check_dependencies.py` after CMake
  or include changes.
