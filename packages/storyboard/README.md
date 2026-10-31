# @nodetool-ai/storyboard

Storyboard derivations, shared by the `nodetool.storyboard.*` nodes, the agent
capabilities and the board editor.

- `recastStoryboard` — the same approved board with a different cast: entities
  substituted, their names rewritten whole-word through the shot text, and only
  the takes whose prompt actually moved cleared.
- `planShotRenders` — what a render call would send per shot, and which shots
  are already up to date.
- `renderShots` — the one path that spends: generate, stamp the render record,
  write the shot back with a compare-and-set.

The pure half depends on `@nodetool-ai/protocol` and `@nodetool-ai/timeline`
only. The IO half takes a host interface, so it stays below runtime and models
in the build order.

See [AGENTS.md](AGENTS.md) and
[docs/graph-resources/design.md](../../docs/graph-resources/design.md) §3.1.

Clip plans with `camera.preset_ids` require `ShotRenderPlanOptions.presetCatalog`.
Server hosts load this through the registered presets asset, as the presets
capability does. Planning compiles only camera direction for the effective clip
model and mode. Still prompts and shots without ids keep their existing text.
Render records carry `camera_preset_ids` separately from the legacy direction
prompt hash, so a changed stack invalidates a clip without requiring the
catalogue at freshness boundaries.
