# Graph Resources — Technical Design

> Status: shipped, phases 1–5. Companion: [tasks.md](tasks.md).
> Precedent: [script-storyboard-link/design.md](../script-storyboard-link/design.md)
> for the "pure functions in a shared package, consumed by editor, agent tools
> and nodes alike" pattern this design continues.

## 0. The problem in one paragraph

Storyboards, scripts, timelines and entities are the documents a director
approves. Workflow graphs are the thing that re-runs. Today the two do not
meet: a graph can read a script or a timeline (`ScriptRef`, `TimelineRef`,
`nodetool.script.*`, `nodetool.timeline.*`) but there is no `StoryboardRef`,
no `entity` value type, no `nodetool.storyboard.*` and no `nodetool.entity.*`.
The creative nodes (`Director`, `ScreenplayShots`, `ApplyEntities`) pass
screenplays and entities as untyped dicts and never touch a persisted board or
the entity library. So every variant of an approved piece is re-directed by
chat, which is exactly the work an ecommerce, marketing or game customer wants
to stop paying for. The design makes the four documents typed graph values,
adds the nodes that copy and fill them, and keeps the template the human
approved read-only.

One sentence: **approve once in the editor, re-run many times in a graph.**

## 1. Principles

- **P1. A document enters a graph by reference, leaves as a new row.** Refs
  are `{type, id, data?}` like `ScriptRef`. Nodes that derive (recast, fill,
  retarget) create a new row and stamp lineage; they never write the source.
  A batch cannot overwrite the board a person approved.
- **P2. Pure first, IO second.** Every mapping (recast a board, fill a script,
  retarget a sequence, prompt for a slot) is a pure function in a shared
  package with a fixture test. The node, the agent capability and the editor
  call the same function.
- **P3. Re-runs are cheap by construction.** Identity is by name, not by
  row: `CreateEntity` upserts on (project, kind, name), `RecastStoryboard`
  reuses its previous copy for the same substitution, and render nodes skip a
  shot whose `render_inputs.prompt_hash` is unchanged. A monthly re-run pays
  only for what changed.
- **P4. The spend gate survives.** Stills and clips are separate nodes, clips
  refuse a shot without a selected keyframe by default, and both take
  `max_shots`. A graph can run to the stills and stop, as the storyboard loop
  does.
- **P5. No new agent tools.** The capabilities already cover headless
  editing. What is new is the node surface and the shared functions under it.

## 2. Types

### 2.1 Protocol (`packages/protocol/src/api-types.ts`, `creative.ts`)

```ts
/** Reference to a persisted storyboard, editable in the board editor and
 *  passable between workflow nodes. Mirrors ScriptRef / TimelineRef. */
export interface StoryboardRef {
  type: "storyboard";
  id?: string | null;
  /** Optional inline StoryboardDocument, for tests and the debug harness. */
  data?: unknown;
  /**
   * Set only by a node that created or derived the row in this run. A ref
   * from the picker or from LoadStoryboard never carries it (§4.2, write
   * contract).
   */
  writable?: boolean;
}
```

`Entity` already exists (`creative.ts`, `type: "entity"`, id = asset id).
It becomes a **node value type** named `entity` with no new interface. The
one addition is a lineage marker on entities a graph creates:

```ts
EntityMarker
└─ source?: { workflow_id?: string; key?: string }
   // `key` is the upsert identity a batch used (e.g. a SKU); lets a re-run
   // find its own entity even after a rename.
```

Storyboard document lineage (`packages/models/src/storyboard.ts`,
`StoryboardDocument`, mirrored in `api-schemas/storyboards.ts`):

```ts
StoryboardDocument
├─ templateId?: string | null        // board this one was recast from
└─ recastKey?: string | null         // the canonical substitution mapping
                                     // (§3.1), so a re-run finds its copy
```

Script document lineage (`packages/models/src/script.ts`):

```ts
ScriptDocument
└─ templateId?: string | null        // script this one was filled from
```

