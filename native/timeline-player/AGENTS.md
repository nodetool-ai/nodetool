# Native timeline player

**Navigation:** [Root AGENTS.md](../../AGENTS.md) → [Native](../AGENTS.md) → Timeline player

This module holds the timeline preview that the timeline app and the node
editor share. Read the [plan](../../docs/plans/timeline-player/plan.md) and
the [README](README.md) before changes. The [native rules](../AGENTS.md) apply.

- Code here must not include or link the timeline app, the node editor or
  editing code. `TimelineModel`, the track list models and the edit registry
  stay in `native/timeline`.
- `nodetool_timeline_scene` uses Qt Core and Yoga only.
- Keep the folder layout of `native/timeline/src`, so a moved file keeps its
  include path.
- Tests that need the timeline's fixtures or `packages/` stay in
  `native/timeline`.
- Run `python3 native/ui_primitives/tools/check_dependencies.py` after CMake
  or include changes.
