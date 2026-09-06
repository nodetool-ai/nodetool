# PRD: E6 — Game (guided flow to a Godot project)

**Status:** Draft, ready to build
**Parent:** [prd.md](prd.md) — the shell (§ 6), the shared pieces (§ 6.3), the cross-flow decisions (§ 12). Everything there holds here unless this document says otherwise.
**Tasks:** [tasks.md § P10](tasks.md#p10--game-flow)
**Builds on:** the Godot pipeline in [docs/harnesses.md § Godot game pipeline](../harnesses.md#godot-game-pipeline-templates-slot-nodes-project-export), the `godot-game` skill (`.claude/skills/godot-game/SKILL.md`), and the graph path sketched in [graph-resources/design.md § 4.5](../graph-resources/design.md).

---

## 1. Summary

The New Project surface gains a sixth entry card, **Game**. It opens the same
three-step shell as the other flows: an Idea step, a Design step that picks
the Godot template and shows the written design as editable text before
anything is spent, and a Look step with pixel-art style presets and the
models each slot kind needs. `Build your game` places a slot-filling
workflow graph on the canvas, runs it once, and the graph's last node exports
a Godot 4.3 project into the workspace and verifies it headlessly when a
Godot binary is present.

The flow lands in the node editor, the way the Workflow flow does, with a
game checklist in the agent panel: assets checked, project exported, verified
or not, and the play-test hand-off to the project agent.

Nothing below the new chrome is invented. The templates, the slot manifest,
the five `nodetool.game.*` checker nodes, the resource writer, the headless
runner, and `export_godot_project` all exist. This PRD adds one flow, one
pure graph builder, one node (`ExportGodotProject`) that wraps the existing
export join so a graph can call it, six style presets, and four tools.

## 2. Why a graph and not an agent run

The `godot-game` skill already drives the pipeline from chat, one slot at a
time, with the agent choosing when to regenerate. That is the right shape for
a playtest loop and the wrong shape for a first build: a creator who clicked
a card wants one button, one cost line, and one thing they can re-run.

A workflow graph gives all three. Every slot is a fixed chain the manifest
determines (generate, resize to the slot's exact pixels, check, stamp), so
the graph is built without a model call; the cost is slot counts times unit
prices; a re-run regenerates; and `nodetool debug` runs the same graph
headlessly. The agent stays the playtest partner (§ 7.4 of the skill) and
takes over from the exported directory.

## 3. Entry orders

| Entry | Who | Path |
| --- | --- | --- |
| One sentence | Anyone who wants a playable prototype | Idea → Template → Design review → Look → canvas, running |
| Template first | Someone who knows the loop they want | Idea (template card in the alternatives) → Design review → Look → canvas |
| Blank template | Someone who will fill art by hand | Idea → canvas with the export node only, stage `done`; the project runs with placeholder art |
| Skill or plain prompt | Returning creator | `Start`, unchanged, never enters the flow |

## 4. Steps

### 4.1 Step 1 — Idea

Heading **"What's your game?"**, subline "Tell us the premise. We'll pick a
template, write the design, and fill every asset slot." Placeholder: "One
sentence is enough: who you play, what you do, and what stops you."

Inspiration chips (each carries a pinned design so a keyless install can walk
the whole flow, as the Workflow flow's chips carry a pinned plan):

- "A fox platformer through an autumn forest" (platformer)
- "A top-down dungeon crawl with slimes and a locked door" (topdown)
- "A neon shoot-em-up over a rain-soaked city" (shmup)

Alternatives (`AlternativesColumn`):

- **Start from a template** — the three template cards inline. Picking one
  writes `template` and moves to the Design step with that card selected.
- **Export a blank template** — picks a template, writes stage `done`,
  places only the `ExportGodotProject` node with no slot inputs, and runs it.
  The result is the template with its placeholder art: a project that runs
  in Godot today. The Look step is skipped because nothing is generated.
- **Tutorial** — the existing tutorials entry.

`Continue` writes `brief` and stage `template`.

### 4.2 Step 2 — Design

**Template.** Heading "Choose your game's loop". Three `OptionCardGrid`
cards from `list_game_templates`, one per shipped template, with card art
(§ 6.3), one line, and a `meta` line reading the manifest: "8 slots · 3
hook scripts". Copy:

| Card | Line |
| --- | --- |
| Platformer | Run, jump and stomp across a side-scrolling level. |
| Top-down | Explore a room-by-room world from above. |
| Shoot-em-up | Fly, dodge and shoot through waves of enemies. |

A designer model picker sits under the grid, the same `language` model
picker the Workflow flow's category step shows for its planner. The picked
model is stored on the document (`designer_model`) so a reload designs with
it.

`Write the design` runs the designer (§ 5.2) and moves to the review on
success. On failure the stage stays `template` and the error shows on the
button. Coming back to this step with a design that still answers the brief
and the template on screen, the button reads `Continue to your design` and
keeps it.

**Review.** `PlanReview` over the design, one section each, every field
editable inline and written back to the document on change:

| Section | Content |
| --- | --- |
| Title | One line. |
| Premise | Two or three sentences. |
| Core loop | What the player does every ten seconds. |
| Player verbs | A list: move, jump, shoot. |
| Enemies | One entry per enemy slot in the manifest: name, behaviour. |
| Level | The first level's layout in words, referencing the tileset. |
| Win / Lose | One line each. |
| Cast | One entry per `spritesheet` slot: `name`, `descriptor` (silhouette, colours, proportions; no pose). |
| Asset prompts | One entry per manifest slot: the slot id, its kind and pixel size as read-only meta, and the prompt the generator will get. |

`Re-design` reruns the designer with the edited design as context. `Continue
to look` is enabled when every cast entry has a name and a descriptor and
every slot has a non-empty prompt; the blocked reason names the first
missing one. Stage `look`.

### 4.3 Step 3 — Look

Heading **"Choose the look and the models"**, subline "One style and one
image model for every sprite, tile and background, so the game reads as one
game."

**Style.** `PresetTileGrid` of the six shipped game style presets (§ 6.2)
plus `Add your own style`, which reuses the storyboard flow's
`AddStyleDialog`. Picking a tile writes `style_entity_id`. A style is
required.

**Image model.** One tile row from `useImageModelsByProvider` (text-to-image).
Required. The row's states follow the Workflow flow's setup step: ready,
loading, error with retry, empty with `Connect a provider`.

**Sound effects.** One tile row of the sound-effect nodes the install can
run (§ 5.3), plus a first tile `Keep the placeholder sounds`. Default is the
placeholder when no provider covers a sound-effect node.

**Music.** One tile row from `useMusicModelsByProvider`, plus `Keep the
placeholder music`. Same default rule.

**Project name.** A text field, prefilled from the design's title, written
to `project_name`. This is the Godot `config/name` and the export directory
`games/<slug>`.

**Cost line.** Beside `Build your game`: image slots × the image model's unit
price, plus the music and sound-effect prices when chosen, through
`getModelUnitPrice` from `@nodetool-ai/model-pricing`. When any chosen model
has no price the line reads "Cost unknown until the first asset returns".
The step's `generation` block names the counts: "Generates 5 images, 2 sound
effects and 1 music loop, then exports the project".

`Build your game` (§ 5.4) sets stage `done` as soon as the nodes are placed,
validates, and runs the graph once. The canvas opens immediately.

### 4.4 Landing

The node editor with the agent panel open and `GameLandingChecklist` at the
top of the panel:

| Row | Reads from |
| --- | --- |
| `Graph built · N nodes` | the build result |
| `Assets checked · k of m` | the checker nodes' completion in the run's results, live |
| `Exported · games/<slug>` | the export node's `directory` output |
| `Verified with Godot 4.3` / `Godot not found on this server — open the folder in Godot 4.3 to verify` | the export node's `verified` and `verification` outputs |
| Failures | one row per failed node, with the node's error text |

Next steps under the rows: **Open project folder** (opens a `workspace-file`
tab on `games/<slug>/project.godot`), **Download project** (the
`games/<slug>.zip` the export node writes, through the workspace download
endpoint), **Play-test with the agent** (stages a first turn for the project
agent: the design, the directory, and the skill's P4 instructions, then
opens the project overview), **Regenerate** (re-runs the graph).

A validation error or a failed run lands as the checklist's failure rows and
as the agent panel's first message with the error. Nothing is auto-fixed
without the creator's click.

## 5. Contracts

### 5.1 Document: `settings.game`

The document is a workflow, as in the Workflow flow (D19). The flow's state
is one optional bag beside `settings.setup`, so a workflow saved before this
flow existed has no `game` key and opens as today.

```ts
// packages/protocol/src/api-schemas/workflows.ts

export const gameSetupStage = z.enum(["idea", "template", "review", "look", "done"]);

export const gameCastMember = z.object({
  slot_id: z.string(),          // the spritesheet slot this character fills
  name: z.string(),
  descriptor: z.string()        // silhouette, colours, proportions; no pose
});

export const gameEnemy = z.object({
  slot_id: z.string(),
  name: z.string(),
  behaviour: z.string()
});

export const gameSlotPrompt = z.object({
  slot_id: z.string(),
  prompt: z.string()
});

export const gameDesign = z.object({
  title: z.string(),
  premise: z.string(),
  core_loop: z.string(),
  player_verbs: z.array(z.string()),
  enemies: z.array(gameEnemy),
  level: z.string(),
  win: z.string(),
  lose: z.string(),
  cast: z.array(gameCastMember),
  slot_prompts: z.array(gameSlotPrompt)
});

export const gameSetupModel = z.object({ provider: z.string(), id: z.string() });

export const gameSetup = z.object({
  stage: gameSetupStage.default("done"),
  brief: z.string().default(""),
  template: z.string().optional(),                 // manifest template id
  designer_model: gameSetupModel.optional(),
  design: gameDesign.optional(),
  /** What the stored design was written from, so the template step can tell
   *  "keep it" from "re-design". `${template}\n${brief}` as the planner's
   *  `PLAN_SOURCE_KEY` does. */
  design_source: z.string().optional(),
  style_entity_id: z.string().optional(),
  image_model: z.string().optional(),               // `${provider}:${id}` tile id
  sfx_node_type: z.string().optional(),             // registry type, or absent for placeholder
  music_model: z.string().optional(),               // tile id, or absent for placeholder
  project_name: z.string().optional()
});

export function readGameSetup(settings: unknown): GameSetup | null;
export function writeGameSetup(settings: unknown, patch: Partial<GameSetup>): Record<string, unknown>;
```

Nodes placed from a slot carry `slot_id` in the node's existing metadata
(`setupStepId` on the placement, as the Workflow flow carries its step id),
so the checklist can map a node to its slot.

### 5.2 Designer

`packages/protocol/src/game-design.ts`:

- `GAME_DESIGNER_SYSTEM_PROMPT` — writes a design for one template. It gets
  the manifest (slot ids, kinds, animations, prompts) and the brief, and must
  return one cast entry per `spritesheet` slot, one enemy per slot whose id
  starts with `enemy`, and one prompt per slot. Slot prompts are the
  subject only: no style words, no pixel size, no "sprite sheet" boilerplate;
  the graph builder adds those from the slot spec and the style.
- `buildGameDesignSchema(manifest)` — the structured-output schema with the
  slot ids pinned as enums, so a model cannot invent a slot.
- `parseGameDesign(raw, manifest)` — fills any slot the model skipped with
  the manifest's own prompt and reports what it filled.
- `GAME_INSPIRATION_CHIPS` — the three chips with a pinned design each, so
  `hasPinnedDesign` lets the flow through with no language model.

The web hook `useDesignGame` (`web/src/hooks/game/useDesignGame.ts`) is one
`generate_text` RPC with that schema, the same call shape as
`usePlanWorkflow`. It writes `design`, `design_source` and stage `review`.
It places no node and starts no job.

### 5.3 Slot prompt and graph builder (pure)

`packages/protocol/src/game-slot-prompt.ts`:

```ts
export function gameSlotPrompt(
  slot: GameSlotSpec,
  subject: string,               // the reviewed slot prompt
  style: { descriptor: string } | null,
  cast: readonly { slot_id: string; name: string; descriptor: string }[]
): { prompt: string; width: number; height: number; aspectRatio: string };
```

- `spritesheet`: width = `cell[0] × max(frames)`, height = `cell[1] ×
  animations`; the prompt names each animation row and its frame count, the
  cast member's descriptor when the slot has one, "transparent background",
  and the style descriptor.
- `tileset`: a near-square grid of `count` cells (columns = ceil(sqrt(count))).
- `image`: the slot's `size`; "seamless, tileable on the horizontal axis"
  when `seamless_x`, same for `y`.
- `sfx` / `music`: no size; prompt is the subject and the seconds.
- `aspectRatio` is the closest value in `nodetool.image.TextToImage`'s
  aspect-ratio list, so the generator produces the right shape and the resize
  step only scales.

`packages/protocol/src/game-graph.ts`:

```ts
export interface GameGraphChoices {
  imageModel: Record<string, unknown>;          // the image_model property value
  sfxNodeType: string | null;                    // a text-to-audio node type, or null
  musicModel: Record<string, unknown> | null;
  style: { name: string; descriptor: string } | null;
  projectName: string;
  directory: string;                             // `games/<slug>`
  verify: boolean;
}

export function gameGraphPlacement(
  manifest: GameAssetManifest,
  design: GameDesign,
  choices: GameGraphChoices,
  lookup: PlanNodeLookup
): WorkflowPlacement;
```

Per slot, one chain, laid out one row per slot:

| Kind | Chain |
| --- | --- |
| spritesheet | `nodetool.image.TextToImage` → `nodetool.image.Resize {width, height}` → `nodetool.game.SpriteSheet {cell_width, cell_height, animations, fps, slot_id}` |
| tileset | TextToImage → Resize → `nodetool.game.Tileset {cell_width, cell_height, count, slot_id}` |
| image | TextToImage → Resize → `nodetool.game.SeamlessImage {slot_id, check_x, check_y}` |
| sfx | `<sfxNodeType> {prompt, duration}` → `nodetool.game.SoundEffect {slot_id, seconds}`; **omitted** when `sfxNodeType` is null |
| music | `nodetool.audio.TextToMusic {model, prompt, duration}` → `nodetool.game.MusicLoop {slot_id, seconds}`; **omitted** when `musicModel` is null |

Every TextToImage node gets `entities` set to the inline style entity plus
the slot's cast member as inline `character` entities (`{type: "entity",
kind, name, descriptor}`), which the node already accepts without a
database row. Every checker's `fill` output connects to a dynamic input on
one `nodetool.game.ExportGodotProject` node named by the slot id. The
export node's `output` connects to a `nodetool.output.Output` named
`project`. Each checker's `output` also connects to a preview so the canvas
shows the asset.

The builder returns `issues` for a node type the lookup does not have and
never places a node it cannot name (D23).

### 5.4 Build

`useBuildGame` (`web/src/hooks/game/useBuildGame.ts`) mirrors
`useBuildFromPlan`: `ui_open_workflow`, then `ui_add_node` /
`ui_update_node_data` / `ui_connect_nodes` in placement order, stage `done`
once the nodes are placed, `ui_get_graph` for validation, then
`ui_run_workflow` with no params. It returns `{ nodeCount, issues,
validationErrors, run: { started, error } }`.

### 5.5 `nodetool.game.ExportGodotProject`

A new package `packages/game-nodes` (depends on `@nodetool-ai/godot`,
`@nodetool-ai/godot-templates`, `@nodetool-ai/protocol`,
`@nodetool-ai/runtime`, `@nodetool-ai/node-sdk`; re-exported through
`@nodetool-ai/base-nodes` beside the other game nodes; staged by the backend
bundle like every node package).

| | |
| --- | --- |
| Properties | `template: str` (enum from `listTemplates`), `name: str`, `directory: str` (workspace-relative, default `games/<slug>`), `verify: bool = true`, `overwrite: bool = false` |
| Dynamic inputs | one per slot, named by slot id, typed `dict`; the value is a checker's `fill` output (`{ ...SlotFill, asset_id, uri }`) |
| Outputs | `directory: str`, `files: list[str]`, `verified: bool`, `verification: dict` (the same shape `verify_godot_project` returns), `errors: list[str]`, `archive: str` (the `games/<slug>.zip` path) |

Behaviour is the existing capability's join, called rather than copied: the
layout/copy/dangling-reference/verify code in
`packages/agents/src/capabilities/godot.ts` moves to one module both the
capability and the node import (the module lives wherever the package graph
allows with no cycle; `npm run check`'s boundary check decides). A node with
no slot inputs exports the template with its placeholders (§ 4.1's blank
path). An asset that carries no fill, or a fill for another slot, is an error
naming the slot. The node also writes `<directory>.zip` so the landing's
`Download project` is one file.

Verification runs only where the workspace is local and a Godot binary is
found; otherwise `verified` is `false` and `verification.reason` says why.
The checklist shows the reason. It never reports green from a skipped
verification.

### 5.6 Style presets

`GAME_STYLE_PRESETS` in `packages/protocol/src/style-presets.ts`, six
entries, seeded as library `style` entities by the same seeder that seeds
the storyboard presets (`packages/websocket/src/lib/style-presets.ts`,
extended to take a preset list), reached through a `games.stylePresets`
procedure or a `set` argument on `storyboards.stylePresets`:

| id | Name | Descriptor gist |
| --- | --- | --- |
| `pixel-16bit` | 16-bit console | 32px cells, four-shade ramps, black outlines, warm palette, no anti-aliasing, flat lighting |
| `pixel-8bit` | 8-bit | 16px cells, three colours per sprite, hard black, primary palette, no dithering |
| `pixel-handheld` | Handheld pastel | 32px, four-tone pastel greens and creams, soft outlines, no anti-aliasing |
| `pixel-1bit` | 1-bit | two colours, dithered shading, thick outlines |
| `pixel-modern` | Chunky modern pixel | 32px, wide palette, coloured outlines, rim light, subtle dithering |
| `painted-2d` | Painted 2D | hand-painted gouache textures, soft edges, saturated mid-tones, no pixel grid |

Each descriptor ends with "transparent background for sprites, flat
lighting, no text, no watermark". Every prompt the graph builds carries the
descriptor verbatim.

### 5.7 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, template, models, style, project name, stage | new `ui_game_set_setup` |
| Design or re-design | new `ui_game_design` |
| Patch the design (a section, a cast member, a slot prompt) | new `ui_game_update_design` |
| Build from the design (place, validate, run) | new `ui_game_build` |
| Run, results, logs | existing run and job tools |

The same four operations exist server-side in
`packages/agents/src/capabilities/workflows.ts` beside the Workflow flow's
setup capabilities, with rows in the capability table.

## 6. Data and assets

### 6.1 Manifest access from the web

The web needs the manifests to render slot counts, meta lines and the
design review. `list_game_templates` is an agent capability; the flow reads
the same list through a `games.templates` trpc query
(`packages/websocket/src/trpc/routers/games.ts`) that returns
`listTemplates()` mapped to `{ id, godot, slots, hooks }`. Read-only, no
side effect.

### 6.2 Style thumbnails

Six PNG tiles under `packages/base-nodes/nodetool/assets/nodetool-base/styles/`
named `game-<id>.png`, 256×144, each drawn by a checked-in script
(`scripts/make-game-style-tiles.mjs`) from the preset's palette: a ground
band, a sky band, one blocky figure, at the preset's pixel scale. Generated
art, deterministic, no model call, under the example-board asset budget
(parent PRD R5).

### 6.3 Template card art

Three PNGs `templates/game-<template>.png`, same directory and script,
drawn from the template's placeholder assets composited at 4× so the card
reads as the loop it names.

## 7. Decisions

- **D25 — The game document is a workflow.** No sixth document type. The
  flow's state is `settings.game`; the graph is the record of what was
  built; the export directory is the deliverable.
- **D26 — The graph is built without a model call.** The designer writes
  text; the builder is a pure function of manifest, design and choices.
  Nothing an agent decides changes the chain a slot gets.
- **D27 — Placeholder audio is a valid choice.** A creator with an image
  provider and no audio provider still gets a running game. Omitted slots
  keep the template's placeholder files.
- **D28 — Verification is reported, never assumed.** A server without Godot
  says so on the checklist and hands over the folder and the zip.
- **D29 — The agent takes over after the build.** Play-test, hook edits and
  per-slot art notes go to the project agent with the `godot-game` skill's
  P4, from the exported directory. The flow does not grow a second editor.
- **D30 — Game is a workspace card, not a Studio card** (as D24 keeps Image
  and Workflow out of Studio).

## 8. Acceptance criteria

1. The Game card opens the flow; the blank-template alternative opens the
   canvas with stage `done` and an export node whose run produces a
   directory holding `project.godot`.
2. A workflow at each stage resumes at that step. A workflow without
   `settings.game` opens as today.
3. `Write the design` places no node. Every slot in the chosen manifest has
   a prompt; every spritesheet slot has a cast entry; a slot the model
   skipped is filled from the manifest and reported.
4. `Continue to look` is disabled while any cast entry or slot prompt is
   empty, with the missing one named.
5. `Build your game` places, for each shipped chip's pinned design against
   the real node registry, a graph that passes `validate_workflow`, with no
   `issues`, asserted in a suite the `game-flow` harness entry names.
6. The export node run over the filled fixture in
   `packages/protocol/fixtures/game-assets/` writes the project, the zip,
   and reports `verified: false` with a reason when Godot is absent; with
   `GODOT_BIN` set, the suite that exists for `verify_godot_project` passes
   through the node too.
7. The checklist reads asset, export and verification state from the run's
   results and never shows `Verified` without `verified: true`.
8. Every criterion also passes through the § 5.7 tools.

## 9. Risks

- **R8 — Sheet quality at exact cells.** A 1K generation scaled to 128×32
  loses detail. The resize is the floor, not the ceiling: a later phase can
  add a pixel-perfect downscale option on the checker. Accepted for the
  first build; the playtest loop regenerates slots.
- **R9 — Sound-effect nodes vary by provider.** The tile row lists the
  text-to-audio nodes whose provider is configured; the chain sets `prompt`
  and `duration` only, which every listed node has. A node whose handles
  differ is left off the row.
- **R10 — Godot absent in the cloud image.** D28. The blank-template path
  and the download keep the flow useful without verification.
- **R11 — Graph size.** A platformer manifest is 8 slots, about 26 nodes.
  Layout is one row per slot; the canvas fits it. A template with more slots
  is a scrolling canvas, not a broken one.

## Appendix A — Copy

| Where | Text |
| --- | --- |
| Entry card | Game · From a sentence to a running Godot project, assets checked. |
| Step 1 | What's your game? · Tell us the premise. We'll pick a template, write the design, and fill every asset slot. · One sentence is enough: who you play, what you do, and what stops you. |
| Step 1 cards | Start from a template · Pick the loop and skip straight to the design / Export a blank template · A running project with placeholder art, fill it later / Tutorial |
| Step 2 | Choose your game's loop · Write the design · Continue to your design · Re-design · Continue to look |
| Step 3 | Choose the look and the models · Keep the placeholder sounds · Keep the placeholder music · Build your game · Generates N images, M sound effects and a music loop, then exports the project · Cost unknown until the first asset returns |
| Landing | Graph built · Assets checked · Exported · Verified with Godot 4.3 · Godot not found on this server — open the folder in Godot 4.3 to verify · Open project folder · Download project · Play-test with the agent · Regenerate |