Timeline sequence lineage (`packages/timeline/src/types.ts`):

```ts
TimelineSequence
└─ templateId?: string | null        // sequence this one was retargeted from
```

All optional, all `passthrough`: old rows load unchanged.

### 2.2 Node value types

| Type name | Wire shape | Default (`ref-defaults.ts`) | Picker |
|---|---|---|---|
| `storyboard` | `StoryboardRef` | `{type:"storyboard", id:null, data:null}` | `StoryboardProperty` over `DocumentPickerProperty` (`useStoryboards`) |
| `entity` | `Entity` | `{type:"entity", id:"", kind:"prop", name:"", descriptor:""}` | `EntityProperty` reusing `EntityAssetPickerDialog` |
| `list[entity]` | `Entity[]` | `[]` | same picker, multi |
| `game_slot` | `GameSlotSpec` (protocol `game-assets.ts`) | — (output only) | none |
| `slot_fill` | `SlotFill` | — (output only) | none |

The `entities` property on `nodetool.image.TextToImage`,
`nodetool.video.ImageToVideo`, `nodetool.video.TextToVideo` and
`nodetool.creative.ApplyEntities` changes from `list[dict]` to
`list[entity]`. The runtime value is the same object, so saved graphs keep
working; the editor gains a picker and a typed handle.

**Entity resolution rule.** An `entity` value's `id` is its identity; every
other field is a cache. A consumer calls `resolveEntities(values, context)`
(`packages/runtime/src/entities.ts`): when `descriptor` is empty and the
context has `getEntity`, the library copy wins. A picked entity therefore
follows later edits in the library, and an inline entity (tests, DSL) still
works with no database.

Registration points, one line each: `web/src/config/data_types.ts` (colour,
icon), `web/src/components/node/PropertyInput.resolver.tsx`,
`packages/core-nodes/src/nodes/constant.ts` (`nodetool.constant.Storyboard`,
`nodetool.constant.Entity`), `packages/dsl/src/types.ts` (`StoryboardRef`,
`Entity`), `scripts/verify-backend-bundle.mjs` type list.

### 2.3 ProcessingContext model interfaces (`packages/runtime/src/context.ts`)

Same shape as the script trio, installed in
`packages/websocket/src/session/model-interfaces.ts` and the CLI's context:

```ts
getStoryboard:    ({userId, id}) => StoryboardResponse | null
createStoryboard: ({userId, name, projectId?, document}) => StoryboardResponse
updateStoryboard: ({userId, id, document, timelineId?, baseUpdatedAt?}) => StoryboardResponse | null

listEntities:  ({userId, projectId?, kind?, tags?, nameContains?, limit?}) => Entity[]
getEntity:     ({userId, id}) => Entity | null
upsertEntity:  ({userId, projectId?, kind, name, descriptor, imageAssetId,
                 description?, tags?, voiceId?, source?}) => Entity
               // finds (project, kind, name) or `source.key`; updates the
               // marker in place, else tags the image asset

listGameTemplates: () => { id, manifest }[]
```

`entityFromAsset` moves from `packages/agents/src/capabilities/entities.ts`
to `packages/models/src/entity.ts` so the websocket host and the agent
capability share one reader. The capability keeps its behaviour and imports
it.

## 3. Shared functions (pure)

### 3.1 `packages/storyboard` (new, depends on protocol + timeline)

Why a package: `packages/timeline` already holds `buildStoryboardTimeline`,
and protocol holds `shot-prompt.ts` and `script-link.ts`. Recast and the
render plan are storyboard-only and need both, and both `video-nodes` and
`agents` must import them. The package mirrors `packages/timeline` in role.

