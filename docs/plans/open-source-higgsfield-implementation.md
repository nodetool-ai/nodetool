# Open-Source Higgsfield — Implementation Plan

Status: draft (October 2026).
Strategy: [open-source-higgsfield.md](open-source-higgsfield.md).
Earlier go-to-market tickets: [higgsfield-alternative-gtm-tasks.md](higgsfield-alternative-gtm-tasks.md).

This plan turns the strategy's Phase 1 into tickets an agent can pick up, and
sketches Phase 2 and Phase 3 at the level needed to keep Phase 1's choices
compatible with them. Sizes are rough guesses.

## Starting point

What exists on `main`, checked when this plan was written:

| Area | Code | Relevant fact |
| --- | --- | --- |
| Camera vocabulary | `web/src/components/storyboard/cameraOptions.ts` | 38 movement strings, plus framing, lens, angle and equipment. `cameraOptions()` keeps an unknown current value as its own option. |
| Shot camera data | `CameraDirection` in `packages/protocol/src/creative.ts` | Free strings: `framing`, `lens`, `angle`, `movement`, `equipment`. |
| Shot prompt assembly | `packages/protocol/src/shot-prompt.ts` | `keyframePrompt`, `clipPrompt`, `directClipPrompt`, `clipPromptFor`. Movement and equipment go into clip prompts as plain words. |
| Screenplay camera pass | `web/src/lib/storyboard/cameraPass.ts` | Offers the `*_OPTIONS` lists to the model as vocabulary. |
| Direct generation | `generate_media` RPC, `generateMediaDataSchema` in `packages/protocol/src/ws-commands.ts`, `packages/websocket/src/session/commands.ts` | Modes `image`, `image_edit`, `inpaint`, `upscale`, `outpaint`, `video`, `video_edit`, `video_extend`, `audio`, `music`. `capability: "reference_to_video"`, `entity_ids`, `reference_images`, `source_asset_id`. No preset field. |
| Chat media modes | `web/src/stores/MediaGenerationStore.ts`, `web/src/components/chat/composer/` | Twelve `MediaMode`s. Chips for model, aspect, options and cost (`MediaSettingChips.tsx`, `MediaCostEstimate.tsx`). Runs as a chat turn. |
| Shared generation scaffolding | `packages/websocket/src/session/media-generation.ts` | Chat turns and the RPC share ledger, cost and lifecycle code. |
| Generations list | `web/src/stores/GenerationActivityStore.ts`, `web/src/components/panels/generations/GenerationsPanel.tsx` | Every generation from RPC, chat or prediction, persisted client-side. |
| Model-id families | `MODEL_PROMPTING_SKILLS` in `packages/agents/src/model-prompting-skills.ts` | Regexes that map provider model ids to a model line, pinned by tests against shipped manifests. |
| Templates | `packages/base-nodes/nodetool/examples/nodetool-base/Camera Move.json`, `Camera Move Contact Sheet.json`, `Effects Gallery.json` | One workflow each, with a select input for the move or effect. |
| Start page | `web/src/components/projects/StartCreationTypes.tsx`, `StartSection.tsx`, `projectStarters.ts` | Creation-type tiles and guided-flow tiles. |
| Runtime data in packaged builds | `PACKAGE_RUNTIME_ASSETS` in `packages/config/src/package-asset-registry.ts`, `loadPackageAssetJson` | Required for JSON the bundled server reads. |
| Marketing | `marketing/src/data/competitorEntries.ts` (`slug: "higgsfield"`), `marketing/src/components/ByokCalculator.tsx`, `marketing/src/data/faqEntries.ts` | The alternatives page already has a dated cost table and preset map from the earlier spec. |
| Agent tools | `packages/agents/src/capabilities/` | `generate_video`, `animate_image` and the storyboard renders. No preset capability. |
| Precedent | [motion-design.md](motion-design.md) | Timeline animation presets are named, parameterized and agent-first. Follow the same shape. |

## Design decisions

**D1 — A preset is data, compiled on the server.** The compiler lives in a new
package, `@nodetool-ai/presets`, and runs where the generation runs: in
`media-generation.ts` for the RPC and chat turns, in the storyboard render
capabilities, and in agent tools. The web calls the same package only to show a
compiled preview. This keeps CLI, MCP and agent callers on the same behavior
as the UI, as [Harness-First Engineering](../HARNESS_FIRST.md) requires.

