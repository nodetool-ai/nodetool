---
layout: page
title: "Presets"
permalink: /presets
description: "Named camera moves and effects that compile to the wording each video model understands, stack up to three at a time, and eject to an editable workflow."
---

**Navigation**: [Docs index](index.md) | [Storyboard Editor](storyboard-editor.md) | [Harnesses](harnesses.md#nodetool-presets) → **Presets**

A preset is a named, reusable piece of direction for a generation: a camera move such as a dolly zoom, or an effect such as a glass shatter. You pick it by name. NodeTool turns it into the wording the chosen model responds to best, adds it to your prompt, and records which presets made the render.

Presets are data. The catalogue is JSON in `packages/presets/catalog/`, the compiler is the `@nodetool-ai/presets` package, and every surface calls the same compiler: the shot editor, the chat composer, the Effects gallery, the Create view, agent tools and the CLI. The package README, [packages/presets/README.md](../packages/presets/README.md), documents the code API.

---

## What a preset is

| Field | Meaning |
|---|---|
| `id` | `<kind>.<slug>`, for example `camera.dolly-zoom`. Also the file name |
| `kind` | `camera`, `look`, `effect` or `studio`. The catalogue ships `camera` and `effect` presets |
| `slot` | What the preset occupies: `move`, `rig`, `speed`, `look` or `effect` |
| `modes` | Where it runs: `video`, `image_to_video`, `reference_to_video`, `image` or `image_edit` |
| `inputs` | What the preset needs from you: `text`, `image` or `video` |
| `stackable`, `conflicts` | Whether it can combine with others and which ids it refuses |
| `aliases` | Other names that resolve to this preset, such as the free-text movement words older storyboards hold |
| `prompt` | One fragment per model family, with a required `default` |
| `params` | Generation settings the preset sets, such as `duration_seconds` |
| `families` | The families the preset was tested on |
| `preview`, `workflow`, `author` | Optional. A preview clip and poster, a hand-built workflow to eject instead of a generated one, and a pack author |

The Zod schema in `packages/presets/src/schema.ts` is the source of truth. The same schema is exported as JSON Schema in `packages/presets/preset.schema.json` for pack authors.

### Stacking rules

A request carries at most three presets. The compiler and the picker apply the same rules, from `canAddPreset` and `presetPairBlock` in `packages/presets/src/stack.ts`:

- Every preset in a stack must be `stackable`.
- Two presets cannot share a `slot`. A stack can hold one move, one rig and one speed preset.
- A preset cannot appear in the same stack as an id in its `conflicts` list, in either direction.
- Every preset must list the request's mode in `modes`.

The picker disables a card that would break a rule and names the preset blocking it. The compiler throws an error naming both presets if a request breaks one anyway, for example `Presets camera.a and camera.b cannot combine`.

---

## How compile works

`compilePresets(ids, { modelId, mode, prompt, catalog })` returns `{ prompt, params, applied, warnings }`. It is deterministic and has no model call.

1. `modelFamily(modelId)` maps the provider model id to a family: `kling`, `seedance`, `veo`, `wan`, `sora`, `minimax`, `ltx`, `local-wan` or `default`. The same table picks the prompting guide in `MODEL_PROMPTING_SKILLS`, so one list decides both. For the `nodetool` provider, the delegate model resolves first.
2. For each preset in stack order, the compiler takes the fragment for that family, or `default` when the preset has none.
3. A string fragment appends to the prompt with a space. An object fragment `{ prefix, suffix, replace }` joins `prefix`, then `replace` (or the current prompt when there is no `replace`), then `suffix`. A `replace` fragment drops the prompt built so far, so use it only for effects that must own the whole instruction.
4. `params` merge in stack order. Two presets that set the same key to different values fail the compile with an error naming both.

### Fallback warning

A model whose family is unknown, or whose family a preset has no fragment for, compiles with the `default` fragment. The result carries a warning such as `Preset camera.arc has no fragment for kling, using default`. The warning is recorded on the generation, shown on the composer chip and listed under the shot prompt preview, so you know the wording was not tuned for that model.

### Where the compile runs

The server compiles, not the client:

- **`generate_media`** and chat media turns accept `preset_ids` (at most three). The server validates the ids, compiles for the resolved provider and model, and sends the compiled prompt. A request with no presets sends the prompt unchanged. Presets work in modes `image`, `image_edit` and `video`. A `video` request with a `source_asset_id` compiles as `image_to_video`, and capability `reference_to_video` compiles as `reference_to_video`. Other modes return an error. A request that names a preset needs no prompt of its own.
- **Params** apply only to settings the mode accepts (`mediaPresetSettings`). Video takes `aspect_ratio`, `resolution`, `duration_seconds` and `num_inference_steps`. Image modes take their own size and seed fields.
- **The generation record** stores `preset_ids` and `preset_warnings` on the prediction row, so the Generations panel and agents can name the preset behind a render.
- **Storyboard clips** compile `camera.preset_ids` against an empty prompt through `compileCameraPresets`, so a camera fragment cannot rewrite the shot's action. The result is `ShotPromptContext.compiledCamera`, `{ clause, replacesEquipment }`. The clause replaces the free-text `movement`, and a preset in the `rig` slot also replaces `equipment`. A shot with no preset ids renders exactly as before.
- **The web** imports the same package only to preview the compiled wording.

---

## Where you use presets

| Surface | How |
|---|---|
| Shot editor | The **Movement** field takes free text or opens the camera preset picker. See [Edit a shot](storyboard-editor.md#edit-a-shot) |
| Chat composer | In the image and video media modes, the preset chip opens the picker for the current mode. It turns to a warning when the chosen model falls back to `default` |
| Effects gallery | Drop one picture, pick an effect and run it. Open it from the Effects card on the start page or from **+ New** |
| Create view | A workspace tab with a prompt bar built from the composer chips and a grid of generations. Open it from **+ New** |
| Agent | The `list_presets`, `get_preset` and `compile_presets` capabilities, and `preset_ids` on the media tools |
| CLI | `nodetool presets` |

Effect cards, camera cards and the picker are `PresetCard` and `PresetPicker` in `web/src/components/ui_primitives/`. A card plays its preview loop on hover or focus and stays still under reduced motion. Preset names and descriptions are translated through the web locale files.

---

## Eject to a workflow

Any preset can become an ordinary workflow. `presetToWorkflow(preset, { model, mode })` builds the graph from the same compile:

```
StringInput (prompt) → Template ({{ prompt }}) → generation node for the mode → Output (result)
```

Image modes add an `ImageInput`, and reference video mode connects media to `reference_images` and `reference_videos`. The Template holds the compiled wording for the chosen model, so editing it changes what the model receives. A preset with a `workflow` field ejects a copy of that hand-built graph instead, which needs a host that can resolve the workflow by name.

The web creates the workflow through the normal creation path and opens it in a tab. **Open as workflow** appears in the Effects gallery, on Create view items and on Generations panel entries that carry `preset_ids`. From the command line:

```bash
npm run dev:nodetool -- presets eject camera.dolly-zoom \
  --provider fal_ai --model <model id> --mode video --out dolly-zoom.json
```

The result passes `nodetool validate`. The `preset-ejection` selfcheck validates every preset's ejected graph.

---

## Write a preset

1. Create `packages/presets/catalog/<kind>/<id>.json`. The file name must equal the id and the id must start with the folder's kind.
2. Fill the fields from the schema above. Keep `name` and `description` in English. The web translates them from the catalogue.
3. Write one fragment per model family you tested, plus `default`. Use the matching per-model prompting skill in `packages/system-skills/` as the reference for phrasing, and list the tested families in `families`.
4. Put every old free-text name for the preset in `aliases`. Matching with `byAlias` is exact and case-insensitive on `aliases` and `name`. Aliases must be unique across the catalogue.
5. For an image-to-video effect, make the first alias the phrase the Effects Gallery template inserts after "proceeds to".

A camera fragment describes the motion and nothing else, because it joins a shot prompt that already holds the subject and action:

```json
{
  "id": "camera.example-move",
  "version": 1,
  "kind": "camera",
  "name": "example move",
  "description": "Camera pushes in toward the subject while the background widens.",
  "tags": ["camera", "move"],
  "slot": "move",
  "modes": ["video", "image_to_video", "reference_to_video"],
  "stackable": true,
  "aliases": ["example move"],
  "prompt": {
    "default": "Camera pushes in toward the subject while the background widens.",
    "seedance": "Camera pushes in toward the subject while the background widens throughout one continuous shot."
  }
}
```

An effect fragment may use `replace` when the effect is a full instruction. The effect then ignores any prompt text, which is why the Effects gallery sends none.

### Regenerate and check

After editing files in `catalog/`, run from the repository root:

```bash
npm run build --workspace=packages/presets        # regenerates preset-catalog.json and preset.schema.json
npm run i18n:presets --workspace=web              # regenerates the preset_catalog block in every locale
node scripts/presets/sync-effects-template.mjs    # effect presets only: rewrites Effects Gallery.json
```

For an effect change, refresh the marketing copies of the template next with `node marketing/scripts/generate-template-entries.mjs` and `node marketing/scripts/generate-template-catalog.mjs`.

Do not edit `preset-catalog.json`, `preset.schema.json` or the locale `preset_catalog` blocks by hand.

### Tests that guard the catalogue

| Test or check | What it fails on |
|---|---|
| `packages/presets/tests/catalog.test.ts` | An invalid file, a duplicate id or alias, an id that does not match its path, a missing `default` fragment, or drift between the sources and the generated files |
| `packages/presets/tests/compile-all.test.ts` | Any preset that compiles to an empty prompt in any mode for any family. This is the `preset-compilation` selfcheck |
| `packages/presets/tests/families.test.ts` | A model id from a shipped provider manifest that lands in the wrong family |
| `packages/presets/tests/effects-template.test.ts` | `Effects Gallery.json` out of sync with the effect presets |
| `packages/cli-execution` `preset-ejection` | An ejected graph that does not validate |
| `npm run generate:check --workspace=packages/presets` | Generated catalogue or schema drift |
| `npm run i18n:presets:check --workspace=web` | A locale out of sync with the catalogue |

`nodetool harness gate` selects these when a file under `packages/presets/` changes. See [harnesses](harnesses.md#nodetool-presets).

---

## CLI

`nodetool presets` ships in the models command feature, `packages/cli-models`.

```bash
nodetool presets list [--kind camera|effect|look|studio] [--mode <mode>] [--family <family>]
nodetool presets show <id>
nodetool presets compile <id...> --model <model id> [--provider <provider>] [--mode video] [--prompt "..."]
nodetool presets eject <id> --model <model id> --provider <provider> [--mode video] [--out graph.json]
```

`compile` prints `{ prompt, params, applied, warnings }` as JSON. Pass `--provider nodetool` to resolve a NodeTool delegate model first. From source, prefix with `npm run dev:nodetool --`.

## Agent tools

| Capability | Use |
|---|---|
| `list_presets` | Filter the catalogue by `kind`, `mode` and `family` |
| `get_preset` | Read one preset by id |
| `compile_presets` | Compile up to three ids for a `model` and `mode`, with an optional `provider` and `prompt`. Returns the same result as the CLI |

`generate_image`, `edit_image`, `generate_video` and `animate_image` accept `preset_ids`. The storyboard render capabilities compile each shot's `camera.preset_ids` for the board's video model. `edit_storyboard` can set a shot's `camera.preset_ids`. `compile_presets` returns `{ error }` on an unknown id, a conflicting stack or an unsupported mode, so the agent can correct the call.

---

## Previews

A preset card shows a short muted loop when the preset has a `preview`. The loops are not in git. They are rendered by NodeTool, uploaded to a public Supabase Storage bucket through the storage adapter, and each preset file stores the `url`, the `poster` and a `run` pointer to its run record.

Previews render on Dreamina through the signed-in Chrome tab, so they are tuned on the `seedance` family. The other families compile from their own fragments but have no preview of their own.

| Script | Does |
|---|---|
| `scripts/presets/source-stills.mjs` | Renders candidate source stills on several Dreamina image models, so one still can be chosen for every preview |
| `scripts/presets/render-previews.mjs` | Ejects each preset's graph and runs it against the fixed source image and seed. Writes the media to a local directory outside the repository and a run record to `packages/presets/runs/<id>.json` |
| `scripts/presets/publish-previews.mjs` | Encodes a muted loop of up to three seconds and a PNG poster, uploads both, writes `preview` into the preset file and regenerates the catalogue |
| `scripts/presets/sync-effects-template.mjs` | Rewrites the `Effects Gallery.json` options from the effect presets. `--check` fails on drift |

Use `--dry-run` to see the plan without Chrome or credentials. Rendering is sequential and resumes from the run records after a stall. Review every clip before publishing, and retune or drop a preset whose preview does not show its move. Each run record holds the model, seed and, when the runner reports it, the credits spent. Dreamina credits are not a list price, so do not use them as BYOK cost evidence. The commands, environment variables and the source image license are in [scripts/presets/README.md](../scripts/presets/README.md).

---

## Related

- [Storyboard Editor](storyboard-editor.md#edit-a-shot) for camera presets on a shot
- [Harnesses](harnesses.md#nodetool-presets) for the selfchecks and CLI
- [Agent Architecture & Tools](AGENTS.md#built-in-capabilities) for the capability table
- [packages/presets/README.md](../packages/presets/README.md) for the package API