```ts
// recast.ts
export interface RecastInput {
  document: StoryboardDocument;      // the template, as it is now
  /** Entities on the source board, resolved. */
  boardEntities: Entity[];
  /** Incoming cast. Each replaces the board entity it targets. */
  cast: Array<{ entity: Entity; replaces?: string /* board entity id or name */ }>;
  /** The copy a previous run made for this mapping, when reusing (below). */
  existing?: StoryboardDocument;
}
export interface RecastResult {
  document: StoryboardDocument;      // new or re-derived copy, lineage stamped
  substitutions: Array<{ from: Entity; to: Entity }>;
  /** Shots whose rendered prompt changed and lost their takes. */
  invalidatedShotIds: string[];
  /** Shots whose prompt is unchanged and kept keyframe/clip versions. */
  keptShotIds: string[];
  /** Shots the template no longer has; their takes on `existing` are gone. */
  droppedShotIds: string[];
  recastKey: string;
}
export function recastStoryboard(input: RecastInput): RecastResult;
```

Rules, each pinned by a test:

- A cast entry with `replaces` targets that board entity. Without it, the
  entry replaces the single board entity of the same `kind`; if there are
  several or none, the entry is appended and nothing is renamed.
- Substitution rewrites the old name to the new name, whole word, case
  insensitive, in `action`, `motion`, `dialogue`, `narration`, `slug`, and in
  each shot's explicit `entity_ids`, and on `entityIds`/`screenplay.entity_ids`.
- Invalidation is by prompt, not by touch: for each shot the function
  recomputes `keyframePrompt` and `clipPrompt` with the new cast through
  `injectEntities`, hashes them the way `RenderInputs.prompt_hash` is written
  today, and clears `keyframe*`/`clip*`/`status` only when the hash moved. A
  product-only frame on a board whose model changed keeps its takes.
- `templateId` = source board id. `recastKey` is the **mapping**, not the
  result: one token per resolved substitution, `<sourceEntityId>><destEntityId>`,
  one per append, `+<destEntityId>`, sorted and joined with `,`. Input order
  does not matter; role assignment does. On a board with characters A and B,
  A→X, B→Y and A→Y, B→X are different keys and different copies.
- Copies keep the template's shot ids, so a later re-derive merges by id.
  `timeline_id` is not copied; the approved cut is carried by
  `AssembleTimeline` (§4.2).