**D2 — Requests carry preset ids, not compiled text.** `generate_media` gains
`preset_ids?: string[]` (at most three). Chat media turns carry the same field in
the media settings they already send. The server resolves ids, compiles for the
chosen provider and model, and records the ids on the generation row so the
Generations panel and the showcase can name the preset that made a render.
Clients that send none get today's behavior.

**D3 — `CameraDirection` stays free text and gains ids.** Add
`CameraDirection.preset_ids?: string[]`. `movement` keeps a human-readable
string for display, the screenplay camera pass and older readers. When
`preset_ids` is set, render paths compile the presets and do not append
`movement` a second time. Each existing `MOVEMENT_OPTIONS` string becomes an
`aliases` entry of one camera preset, so a board saved before this change shows
the matching preset card without a migration.

**D4 — Model families come from one table.** Move the model-line regexes out
of `model-prompting-skills.ts` into `@nodetool-ai/presets` as
`modelFamily(modelId): ModelFamily | null`, and have `MODEL_PROMPTING_SKILLS`
map families to skills. One table, already tested against the shipped
manifests, decides both which prompting guide applies and which preset
fragment applies. Families: `kling`, `seedance`, `veo`, `wan`, `sora`,
`minimax`, `ltx`, `local-wan` and `default`.

**D5 — Compile rules are small and deterministic.** For each preset in stack
order, pick the family fragment or `default`. A fragment is a string (appended
as a clause) or `{ prefix?, suffix?, replace? }`. Parameters merge in stack
order. A key set by two presets with different values is a conflict. The
picker prevents conflicting stacks using each preset's `conflicts` list, and
the compiler rejects them with an error naming both presets. Only `stackable`
presets combine, and at most one preset per `slot` (`move`, `rig`, `speed`,
`look`). The compiler returns `{ prompt, params, applied, warnings }`, where
`warnings` names presets with no fragment for the family and therefore using
`default`.

**D6 — Preset files live in the repository. Preview media does not.** Preset
JSON lives in `packages/presets/catalog/<kind>/<id>.json` and ships in the
package and as a `PACKAGE_RUNTIME_ASSETS` entry. Preview loops are short,
muted WebM or MP4 files rendered by NodeTool. They are uploaded to a public
Supabase Storage bucket through the existing Supabase adapter in
`@nodetool-ai/storage` (Q1). Each preset records `preview.url`,
`preview.poster` and `preview.run`, a pointer to the checked-in run record
(workflow, model, seed, cost). This keeps tens of megabytes of video out of git
and npm while every preview stays reproducible.

**D7 — Eject builds a graph from the same compile.** `presetToWorkflow(preset,
{ model })` returns a graph: input node(s) for `inputs`, a Template node holding
the compiled prompt with the user prompt as a variable, the matching
generation node for the mode, and an Output. A preset may instead name a
hand-built graph in `workflow`. Eject uses the existing workflow creation path,
so the result opens as a normal, editable, savable workflow.

**D8 — Effects are presets with `kind: "effect"`.** An effect is a preset with
`inputs: ["image"]` and a mode (`image_to_video` or `image_edit`). The Effects
gallery is a filtered view of the catalogue. `Effects Gallery.json` stays as a
template and is regenerated from the effect presets, so its select options
cannot drift from the catalogue.

**D9 — The Create view is a workspace surface, not a chat thread.** It submits
through `generate_media`, so no thread or message rows are created, and it
reads results from `GenerationActivityStore` plus the asset list for older
renders. It reuses the composer's model, aspect, option and cost chips rather
than drawing its own.

