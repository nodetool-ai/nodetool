---
name: godot-game
description: Make a complete 2D game in NodeTool and hand over a runnable Godot 4 project — pick a template (platformer, top-down, shoot-em-up), lock a cast and a pixel style, fill every asset slot the template declares with checked sprite sheets, tiles, backgrounds, sound effects and a music loop, export the project, write the gameplay hooks, and verify it under headless Godot. Use when the user asks for a game, a Godot project, a playable prototype, sprites for a game, or a game asset pack. Not for a single sprite or one sound (run the nodetool.game node directly).
---

## What makes this job type its own

A game is a Godot template with every slot filled and its hook scripts written.
The template is the contract: `list_game_templates` returns the slots it needs
(sprite sheets with named animations and frame counts, tilesets, seamless
backgrounds, sound effects, a music loop) and the scripts an agent edits after
export. Nothing is done until every slot passes its check and headless Godot
runs the smoke scene green.

Two things must not drift across the run: the **style** (one style entity, one
image model, pixel size fixed) and the **cast** (one entity per character). A
sheet generated with a different model than the tileset reads as two games.

## Run it in phases, and stop between them

Each phase ends with a report and a wait. The user approves before the next spends.

### P0 — Brief to design

1. `list_game_templates`. Pick the template whose loop matches the brief; say why.
2. Write `design.md` into the workspace with `write_file`: premise, core loop,
   the player's verbs, enemies, one level's layout in words, win and lose
   conditions. Keep it under a page.
3. Report the template id and its slot list. Stop.

### P1 — Cast and lock

1. `find_model {capability: "text_to_image"}` once. If the result carries a
   `prompting_skill`, `load_skill` it before writing any prompt.
2. `create_entity {kind: "style"}` with the palette and a descriptor that fixes
   the rendering: pixel art, the cell size from the manifest, no anti-aliasing,
   flat lighting, transparent background for sprites.
3. `generate_image` one reference frame per character (player, each enemy),
   seasoned through `apply_entities` with the style entity, then
   `create_entity {kind: "character"}` on each with a descriptor of silhouette,
   colours and proportions. No pose in the descriptor; pose belongs to the sheet.
4. `memory_save` the template id, the model id, and every entity id, with the
   ids in `resources`.

Report entity ids and the model id. Stop.

### P2 — Fill the manifest

One slot at a time, in manifest order. Every slot is generated, then checked
by its `nodetool.game.*` node through `invoke_node`, then accepted or
regenerated. A slot that fails twice is reported, not forced.

| Slot kind | Generate | Check node | What the check proves |
|---|---|---|---|
| `spritesheet` | `generate_image` sized `cell × frames` per row, one row per animation, prompt names each animation and its frame count, seasoned with the character and style entities | `nodetool.game.SpriteSheet {image, cell_width, cell_height, animations, fps, slot_id}` | exact cell multiple, every animation present with its frame count |
| `tileset` | `generate_image` sized `cell × columns` by `cell × rows`, prompt lists the tiles in row-major order | `nodetool.game.Tileset {image, cell_width, cell_height, count, slot_id}` | grid fits, count met |
| `image` with `seamless_x` | `generate_image` at the slot's size, prompt says tileable and names the axis | `nodetool.game.SeamlessImage {image, slot_id, check_x, check_y}` | opposite edges match within threshold |
| `sfx` | `search_nodes "sound effects"` once, then `invoke_node` on that node with the prompt and the slot's seconds | `nodetool.game.SoundEffect {audio, slot_id, seconds}` | duration within tolerance, tail faded |
| `music` | `generate_music` with `duration_seconds` from the slot | `nodetool.game.MusicLoop {audio, slot_id, seconds}` | crossfaded loop, duration within tolerance |

Pass the generated asset as `{type, uri: "asset://<id>.<ext>", asset_id}`. Each
check node stores its output as a new asset carrying the fill and returns that
`asset_id`; that is the id the export takes, not the raw generation's. Keep a
table of `slot_id → asset_id` as you go and `memory_save` it after each slot.

Report a contact sheet: every slot, its asset id, and the check result. Stop.

### P3 — Export and write the hooks

1. `export_godot_project {template, name, slots: [{slot_id, asset_id}, …]}`.
   A rejected export names the slot and the problem; fix that slot in P2 and
   re-export. Do not edit the manifest.
2. Read `design.md` and the template's hook scripts (`read_file`), then
   implement the design in them with `edit_file`: movement constants, enemy
   behaviour, the level layout in `level_01.tscn` using the tileset. Godot 4.3
   GDScript only. Change nothing outside the hook list unless a hook needs a
   new scene.
3. `verify_godot_project {dir}` after every edit round. Read the failing
   script's stderr and fix it. Stop when import, every script, and the smoke
   scene are green, and report the directory.

### P4 — Playtest loop

The user plays and reports back. A feel note ("jump is floaty") is a constant
in a hook script: edit, verify, report. An art note regenerates one slot
through P2, then calls `export_godot_project` again with the same `name` and
the full slot table; the result reports `mode: "refresh"` and the hook edits
stay in place. Never pass `overwrite: true` here, it resets the hooks to the
template.

## When Godot cannot run

`verify_godot_project` says so: no binary, or a virtual workspace. Report the
reason once, still deliver the exported directory, and tell the user to open it
in Godot 4.3 or set `GODOT_BIN` on the server. Never report green from an
export whose verification was skipped.

## Spend

Report slot counts before P2 starts. A platformer manifest is roughly eight
generations plus regenerations; a sheet that fails its cell check is the usual
retry. Afterwards `get_cost_summary` gives what the game cost.

## Brief

```
Make a [platformer / top-down / shoot-em-up] about [premise]. Stop after each
phase and wait for me.

P0. Pick the template and write design.md.
P1. Style entity: [16-bit pixel art, warm palette]. Character entities for
    [player] and [enemy]. One image model from find_model. memory_save ids.
P2. Fill every slot in the manifest, check each with its nodetool.game node,
    regenerate on failure, at most twice. Show me the contact sheet.
P3. Export, implement the hooks from design.md, verify_godot_project until
    green. Give me the directory.
P4. I play, you fix.
```
