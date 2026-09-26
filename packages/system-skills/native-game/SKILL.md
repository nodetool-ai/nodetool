---
name: native-game
description: "Build or revise a playable 2D game in NodeTool's built-in engine, install generated assets, playtest it, and prepare a standalone web build."
---

# Build a native game

Create and edit a versioned built-in game document. The engine owns simulation,
rendering, and web export. A new game starts as a playable top-down room.

## Build and revise

1. `create_native_game {project_id, name}` creates a game and returns its full id
   and current immutable revision. `get_native_game {game_id, revision?}` reads
   that source. Resource ids may be full ids or exact 12-character prefixes.
2. Edit the returned document's scenes, entities, components, and asset bindings.
   Keep the engine schema valid. `publish_native_game
   {game_id, base_revision, document}` validates and publishes only when the
   revision is still current. On a conflict, read the current revision and
   reconcile the edits before publishing again.
3. Use `install_native_game_asset
   {game_id, base_revision, slot, binding, candidate_workspace_id?}` to install
   a staged, content-addressed image or audio asset. The staged bytes must match
   `binding.digest`. Installation keeps scene and behavior edits.
4. `playtest_native_game {game_id, revision?, seed?, inputs}` runs a fixed-tick
   replay. Each input has `pressed` actions and optional `justPressed` actions.
   Inspect the returned state and events, then revise and replay as needed.
5. `build_native_game {game_id, revision?}` writes a standalone web player for
   an owned revision under the project workspace and returns its path. Installed
   media must still exist, match its recorded digest, and use a supported format.

For a workflow-based brief, `design_game` writes its design and `build_game
{workflow_id, save?}` creates or selects the native game and stages its asset
graph. The graph's generated media are candidates until installed. A game
revision can be played in the workspace. The `nodetool game` CLI validates,
simulates, captures, and builds a standalone web player from a game document.

## Scope

The current runtime supports 2D scenes. Future 3D games will use this built-in
engine with explicit 3D scene and physics types. A glTF model is an asset, so use
`nodetool-3d-scene` to edit one. Existing external-engine source files can remain
in a workspace as files; their scripts and scenes need reconstruction in the
built-in game document to become playable.