**D10 — UI follows the primitives rules.** Preset cards, the picker and the
gallery are built from `ui_primitives` and design tokens. Preview loops render
through `VideoPlayer` with a resolved URL. Loops play on hover or focus and
stay paused under reduced motion. See [DESIGN.md](../DESIGN.md) and the
[media resolution boundary](../../web/src/components/ui_primitives/STRATEGY.md#media-resolution-is-the-rendering-boundary).

## Preset schema

The Zod schema in `packages/presets/src/schema.ts` is the source of truth. The
JSON Schema exported from it is checked in for external pack authors.

```ts
export const presetSchema = z.object({
  id: z.string().regex(/^(camera|look|effect|studio)\.[a-z0-9-]+$/),
  version: z.literal(1),
  kind: z.enum(["camera", "look", "effect", "studio"]),
  name: z.string().min(1),           // English source, translated in the web i18n files
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  slot: z.enum(["move", "rig", "speed", "look", "effect"]).optional(),
  modes: z.array(z.enum(["video", "image_to_video", "reference_to_video", "image", "image_edit"])).min(1),
  inputs: z.array(z.enum(["text", "image", "video"])).default(["text"]),
  stackable: z.boolean().default(false),
  conflicts: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),   // legacy MOVEMENT_OPTIONS strings
  prompt: z.record(z.string(), fragmentSchema), // "default" is required (refine)
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  families: z.array(z.string()).optional(),    // tested families; others fall back to "default"
  preview: z.object({ url: z.string().url(), poster: z.string().url(), run: z.string() }).optional(),
  workflow: z.string().optional(),
  author: z.string().optional()                // community packs, Phase 3
});
```

## Package layout

```
packages/presets/
  catalog/camera/*.json        # Phase 1: 40 camera presets
  catalog/effect/*.json        # Phase 1: 20 effects
  catalog/look/*.json          # Phase 2
  runs/<id>.json               # preview run records (workflow, model, seed, cost)
  src/schema.ts                # Zod schema, exported JSON Schema
  src/catalog.ts               # loadCatalog(), getPreset(id), byAlias(text), filter by kind/mode
  src/families.ts              # modelFamily(modelId), moved from agents
  src/compile.ts               # compilePresets(ids, { modelId, mode, prompt })
  src/eject.ts                 # presetToWorkflow(preset, { model, mode })
  tests/
```

Dependencies: `zod` and `@nodetool-ai/protocol` only. Both the web and the
server import it, so it must not pull in runtime or Node-only modules. Add it
to the dependency order and packed-consumer checks in
[packages/AGENTS.md](../../packages/AGENTS.md#package-dependency-order).

## Phase 1 tickets

### Dependency graph

- **P1** Preset package, schema, families, compiler — no blockers
- **P2** Camera catalogue (40 presets) and aliases — blocked by P1
- **P3** Server wiring: `generate_media`, chat turns, generation records — blocked by P1
- **P4** Agent capability and CLI — blocked by P1, P3
- **P5** Preview rendering pipeline and run records — blocked by P2, P3
- **P6** Preset card and picker primitives — blocked by P1
- **P7** Shot editor picker and storyboard render path — blocked by P2, P6
- **P8** Composer preset chip — blocked by P3, P6
- **P9** Eject to workflow — blocked by P1
- **P10** Effects catalogue and gallery — blocked by P3, P5, P6, P9
- **P11** Create view — blocked by P3, P6, P8
- **P12** Alternatives page, calculator and FAQ — blocked by P5, P10
- **P13** Documentation — blocked by P7, P8, P10, P11

P1 to P4 and P6 can run in parallel after P1 lands. P5 renders on Dreamina,
whose spend is approved (Q2), and needs a signed-in Dreamina tab reachable
through the browser extension.

### P1: Preset package, schema, model families and compiler

Size: 3–4 days.

Status: done.

- Create `packages/presets` with the layout above, a README and the `AGENTS.md`
  overlay entry required by the backend rules.
- Move the model-line regexes from `packages/agents/src/model-prompting-skills.ts`
  into `src/families.ts`. Keep `MODEL_PROMPTING_SKILLS` behavior identical and
  keep its existing test passing unchanged.
- Implement `compilePresets` per D5, `loadCatalog` with schema validation, and
  `byAlias` (case-insensitive exact match on `aliases` and `name`).
- Register the catalogue with `PACKAGE_RUNTIME_ASSETS` and load it through
  `loadPackageAssetJson` on the server.

Acceptance:

- Unit tests cover fragment selection per family, `default` fallback with a
  warning, prefix, suffix and replace fragments, stack order, the three-preset
  limit, one preset per slot, param conflicts, unknown ids and a non-stackable
  preset in a stack.
- A catalogue test loads every file, validates it, checks that ids are unique,
  that ids match file paths, that aliases are unique across presets, and that
  it inspected at least one file.
- `families.test.ts` pins each family against model ids taken from the fal,
  Kie, Replicate, Higgsfield and AtlasCloud manifests, in both directions.
- `seedance` also matches the Dreamina ids in
  `packages/runtime/src/providers/dreamina-models.ts`
  (`dreamina_seedance_45_pro`, `dreamina_seedance_40`, and others), which the
  current `/seedance-2(?!\d)/` pattern misses. Keep the prompting-skill
  mapping correct for those ids too.
- Prove the catalogue test fails on a deliberately invalid preset, then restore.

### P2: Camera catalogue and aliases

Size: 3 days for the files, more for tuning in P5.

Status: done.

- Write 40 camera presets. Start from the 38 `MOVEMENT_OPTIONS` strings: merge
  near-duplicates (`slow push in` and `push in slow`, `orbit` and `360 orbit`)
  into one preset with both strings as aliases, and add the rest from the
  strategy (speed ramp, Dutch roll, arc, parallax slide).
- Give each preset `default`, `kling`, `seedance`, `veo` and `wan` fragments.
  Use the per-line prompting skills in `packages/system-skills/` as the
  reference for phrasing.
- Keep `MOVEMENT_OPTIONS` exported, derived from the catalogue (`name` of each
  `slot: "move"` camera preset plus remaining aliases), so `cameraPass.ts` and
  the CSV parser keep working.

Acceptance:

- Every current `MOVEMENT_OPTIONS` string resolves with `byAlias`. A test
  pins this against the list as it stands before the change.
- `cameraPass` and `parseShotlistCsv` tests pass unchanged.

### P3: Server wiring

Size: 3 days.

Status: done.

- Add `preset_ids` to `generateMediaDataSchema` and to the chat media settings
  the composer sends. Validate the count and the ids at the boundary and return
  `{ error: "Unknown preset: <id>" }` in the existing style.
- In `media-generation.ts`, compile before the provider call, using the
  resolved provider model id. Apply `params` only to fields the mode accepts.
  Record `preset_ids` and compile `warnings` on the generation record.
- Add `preset_ids` to the generation record schema in `packages/models`
  (SQLite and Postgres) and to `GenerationActivityStore` entries.
- Confirm that image-to-video through `generate_media` exists (mode `video`
  with `source_asset_id`). If it does not, add it here, because the Create view
  and the Effects gallery need it.

Acceptance:

- Websocket tests send `preset_ids` through the RPC and a chat turn and assert
  the prompt the fake provider receives, for two model families.
- A request without `preset_ids` sends the same prompt as before (snapshot).
- A boundary test covers an unknown id, four ids and a conflicting stack.

### P4: Agent capability and CLI

Size: 2 days.

Status: done.

- Add a `presets` capability module with `list_presets` (filter by kind, mode
  and family), `get_preset` and `compile_presets`. Add `preset_ids` to
  `generate_video`, `animate_image`, `generate_image` and `edit_image`.
- Add `nodetool presets list|show|compile|eject` in an existing CLI command
  feature (`cli-models` or a new `cli-presets` if it would pull new
  dependencies into a lean package).
- Register a harness selfcheck in `packages/cli-harness/src/harness/registry.ts`
  that compiles every preset for every family and fails on an empty prompt.

Acceptance:

- `nodetool presets compile camera.bullet-time --model <kling id>` prints the
  compiled prompt and params. A test covers it.
- `npm run dev:nodetool -- harness gate --base origin/main --dry-run` selects
  the new selfcheck when a catalogue file changes.

### P5: Preview rendering pipeline and run records

Size: 1 week, mostly render and review time.

Status: done. All 60 presets have a published preview: 480p draft renders for the camera and image-to-video presets, and before-and-after loops for the three image-edit effects.

- Add `scripts/presets/render-previews.mjs`: for each preset without a current
  preview, build the eject graph, run it with `nodetool run` against a fixed
  source image and seed, write the run record to
  `packages/presets/runs/<id>.json` and the media to a local output directory.
- Render on the Dreamina provider (Q2). Draft and retune on
  `dreamina_seedance_45_pro_draft` (480p), and render the final preview on
  `dreamina_seedance_45_pro`. This means previews are tuned on the `seedance`
  family first. The other families compile from their own fragments but have
  no preview until a later pass.
- Dreamina runs through the user's signed-in Chrome tab. The script checks
  the extension connection before starting, renders sequentially, and resumes
  from the run records after a stall (`ExtensionTabStallError`).
- A second step encodes a 2–3 second muted loop and poster, uploads them to the
  Supabase previews bucket, and writes `preview` into the preset file.
- Review every preview by hand. A preset whose preview does not show the move
  is retuned or dropped. The strategy prefers forty good presets to more.

Acceptance:

- Every Phase 1 camera and effect preset has a preview and a run record.
- The run record carries model, seed and the Dreamina credits spent.
- Dreamina credits are not a list price, so these records cannot back the
  BYOK figures on the marketing page. P12 takes those from separate runs on
  BYOK providers.

### P6: Preset card and picker primitives

Size: 3 days.

Status: done.

- `ui_primitives/PresetCard`: poster, hover or focus loop through `VideoPlayer`,
  name, family support badges, cost hint from the existing cost estimate hook.
- `ui_primitives/PresetPicker`: searchable grid, kind and tag filters,
  multi-select up to three with slot and conflict rules from the package,
  keyboard navigation, selected chips with remove buttons.
- Add web i18n keys for preset names and descriptions, generated from the
  catalogue so English stays in sync.

Acceptance:

- Component tests for selection limits, conflict disabling, keyboard use and
  reduced motion.
- Design-token lint passes with no raw values.

### P7: Shot editor picker and storyboard render path

Size: 3–4 days.

Status: done.

- Replace the Movement select in `ShotEditTable.tsx` with a field that opens
  `PresetPicker` filtered to `kind: "camera"`, and still accepts free text.
  Selecting presets writes `camera.preset_ids` and sets `camera.movement` to the
  joined preset names.
- In `shot-prompt.ts`, accept an optional compiled camera clause in
  `ShotPromptContext`. The storyboard render capabilities compile
  `camera.preset_ids` for the chosen model and pass the clause in, and drop
  `movement` from the prompt when they do.
- Show the compiled clause in `ShotPromptPreview.tsx`.
- Update `shotDraft.ts`, `storyboardAgentBridge.ts` and the storyboard agent
  tool schemas so agents can set `preset_ids`.

Acceptance:

- A board saved before the change opens with matching preset cards selected.
- A render test asserts the clip prompt for one shot with two stacked presets
  on two families.
- Free-text movement still renders exactly as before (snapshot).

### P8: Composer preset chip

Size: 2 days.

Status: done.

- Add a preset chip to `MediaSettingChips.tsx` for `video`, `image_to_video`
  and `reference_to_video`. It opens `PresetPicker` filtered to presets whose
  `modes` include the current mode.
- Store the selection per mode in `MediaGenerationStore` and send it as
  `preset_ids`.
- Show a warning in the chip when the selected model falls back to `default`
  for a preset.

Acceptance:

- Store and component tests for selection, mode switching and the request
  payload.

### P9: Eject to workflow

Size: 2–3 days.

Status: done.

- Implement `presetToWorkflow` per D7, validated with `validate_workflow` in
  tests for every preset in the catalogue.
- Add "Open as workflow" to the preset card menu and to each Generations panel
  entry that carries `preset_ids`. Both create a workflow through the existing
  creation path and open it in a tab.

Acceptance:

- Every ejected graph passes `nodetool validate`. A selfcheck runs this.
- One ejected graph runs with `nodetool debug` against the fake provider in
  tests.

### P10: Effects catalogue and gallery

Size: 1 week including tuning.

Status: done.

- Write 20 effect presets. Start from the 12 options in `Effects Gallery.json`
  and add eight more. Exclude face swap and real-person effects (strategy risk
  "Safety").
- Add an Effects gallery surface: a grid of effect cards, one image drop target,
  model chip defaulting through the existing model defaults, run through
  `generate_media`, result shown in place and in Generations.
- Add an Effects tile to `StartCreationTypes.tsx` and an entry under **+ New**.
- Regenerate the `Effects Gallery.json` options from the catalogue with a
  script, and add a `--check` mode that fails on drift, so the template cannot
  fall out of sync.
- First result with no setup: on Cloud, hosted credits. On desktop, default to
  a local WAN model through WAN2GP when it is installed (Q3), and otherwise
  show the provider setup banner (`ModeProviderSetupBanner.tsx`). Confirm
  which WAN2GP image-to-video model renders the effects acceptably on a
  consumer GPU before making it the default.

Acceptance:

- Playwright test: open the gallery, drop the fixture image, pick an effect,
  render with the fake provider, see the result in the gallery and Generations.
- [UX Guidelines](../UX_GUIDELINES.md) for entry points, model defaults, empty
  states and errors are met and listed in the pull request.

### P11: Create view

Size: 1 week.

Status: done.

- Add a `create` workspace tab type and `CreateSurface`. The top is a prompt bar
  built from the composer's chips (mode, model, preset, aspect, duration,
  batch 1–4, cost). The body is a grid of generations from
  `GenerationActivityStore`, newest first, with older renders from the asset
  list query.
- Batch sends N `generate_media` requests with distinct seeds where the model
  takes one.
- Each grid item offers Open, Download, Retake with the same settings, Send to
  storyboard, Send to timeline and Open as workflow.
- Add Create under **+ New** beside the existing image and video chat modes
  (Q4). The chat modes stay unchanged.

Acceptance:

- Component and store tests for batch submission and the grid feed.
- Playwright test: generate twice with the fake provider and see both in the
  grid after a reload.

### P12: Alternatives page, calculator and FAQ

Size: 3 days, plus legal review.

Status: not started.

- Extend the `higgsfield` entry in `competitorEntries.ts` with a presets section
  linking to the preset catalogue and the eject demo clip.
- Add a credit vs BYOK mode to `ByokCalculator.tsx`: inputs are plan, clips a
  month and model. Figures come from a dated data file with source links. BYOK
  figures come from run records of the same shots on BYOK providers at list
  price, rendered for this ticket. The Dreamina preview runs do not qualify.
- Add an "open-source Higgsfield alternative" FAQ entry in `faqEntries.ts`.
- Log trademark review in `marketing/LEGAL_OPEN_ITEMS.md`.

Acceptance:

- `npm --prefix marketing run seo:check`, `typecheck` and `lint` pass, and the
  generated artifacts are in sync.
- Every figure on the page traces to a dated source or a run record.

### P13: Documentation

Size: 2 days.

Status: done.

- New `docs/presets.md`: what a preset is, how compile works per family,
  how to eject, how to write one, and the CLI and agent tools.
- Update [storyboard-editor.md](../storyboard-editor.md#edit-a-shot),
  [harnesses.md](../harnesses.md) and the capability table in
  [docs/AGENTS.md](../AGENTS.md#built-in-capabilities).
- Mark this plan's tickets done as they land.

## Phase 2 tickets

Phase 1 has shipped except P12, so the Phase 2 outline is now these tickets.
Region edit stays out of scope until a mask track design exists.

### Dependency graph

```
P14 Look schema and catalogue ──┬── P15 Looks in storyboard and composer
                                ├── P16 Studios on the start page
                                └── P20 Look and restyle previews
P17 @ entities in prompt boxes
P18 Lipsync studio ───────────────── P16 (lists it as a studio)
P19 Video restyle presets ───────── P20
```

### P14: Look schema and catalogue

Status: done.

- Add the look slots `body`, `stock`, `grade`, `lighting`, `era` and `ramp` to
  the preset schema. One preset per slot in a stack, as for camera slots.
- Let a preset scope params to families, so a look can set `fps` or
  `negative_prompt` only for models that accept them. Params a family does not
  accept are dropped with a warning, not sent.
- Write at least 24 look presets in `catalog/look/` with fragments for each
  tested family. Regenerate `preset-catalog.json`.
- Looks have no previews until P20. The catalogue test requires previews for
  camera and effect presets only until then.

Acceptance: compiler tests for a look stacked with camera presets on two
families, and for a family-scoped param dropped on a model that lacks it.

### P15: Looks in storyboard and composer

Status: done.

- Board-level `look_preset_ids` on the storyboard document and a per-shot
  override `shot.look_preset_ids`. An empty override inherits the board's.
- Compile looks into keyframe and clip prompts through `ShotPromptContext`,
  beside the compiled camera clause. Show the look clause in
  `ShotPromptPreview.tsx`.
- A board look picker in the storyboard (next to the board style controls) and
  a per-shot override in the shot editor, both `PresetPicker` filtered to
  `kind: "look"`.
- The composer preset chip offers looks for the modes they list.
- Agent tool schemas (`edit_storyboard`, storyboard bridge) can set both fields.

Acceptance: render-path test for a board look, a shot override and a camera
preset on one shot. Store and component tests for both pickers.

### P16: Studios on the start page

Status: done.

- `kind: "studio"` presets. A studio names its target (a guided flow, a
  starter skill, a surface such as Effects or Lipsync, or an app) and the
  preset ids it shows inside it. No new engine.
- Start page tiles with outcome names, read from the studio catalogue, opening
  the target with its presets preselected where the target supports that.

Acceptance: a test that every studio's target and preset ids resolve.
Component test for the tiles.

### P17: @ entities in prompt boxes

Status: done. Prompt boxes that keep their own entity list take the entity
there: the storyboard shot's **Description**, **Motion** and **End** fields add
it to the shot's cast, and the timeline Generate dialog adds it to a video
clip's reference entities. Boxes with no entity field (the sketch prompts and
the timeline inspector's image and video prompts) write the `entity://<id>`
token the chat composer writes, which `generate_media` expands. Sound prompts
have no picker.

- Reuse `useTextareaAssetMention.tsx` in the storyboard shot prompt fields,
  the sketch generation brief and the timeline generation prompt boxes.
- A mentioned entity is attached the same way the chat composer attaches it.

Acceptance: component tests for one prompt box per surface.

### P18: Lipsync studio

Status: done.

- A surface that takes an entity or image, a line of text, a voice and a
  lipsync model, and renders a clip: speech first, then the audio-to-video
  mode. Reuse the speech path behind `voice_script_lines` and the
  `audio_to_video` mode.
- A consent check: when the user marks a reference image as a real person, the
  run requires a confirmation that they have the person's consent, recorded
  with the generation.
- Entry from **+ New** and a start page tile. Results land in Generations.

Acceptance: store and component tests for the flow and the consent gate. A
Playwright test against the fake provider.

### P19: Video restyle presets

Status: done.

- Add `video_edit` to the preset modes. Write at least eight restyle presets.
- `generate_media` with `video_edit`, the chat retake mode and the agent video
  edit path accept `preset_ids`. Eject builds a video-edit graph.

Acceptance: compile and eject tests for every restyle preset. Request payload
test for the retake mode.

### P20: Look and restyle previews

Status: done. Restyles render as Seedance reference-to-video on the dolly-in preview, because Dreamina has no video-to-video mode.

- Render and publish previews for the P14 looks and the P19 restyle presets
  through `scripts/presets`, then require previews for every kind again.

## Phase 3 tickets

Phase 2 has shipped, so the Phase 3 outline is now these tickets.

### Dependency graph

```
P21 Preset packs ──── P22 Pack authoring and registry
P23 Local-first presets ──── P24 Local tuning and previews (needs a Wan2GP server)
P25 Eject everywhere
P26 Showcase
P27 Shared projects (needs the multiplayer design reviewed)
```

### P21: Preset packs

- A preset pack is a directory of preset files plus a manifest, installed
  through the pack manager as a new pack kind. It holds data only: installing
  one runs no scripts, and a pack preset cannot name a `workflow` graph.
- Pack presets join the catalogue at runtime on the server and in the web, and
  ids must not collide with the built-in catalogue or another pack. Removing a
  pack removes its presets. A saved board or request that names a removed preset
  gets a clear error rather than a silent drop.
- Cards show `author`. Remote preview URLs must be `https` and go through the
  media resolution boundary. Agent tools and the CLI list pack presets.

Acceptance: install, list, compile and remove one fixture pack end to end. Tests
that reject a pack with a script, a `workflow` field, a colliding id or a
non-`https` preview.

### P22: Pack authoring and registry

- `nodetool presets pack init` and `pack validate`, using the same checks as
  installation.
- Browse and install packs from a registry index at a configured URL. Publishing
  is a pull request to the registry repository. Creating that repository is a
  separate decision and is not part of this ticket.
- A guide for pack authors.

Acceptance: `pack validate` fails on each invalid fixture. Browse and install
work against a local fixture index.

### P23: Local-first presets

- Map real Wan2GP model ids to the `local-wan` family. The current pattern only
  matches ids that start with `local-wan`, and no Wan2GP model has such an id.
  The [nodetool-wan2gp](https://github.com/nodetool-ai/nodetool-wan2gp) provider
  adapter reports provider `wangp` and uses `model_type` as the id, which is the
  stem of a file in Wan2GP's `defaults/` directory: `t2v`, `i2v`, `t2v_2_2`,
  `i2v_2_2`, `ti2v_2_2`, `ti2v_2_2_fastwan`, `t2v_1.3B`, `fun_inp_1.3B`,
  `fun_camera_1.3B` and others. A Wan2GP server also offers models outside the Wan
  line, such as `ltx2_*` and `hunyuan_*`, so match only Wan model types.
- Write a `local-wan` fragment for every camera and effect preset, following the
  `wan-2-6-prompting` skill. Do not add `local-wan` to a preset's `families`
  until P24 has tested it.

Acceptance: compile tests for every camera and effect preset on a Wan2GP model
id.

### P24: Local tuning and previews

Needs a running Wan2GP server. Tune the P23 fragments, render previews on the
local runtime and add `local-wan` to `families` for each preset that passes.

Tested on an RTX 3060 with 12 GB of VRAM through the pack nodes:
`ti2v_2_2_fastwan` at 832x480, 49 frames and 3 steps takes about 49 s for text to
video and 73 s for image to video. Wan2GP must be at commit `362c3467`, the one
the pack's `Dockerfile.combined` pins. Current upstream restructured its MCP tools
and the pack cannot generate against it.
This also answers Q3: which Wan2GP model, if any, becomes the local default.
NodeTool may connect to a Wan2GP server the user runs, but WanGP's license does
not allow embedding it in a paid product without a separate license, so check
the [notice](https://github.com/nodetool-ai/nodetool-wan2gp/blob/main/NOTICE.md)
before any bundling.

### P25: Eject everywhere

- Every generation that used presets can open as a workflow: storyboard stills
  and clips, Create, Effects and restyles. A storyboard render records the camera
  and look ids it compiled, and the shot and its takes offer **Open as workflow**.
- Lipsync runs eject to a speech and lipsync graph.

Acceptance: an ejected graph for a storyboard clip with stacked camera and look
presets passes `nodetool validate` and matches the prompt the render sent.

### P26: Showcase

- A marketing page lists preset runs with preset and model, generated from
  `packages/presets/runs` and the catalogue with a `--check` drift mode.
- The page shows only facts the records hold. It leaves out local paths and
  Dreamina credits, which are not a list price.

Acceptance: `npm --prefix marketing run seo:check`, `typecheck` and `lint` pass,
and the generated data is in sync.

### P27: Shared projects

Follows [multiplayer-design.md](../multiplayer-design.md). That design is still a
draft awaiting review, so this ticket starts after that review.

## Verification

Each ticket runs the mandatory checks from the root
[AGENTS.md](../../AGENTS.md#mandatory-post-change-verification): `npm run
test:affected`, `npm run typecheck`, `npm run lint` and `npm run dev:nodetool --
harness gate --base origin/main`. The new package needs `npm run
build:packages` before the gate.

## Decisions on open questions

- **Q1 — Preview hosting.** Supabase Storage, through the existing Supabase
  adapter in `@nodetool-ai/storage`.
- **Q2 — Preview budget.** Approved. Render previews on Dreamina.
- **Q3 — Local default for first run.** A WAN model through WAN2GP, subject to
  the quality check in P10.
- **Q4 — Create view versus chat modes.** Create sits beside the chat modes.
- **Q5 — Earlier Wave 2 ticket T9.** Closed. The preset-driven Effects gallery
  (P10) replaces the planned mini apps.
