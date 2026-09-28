---
name: api-games
description: "Call nodetool.games from a code action: create or install a built-in game, read and edit its draft, write a whole generated level, generate and install art and audio into asset slots, playtest and autoplay routes, capture frames, publish a revision and build a web player. Load before the first call into nodetool.games."
---

# nodetool.games

A built-in game runs in NodeTool's own 2D engine. It has a mutable **draft**
and immutable **revisions**. Play is deterministic, so a playtest with the same
seed and inputs gives the same result. How to build one is `native-game`, and
feel, pacing and art direction are `game-direction`. This is the call
reference.

Every `id` is the full game id or its exact 12-character prefix.

| Call | Does |
| :--- | :--- |
| `create(name, {project_id})` | Creates a game in a project and seeds a playable top-down room. Answers the full id and the revision. |
| `get(id, {source, revision, view, entity_id})` | Reads the draft (default) or a revision. `view` is `outline` (default), `entity` or `full`. |
| `edit(id, ops, {base_updated_at})` | Applies ordered edits to the draft atomically. Issues come back with the op index and path. It does not publish. |
| `setDocument(id, document, {base_updated_at})` | Writes a whole document as one `set_document` edit, validated atomically. |
| `generateAsset(id, slot, kind, prompt, opts)` | Makes or imports an asset and binds it to the draft. |
| `installAsset(id, slot, binding, {base_revision, base_updated_at, candidate_workspace_id})` | Installs one staged asset. The staged bytes must match `binding.digest`. |
| `playtest(id, {source, revision, seed, inputs, assertions, capture_ticks})` | Runs up to 18,000 ticks with run-length inputs and assertions, and captures up to 8 frames. |
| `autoplay(id, {win, target_prefix, seed, player_id, max_ticks, source, revision})` | Searches for a route to a win or to an entity prefix. Answers replayable inputs, the win tick and level statistics. An exhausted budget is inconclusive. |
| `capture(id, {ticks, inputs, seed, camera, overlays, scale, sheet, source, revision})` | Renders up to 8 frames for a visual review. |
| `publish(id, {base_revision, message})` | Saves the draft as an immutable revision, only when the user asks. A stale `base_revision` is a conflict. |
| `build(id, {revision})` | Builds a standalone web player of a revision under `game-builds/<game-id>/<revision>` in the project workspace. |
| `listExamples({query, limit})`, `getExample(slug, {view, entity_id})` | Lists and reads the shipped benchmark games, such as `kindle`. |
| `installExample(slug, {project_id, name})` | Copies an example with its media into a project as a new game you own. |

## generateAsset

`kind` is `image`, `audio` (speech), `music`, `sfx` or `font`.

- Images can be prepared as aligned sprite sheets, edge tilesets or grade LUTs
  through `preparation`.
- `sfx` needs a registered sound-effect `node_type` and its `params`.
- `font` imports a TTF or OTF `input_file`.
- `reference_slot` keeps a new image in the style of an existing slot.
- `provider` and `model` pick the model. `background: true` starts it and
  answers a `generation_id`; call again with `generation_id` and the same
  preparation to finish.

## Build a level in code

Author the whole document with `@nodetool-ai/sandbox-game` and save it with
`saveGame({name, document}, {games: nodetool.games, project_id})`. Read
`nodetool.packs.docs("@nodetool-ai/sandbox-game")` first.

## The loop

1. Read an example: `getExample("kindle")`, then `view: "entity"` for the
   script and feel parameters of one entity.
2. Build or edit the draft.
3. Prove it can be finished: `autoplay(id, {win: true})`, then replay the
   route with `playtest(id, {inputs, assertions})` and a win assertion.
4. Look at it: `capture(id, {ticks, sheet: true})`.
5. Publish and build only when the user asks.