**Reuse re-derives, it does not return.** With `existing` set, the function
still derives from the *current* template and the *current* cast, every
time. There is no shortcut keyed on a fingerprint: such a key would have to
cover every derivation input (template text, board entity descriptors, the
incoming entities' names and descriptors, the mapping), and the derivation
is one pass over one document. It then merges: for every shot id in both
documents the existing copy's `keyframe*`, `clip*`, `status` and
`render_inputs` are carried over, and the hash rule above decides whether
they survive. Shots new on the template appear; shots the template dropped
disappear and are named in `droppedShotIds`. So a template edit to one
shot's action invalidates that shot on every reused copy and no other; a
renamed destination entity (same id, a `CreateEntity` upsert under the same
`key`) has its new name rewritten into the shots and invalidates exactly the
shots that name it; an edited descriptor invalidates the shots it seasons,
because the descriptor is in the injected prompt. The next `only_stale`
render sees each new prompt against the old `render_inputs`.

```ts
// render-plan.ts
export interface ShotRenderPlan {
  shotId: string;
  kind: "keyframe" | "clip";
  prompt: string;
  referenceAssetIds: string[];
  model: { provider: string; model: string };
  aspectRatio: string;
  /** True when render_inputs match this plan: nothing to do. */
  fresh: boolean;
}
export function planShotRenders(
  doc: StoryboardDocument, entities: Entity[], kind: "keyframe" | "clip",
  targets?: string[]
): ShotRenderPlan[];
```

This is the logic `render_storyboard_stills` and `filterStale` run inline
today, lifted so the node and the capability plan identically. The IO half,
`renderShots(context, ref, plans)`, lives in the same package under
`io/`: it calls `context.runGeneration` with `persist`, appends the version
with `render_inputs`, and writes the board through `updateStoryboard` with a
reload-and-retry on `StoryboardConflictError` (the same posture `patchShot`
has in the capability). The capability's render tools switch to it in the
same PR so there is one render path.

### 3.2 `packages/timeline` additions

```ts
// fill-text.ts
export function fillTimelineText(
  seq: TimelineSequence, values: Record<string, string>
): { sequence: TimelineSequence; filled: string[]; unresolved: string[] };
// `{{key}}` in ClipTextStyle.text and caption text. Unresolved keys are
// reported, never blanked.

// clone.ts
export function cloneTimelineForBoard(
  seq: TimelineSequence,
  from: { boardId: string },
  to: { boardId: string }
): TimelineSequence;
// A new sequence (fresh id, `templateId` = the source sequence id). Every
// clip owned by `from.boardId` (`storyboardBoardId` matches) is re-stamped
// to `to.boardId` with its media cleared; every other clip and every track
// is copied verbatim. The next re-assemble fills the owned clips from the
// copy's renders and, through `foreignTimelineParts` (`reassemble.ts`),
// leaves the text overlay, the music bed and any other edit alone. Hand
// edits on the shot clips themselves (a trim, a moved cut) are rebuilt from
// the shots, exactly as today's re-assemble does.

// retarget.ts
export function retargetSequence(
  seq: TimelineSequence,
  aspectRatio: string,
  fit: "cover" | "contain"
): { sequence: TimelineSequence; croppedClipIds: string[] };
// frameSizeForAspect for the new canvas; clip transforms rescaled about the
// clip centre; `cover` scales to fill and reports every clip that now crops,
// `contain` letterboxes. Text clips rescale font size with the short edge.
```

### 3.3 `packages/protocol` additions

```ts
// script-fill.ts
export function fillScript(
  doc: ScriptDocument, values: Record<string, string>
): { document: ScriptDocument; filled: string[]; unresolved: string[] };
// `{{key}}` in ScriptLine.text. Takes are kept: `needsVoicing` already marks
// a line stale when its text moved, so a later VoiceScript pays only for
// changed lines.

// game-slot-prompt.ts
export function slotPrompt(
  slot: GameSlotSpec, style: Entity | null, cast: Entity[]
): { prompt: string; width: number; height: number; checker: Record<string, unknown> };
// spritesheet: width = cell.w × max frames, height = cell.h × animations;
// tileset: a near-square grid of `count` cells; image: `size`; sfx/music:
// no size. `checker` is the exact prop bag the matching nodetool.game.* node
// wants, so a graph can Switch on slot.kind and wire one node per kind.
```

## 4. Nodes

All nodes are `tagAsServer` (they need the model interfaces). Handle names
are the ones an agent will see through `search_nodes`; keep them.

### 4.1 `nodetool.entity.*` (`packages/core-nodes/src/nodes/entity.ts`)

| Node | Inputs | Outputs |
|---|---|---|
| `LoadEntity` | `entity: entity` (picker) **or** `name: str` + `kind?` | `entity`, `descriptor: str`, `name: str`, `kind: str`, `reference_image: image`, `voice_id: str` |
| `ListEntities` | `kind?`, `tags?: list[str]`, `name_contains?: str`, `project?: str` | `entities: list[entity]`; streams `entity` per item |
| `CreateEntity` | `image: image`, `kind`, `name: str`, `descriptor: str`, `description?`, `tags?`, `voice_id?`, `key?: str` (upsert identity, e.g. a SKU) | `entity`, `created: bool` |

`CreateEntity` upserts (§2.3). A batch that runs twice yields the same
entity ids twice.

### 4.2 `nodetool.storyboard.*` (`packages/video-nodes/src/nodes/storyboard.ts`)

| Node | Inputs | Outputs |
|---|---|---|
| `LoadStoryboard` | `storyboard` | `storyboard` (same ref), `shots: list[dict]`, `entities: list[entity]`, `style: str`, `aspect_ratio: str`, `name: str`, `image_model`, `video_model`, `shot_count: int` |
| `StoryboardShots` | `storyboard` | streams `shot: dict`, `index: int`, `slug: str`, `keyframe: image`, `clip: video`; `output: list[dict]` at the end (the `ScreenplayShots` contract, over a persisted board) |
| `RecastStoryboard` | `storyboard`, `cast: list[entity]`, `replaces?: list[str]`, `name?: str`, `reuse_existing: bool = true` | `storyboard` (the copy), `invalidated: list[str]`, `kept: list[str]` |
| `RenderStills` | `storyboard`, `targets?: list[str]`, `max_shots: int = 24`, `concurrency: int = 2`, `only_stale: bool = true` | `storyboard`, `keyframes: list[image]`, `rendered: list[str]`, `skipped: list[str]`, `failed: list[str]` |
| `RenderClips` | `storyboard`, `targets?`, `max_shots: int = 8`, `require_keyframe: bool = true`, `concurrency: int = 1`, `only_stale: bool = true` | `storyboard`, `clips: list[video]`, `rendered`, `skipped`, `failed` |
| `AssembleTimeline` | `storyboard`, `name?: str` | `timeline: timeline`, `skipped_shots: list[str]`, `retimed: list[dict]` |

`RecastStoryboard` with `reuse_existing` looks up a board in the same project
with the same `templateId` and `recastKey` and passes it to `recastStoryboard`
as `existing`: the copy is re-derived from the current template (§3.1), so a
template edit reaches every reused copy on the next run and nothing else is
re-rendered. The output ref carries `writable: true`.

**Write contract.** A `StoryboardRef` is read-only unless it carries
`writable: true`, and only a node that created or derived the row in this run
sets it: `RecastStoryboard`, and the render nodes on the ref they pass on.
The picker (`nodetool.constant.Storyboard`), `LoadStoryboard` and
`StoryboardShots` never set it. `RenderStills`, `RenderClips` and
`AssembleTimeline` refuse a ref without the flag with an error naming
`allow_writes`, the per-node override for a graph whose whole purpose is to
render the board a person picked. Permission does not depend on whether any
derived row exists yet, so a first-run miswire (picker → `RenderStills`)
fails before any spend, and a derived board picked from the library is as
protected as a template, whatever its lineage.

`AssembleTimeline` writes `timeline_id` on the board. When the board has no
cut yet and its template has one (`templateId` → that board's `timeline_id`),
it first clones the template's sequence for the copy (`cloneTimelineForBoard`,
§3.2), then re-assembles in place: only the shot clips are regenerated from
the copy's renders, and the text overlay, the music bed and every other
track survive. A copy therefore inherits the approved cut, not a bare
assembly. When the board is script-linked it calls `buildLinkedTimeline`, as
the capability does.

Models come from the board (`imageModel`/`videoModel`), with an optional
`image_model`/`video_model` input to override. Unset is an error naming
`find_model`, never a default.

### 4.3 `nodetool.script.*` additions (`packages/video-nodes/src/nodes/script.ts`)

| Node | Inputs | Outputs |
|---|---|---|
| `WriteScript` | `model: language_model`, `brief: str`, `format: str`, `cast: list[entity]`, `language?: str`, `pace?`, `name?: str` | `script` (new row), `line_count: int` |
| `FillScript` | `script`, `values: dict`, `name?: str` | `script` (new row), `filled: list[str]`, `unresolved: list[str]` |

`WriteScript` runs the `ScriptWriterInput` prompt from
`script-authoring.ts` and maps `cast` to speakers with `entityId` and
`voice.voice` from `voice_id`. This is the script-first path the link
design's §4 deviation asked for.

### 4.4 `nodetool.timeline.*` additions (`packages/video-nodes/src/nodes/timeline.ts`)

| Node | Inputs | Outputs |
|---|---|---|
| `FillTimelineText` | `timeline`, `values: dict`, `name?` | `timeline` (new row), `filled`, `unresolved` |
| `RetargetTimeline` | `timeline`, `aspect_ratio: str`, `fit: "cover" \| "contain" = "cover"`, `name?` | `timeline` (new row), `cropped: list[str]` |

Both create a new sequence with `templateId`; `RenderTimeline` is unchanged.

### 4.5 `nodetool.game.*` additions

`packages/image-nodes` keeps the checkers. The template and export nodes go
in a new `packages/game-nodes` (depends on `@nodetool-ai/godot`,
`godot-templates`, runtime):

| Node | Inputs | Outputs |
|---|---|---|
| `LoadGameTemplate` | `template: str` (select from `listGameTemplates`) | `manifest: dict`, `slots: list[game_slot]`; streams `slot: game_slot` |
| `SlotPrompt` | `slot: game_slot`, `style?: entity`, `cast: list[entity]` | `prompt: str`, `width: int`, `height: int`, `kind: str`, `checker: dict`, `seconds: float` |
| `ExportGodotProject` | `template: str`, `name: str`, `fills: list[slot_fill]`, `directory: str`, `verify: bool = true` | `directory: str`, `files: list[str]`, `verified: bool`, `errors: list[str]` |

The existing checkers gain a `slot: game_slot` input that fills
`cell_width`/`cell_height`/`animations`/`count`/`slot_id` from the slot, so
a `SlotPrompt → generator → checker` chain wires without hand-copied
numbers. `ExportGodotProject` calls `writeGodotProject` and, when
`GODOT_BIN` is set and the workspace is local, the same headless verify the
capability runs.

## 5. Examples, end to end

Each example ships as a workflow JSON under
`packages/base-nodes/nodetool/examples/nodetool-base/` and as a
`nodetool.fake.*`-backed fixture the harness runs without spend (§7).

### E1. Per-SKU product ads (ecommerce)

Setup, once, on the surfaces: a director builds the board "Hero 9:16" with a
`prop` entity named `Product`, a `character` entity, a style entity, both
models set, stills approved, clips rendered, cut assembled, a text clip
reading `{{name}} — {{price}}`. The board and the cut are the templates.

Graph (`Per-SKU Ad Factory`):

```
LoadCSVAssets(folder: products/)            → dataframe
ForEachRow(dataframe)                       → row {sku, name, image, descriptor, price}
LoadImageFile(row.image)                    → image
CreateEntity(image, kind: prop, name: row.name,
             descriptor: row.descriptor, key: row.sku)   → entity
Constant.Storyboard("Hero 9:16")            → template
RecastStoryboard(template, cast: [entity], replaces: ["Product"])
                                            → board'  (invalidated: shots naming Product)
RenderStills(board')                        → board'  (only stale shots render)
RenderClips(board', require_keyframe: true) → board'
AssembleTimeline(board')                    → timeline'  (clones the template cut, re-assembles
                                                          the shot clips, keeps the overlay and music)
FillTimelineText(timeline', values: {name: row.name, price: row.price})
                                            → timeline''
RenderTimeline(timeline'')                  → video
Collect(video)                              → Output "ads"
```

What it costs: per SKU, one still and one clip for each shot whose prompt
names `Product`; the style frame and any product-free shot are kept from the
template. Second run with two new rows: `CreateEntity` returns the same
entity for the eight old SKUs, `RecastStoryboard` returns the eight old
copies, `only_stale` renders nothing on them, and only the two new SKUs are
paid for. A `WebhookTrigger` on a product-created event in place of the CSV
turns it into a listener.

What it does not do: publish. The output is a list of videos. A Shopify or
ad-platform node is a separate integration (§9).

### E2. Localized explainer (marketing)

Setup: a script written on the script surface with a `character` entity
`Mara` as the narrator (`voice_id` set) and lines carrying `{{product}}` and
`{{offer}}`; a board of six b-roll shots, stills approved, no clips.

Graph (`Localized Explainer`):

```
Constant.Script("Explainer template")       → script
Constant.Entity(Mara)                       → narrator
Constant.Storyboard("B-roll")               → board
Cross(rows: offers.csv, languages: ["en","de","fr"])   → (row, lang)
WriteScript(model, brief: row.brief, cast: [narrator], language: lang,
            format: "narrator")             → script'      // or FillScript when only values change
VoiceScript(script')                        → script'      // pays per changed line
ScriptToTimeline(script')                   → timeline'
StoryboardShots(board)                      → keyframes
AddClips(timeline', clips: keyframes, image_duration_ms: 4000)   → timeline'
ScriptToSubtitles(script', format: srt)     → subtitles
RenderTimeline(timeline')                   → video
```

The board is read only; nothing renders on it. For a value-only variant
(`FillScript` instead of `WriteScript`), unchanged lines keep their takes
and `VoiceScript` voices only the lines whose text moved.

### E3. Game re-skin (gamedev)

Setup: a `style` entity `Cave Pixel` and a `character` entity `Pip`
created from an approved sprite, both in the library.

Graph (`Platformer Asset Pack`):

```
LoadGameTemplate("platformer")              → streams slot
SlotPrompt(slot, style: Cave Pixel, cast: [Pip])   → prompt, width, height, kind, checker
Switch(kind)
  spritesheet → TextToImage(prompt, width, height) → game.SpriteSheet(image, slot) → fill
  tileset     → TextToImage(...)                   → game.Tileset(image, slot)      → fill
  image       → TextToImage(...)                   → game.SeamlessImage(image, slot)→ fill
  sfx         → TextToAudio(prompt, seconds)       → game.SoundEffect(audio, slot)  → fill
  music       → TextToMusic(prompt, seconds)       → game.MusicLoop(audio, slot)    → fill
TryCatch(around each branch) → on error, one retry with the checker's message appended to the prompt
Collect(fill)                               → fills
ExportGodotProject("platformer", name, fills, directory: "game/", verify: true)
                                            → directory, verified, errors
```

A re-skin is swapping the style entity on the `SlotPrompt` node and running
again. `Cave Pixel` seasons every slot the same way the storyboard render
path seasons a shot, so the pack is consistent by construction.

### E4. One cut, three ratios

```
Constant.Timeline("Launch film 16:9 cut")        → timeline   (the approved cut, read-only)
RetargetTimeline(timeline, "9:16", fit: cover)   → t1  (new row; cropped: [...])
RetargetTimeline(timeline, "1:1",  fit: cover)   → t2  (new row)
RenderTimeline(t1), RenderTimeline(t2), RenderTimeline(timeline)
```

The graph starts from the cut, not the board. A picker ref is read-only
under the write contract, and `RetargetTimeline` derives a new row from it
without writing the source, so the approved trims and placements carry over
unchanged. Re-assembling from the board would rebuild the shot clips (§3.2).

Honest limit: a 16:9 clip cropped to 9:16 loses the sides. `cropped` names
the clips so the director can decide which shots need a real 9:16 board
(the launch-kit rule of a board per ratio still holds for hero shots).

## 6. Web

- `StoryboardProperty` and `EntityProperty` (`web/src/components/properties/`),
  registered in `PropertyInput.resolver.tsx`; `data_types.ts` entries.
- Constant nodes `nodetool.constant.Storyboard` / `Entity` in the node menu
  under the existing Timeline / Script entries.
- Output handles of type `storyboard` / `timeline` / `script` on a finished
  run open the document (the `TimelineProperty` open-in-editor affordance,
  reused).
- A board created by `RecastStoryboard` shows a "recast from <template>"
  chip in the board header, linking back. Nothing else in the editors
  changes.

## 7. Testing and harnesses

- Vitest, pure: `recastStoryboard` (targeting, whole-word rename, hash-based
  invalidation, kept takes, lineage), `planShotRenders` (fresh detection
  matches `filterStale` on the capability's fixtures), `fillScript`,
  `fillTimelineText`, `retargetSequence` (crop report, text scaling),
  `slotPrompt` (sizes per kind, checker bag matches each checker's props).
  Every suite has a case that must fail: a rename that would hit a substring
  inside another word, a placeholder with no value, a board with two
  entities of the target kind and no `replaces`. Recast fixtures also pin:
  the swapped assignment (A→X, B→Y versus A→Y, B→X) yields two keys; a
  re-run after editing one shot's action on the template, cast ids
  unchanged, invalidates that shot on the reused copy and keeps the rest;
  a re-run after renaming a destination entity under the same id, template
  unchanged, rewrites the name and invalidates only the shots naming it;
  a cloned cut keeps its foreign clips and, after `fillTimelineText`, carries
  the filled overlay text.
- Vitest, nodes: each node against a `ProcessingContext` with in-memory model
  interfaces (`testing.ts` already builds one), including the write
  contract (picker → `RenderStills` refused on a board with no children; a
  derived board picked from the library refused the same way; `allow_writes`
  admits both), the upsert returning the same id twice, and the E1 fake-mode
  run asserting the filled `{{name}} — {{price}}` overlay is present on the
  exported sequence.
- Harness registry (`packages/cli/src/harness/registry.ts`): a
  `graph-resources` entry whose selfcheck runs the suites above plus
  `nodetool debug` on the four example workflows in fake mode
  (`nodetool.fake.GenerateImage` in place of the generators; render nodes
  take a `provider` override the fixture sets to `fake`). `harness gate`
  picks it up on diffs under `packages/storyboard/`, the new node files, and
  the examples.
- `validate_workflow` on each example must pass with models stamped.
- `npm run check:agents-docs` for the new package's `AGENTS.md`.

## 8. What deliberately does not change

- The storyboard, script and timeline editors' data model beyond the three
  optional lineage fields.
- `buildStoryboardTimeline`, `buildLinkedTimeline`, `buildScriptTimeline`.
- The agent capabilities' names and arguments. `render_storyboard_stills`
  and `render_storyboard_clips` switch to `renderShots` internally; their
  outputs are unchanged and their eval cases prove it.
- `Director`, `ScreenplayShots`, `ShotBatch`, `ShotChain`: still the path for
  a graph that directs from a brief with no board.

## 9. Out of scope, named

- Publish nodes (Shopify media, YouTube/TikTok upload, Meta ad creative,
  SMTP). They are the step that makes E1 automation rather than file
  generation, and they are integration work with no dependency on this
  design. Separate design.
- Cost estimation for render nodes. `Shot.cost_estimate` is unpopulated
  today; `max_shots` is the cap this design offers.
- A `LinkedAssemble` node for a board plus script pair: `AssembleTimeline`
  handles the linked case by reading `script_id`, which covers it.

## 10. Risks

- **R1. A graph draws over the approved board.** Mitigated by P1 (derive
  nodes create rows), the write contract in §4.2 (a ref is read-only unless
  the run derived it), and the lineage chip.
- **R2. Two branches write one board.** A `ForEachRow` that fans out and
  each branch renders on the same recast copy conflicts on `revision`.
  `renderShots` reloads and retries on conflict, and `RecastStoryboard`
  gives each substitution its own row, so parallel SKUs never share a board.
- **R3. Rename collides.** "Nova" inside "Novak". Whole-word, case-insensitive
  matching with a fixture; `RecastStoryboard` reports `substitutions` so the
  run log shows what was renamed.
- **R4. Hash drift between capability and node.** If the prompt hash is
  computed in two places they diverge and `only_stale` re-renders
  everything. One function, `planShotRenders`, used by both; a test asserts
  the capability's `filterStale` output equals the plan's `fresh` set on the
  same fixture.
- **R5. `retargetSequence` on transforms with keyframes.** Keyframed
  transforms must rescale every keyframe, not just the base. Covered by a
  fixture with an animated clip and the validator run on the output.
