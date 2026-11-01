---
layout: page
title: "Presets"
permalink: /presets
description: "Named camera moves, looks and effects that compile to the wording each video model understands, stack up to three at a time, and eject to an editable workflow. Studios open them from the start page."
---

**Navigation**: [Docs index](index.md) | [Storyboard Editor](storyboard-editor.md) | [Harnesses](harnesses.md#nodetool-presets) → **Presets**

A preset is a named, reusable piece of direction for a generation: a camera move such as a dolly zoom, or an effect such as a glass shatter. You pick it by name. NodeTool turns it into the wording the chosen model responds to best, adds it to your prompt, and records which presets made the render.

Presets are data. The catalogue is JSON in `packages/presets/catalog/`, the compiler is the `@nodetool-ai/presets` package, and every surface calls the same compiler: the shot editor, the chat composer, the Effects gallery, the Create view, agent tools and the CLI. The package README, [packages/presets/README.md](../packages/presets/README.md), documents the code API.

---

## What a preset is

| Field | Meaning |
|---|---|
| `id` | `<kind>.<slug>`, for example `camera.dolly-zoom`. Also the file name |
| `kind` | `camera`, `look` or `effect`. A studio is a separate row shape, described in [Studios](#studios) |
| `slot` | What the preset occupies: `move`, `rig`, `speed`, `look`, `effect`, `body`, `stock`, `grade`, `lighting`, `era` or `ramp` |
| `modes` | Where it runs: `video`, `image_to_video`, `reference_to_video`, `image`, `image_edit` or `video_edit` |
| `inputs` | What the preset needs from you: `text`, `image` or `video` |
| `stackable`, `conflicts` | Whether it can combine with others and which ids it refuses |
| `aliases` | Other names that resolve to this preset, such as the free-text movement words older storyboards hold |
| `prompt` | One fragment per model family, with a required `default` |
| `params` | Generation settings the preset sets, such as `duration_seconds` |
| `family_params` | Optional map from family name to settings. The selected family overrides matching keys in `params` |
| `families` | The families the preset was tested on |
| `preview`, `workflow`, `author` | Optional. A preview clip and poster, a hand-built workflow to eject instead of a generated one, and a pack author |

The Zod schema in `packages/presets/src/schema.ts` is the source of truth. `packages/presets/preset.schema.json` exports it as JSON Schema for pack authors. A catalogue row matches one of two shapes, a preset or a studio.

### Stacking rules

A request carries at most three presets. The compiler and the picker apply the same rules, from `canAddPreset` and `presetPairBlock` in `packages/presets/src/stack.ts`:

- Every preset in a stack must be `stackable`.
- Two presets cannot share a `slot`. A stack can hold a camera move, a rig and a film stock, for example. The three-preset limit still applies.
- A preset cannot appear in the same stack as an id in its `conflicts` list, in either direction.
- Every preset must list the request's mode in `modes`.

The picker disables a card that would break a rule and names the preset blocking it. The compiler throws an error naming both presets if a request breaks one anyway, for example `Presets camera.a and camera.b cannot combine`.

---

## How compile works

`compilePresets(ids, { modelId, mode, prompt, catalog })` returns `{ prompt, params, applied, warnings }`. It is deterministic and has no model call.

1. `modelFamily(modelId)` maps the provider model id to a family: `kling`, `seedance`, `veo`, `wan`, `sora`, `minimax`, `ltx`, `local-wan` or `default`. The same table picks the prompting guide in `MODEL_PROMPTING_SKILLS`, so one list decides both. For the `nodetool` provider, the delegate model resolves first.
2. For each preset in stack order, the compiler takes the fragment for that family, or `default` when the preset has none.
3. A string fragment appends to the prompt with a space. An object fragment `{ prefix, suffix, replace }` joins `prefix`, then `replace` (or the current prompt when there is no `replace`), then `suffix`. A `replace` fragment drops the prompt built so far, so use it only for effects that must own the whole instruction.
4. For each preset, the selected `family_params` entry overrides `params`. There is no default-family fallback for settings. A scoped key absent from both the selected family and shared params is dropped with a warning naming the preset, key and family. Settings outside the mode allowlist in `mediaPresetSettings` are also dropped with a warning before conflict checking. The remaining params merge in stack order. Two presets that set the same key to different values fail the compile with an error naming both.

### Family settings support

The compiler conservatively drops `fps` and `negative_prompt` from shared and
family-scoped params in every mode. No generation provider is called to discover
support during compile.

| Families | `fps` | `negative_prompt` |
|---|---|---|
| `kling`, `seedance`, `veo`, `wan` | Dropped | Dropped |
| `sora`, `minimax`, `ltx`, `local-wan`, `default`, unknown | Dropped | Dropped |

The generic video interfaces in
[provider types](../packages/runtime/src/providers/types.ts) expose duration and
frame count, but no requested fps. Negative prompts reach some endpoints through
the FAL, KIE and Replicate adapters, but support varies within a family and by
mode. The media preset boundary does not forward them. Family membership alone
cannot establish endpoint support, so presets express these directions in prose
until a narrower capability boundary exists. Ejected workflows use the same
filtering.

For supported settings, a preset can use
`"family_params": { "seedance": { "duration_seconds": 5 } }`.
Other families omit that setting with a warning unless shared `params` supplies
it. An override within one preset is allowed. Different values across presets
remain a conflict.

### Looks

Look presets describe camera-body rendering, film stock, color grade, lighting,
an era's finish, or a speed ramp. They use slots `body`, `stock`, `grade`,
`lighting`, `era` and `ramp`. Each has default, Kling, Seedance, Veo and Wan
wording. These fragments are authored direction, not a claim of rendered
validation on each provider.

Looks support video, image-to-video and reference-to-video. Still-compatible
looks also support image generation. Speed ramps only support video modes and
describe action timing without promising a numeric frame rate. Monochrome looks
conflict with color-dependent treatments, and look ramps conflict with the
camera speed-ramp preset. Looks have no previews until the preview-rendering
ticket.

Use looks through the CLI, agent preset tools or media requests with
`preset_ids`. The existing composer picker continues to offer camera and effect
presets. Dedicated storyboard and composer look controls follow in P15.

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
| Effects gallery | Drop one picture, pick an effect and run it. Open it from **+ New**, or from an effects studio on the start page, which shows only that studio's effects until you choose **Show all effects** |
| Create view | A workspace tab with a prompt bar built from the composer chips and a grid of generations. Open it from **+ New**, or from a Create studio on the start page with its presets on the preset chip |
| Agent | The `list_presets`, `get_preset` and `compile_presets` capabilities, and `preset_ids` on the media tools |
| CLI | `nodetool presets` |

Effect cards, camera cards and the picker are `PresetCard` and `PresetPicker` in `web/src/components/ui_primitives/`. A card plays its preview loop on hover or focus and stays still under reduced motion. Preset names and descriptions use the web locale files, with English source text for new entries awaiting translation.

---

## Video restyles

Choose Retake in the chat composer, attach a video and select a restyle from the preset chip. Anime, watercolor, clay animation, pixel art, oil painting, comic book, film noir and neon treatments preserve source action and timing. These are `effect` presets with `modes: ["video_edit"]` and `inputs: ["video"]`. They are excluded from the image-input Effects gallery. Keep your own prompt short or leave it empty: it goes ahead of the restyle wording, and a photoreal description pulls the result back toward a photograph.

RPC callers use `generate_media` with `mode: "video_edit"` and `preset_ids`. Agents can pass `preset_ids` to `revise_storyboard_clip`.

## Eject to a workflow

**Open as workflow** is available on Create results, Effects results and restyles in
Generations, and on a storyboard shot and each of its still and clip takes.
Storyboard takes keep the composed prompt, model, camera and look preset ids,
source media, entity references and settings from submission. Ejection uses that
record, including the different prompts for keyframe, direct and reference clips.
Editing the shot or catalogue afterwards does not change the ejected take.
Older takes without exact inputs show an explanation asking you to render a new
take instead of silently opening a different prompt.

A completed Lipsync studio run also offers **Open as workflow**. It opens an
editable `TextToSpeech → LipSync → Output` graph with the original line, voice,
speech model, speed, picture and lipsync model. `LipSync` accepts an image or a
video. The action uses the completed run, even if you change the studio fields.


Any preset can become an ordinary workflow. `presetToWorkflow(preset, { model, mode })` builds the graph from the same compile:

```
StringInput (prompt) → Template ({{ prompt }}) → generation node for the mode → Output (result)
```

Video restyles use mode `video_edit` and connect a `VideoInput` to `nodetool.video.VideoToVideo`. Image modes add an `ImageInput`, and reference video mode connects media to `reference_images` and `reference_videos`. The Template holds the compiled wording for the chosen model, so editing it changes what the model receives. A preset with a `workflow` field ejects a copy of that hand-built graph instead, which needs a host that can resolve the workflow by name.

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
| `packages/presets/tests/studios.test.ts` | A studio whose preset ids are unknown or do not fit its target, or whose skill or example app does not ship |
| `web/src/components/projects/__tests__/openStudio.test.ts` | A studio whose target the web cannot open, such as a guided flow that does not exist |
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

`list --kind studio` lists the studios. `--mode` and `--family` describe generation presets, so either one leaves studios out. `show` reads a preset or a studio. `compile` and `eject` refuse a studio id and name it as a studio.

`compile` prints `{ prompt, params, applied, warnings }` as JSON. Pass `--provider nodetool` to resolve a NodeTool delegate model first. From source, prefix with `npm run dev:nodetool --`.

## Agent tools

| Capability | Use |
|---|---|
| `list_presets` | Filter the catalogue by `kind`, `mode` and `family`. `kind: "studio"` lists the studios |
| `get_preset` | Read one preset or studio by id |
| `compile_presets` | Compile up to three ids for a `model` and `mode`, with an optional `provider` and `prompt`. Returns the same result as the CLI |

`generate_image`, `edit_image`, `generate_video` and `animate_image` accept `preset_ids`. The storyboard render capabilities compile each shot's `camera.preset_ids` for the board's video model. `edit_storyboard` can set a shot's `camera.preset_ids`. `compile_presets` returns `{ error }` on an unknown id, a conflicting stack or an unsupported mode, so the agent can correct the call.

---

## Previews

A preset card shows a short muted loop when the preset has a `preview`. The loops are not in git. They are rendered by NodeTool, uploaded to a public Supabase Storage bucket through the storage adapter, and each preset file stores the `url`, the `poster` and a `run` pointer to its run record.

Previews render on Dreamina through the signed-in Chrome tab, so they are tuned on the `seedance` family. The other families compile from their own fragments but have no preview of their own. An `image_edit` preset renders the edited still on the image model that made the source still, and its preview is a three-second crossfade from the source to the edit. A `video_edit` restyle renders through Seedance reference-to-video with the published dolly-in preview as its reference video, because Dreamina has no video-to-video mode.

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

## Studios

A studio is an outcome-named entry on the start page, such as **Cinematic shot**
or **Talking head**. It opens a surface that already exists with presets chosen,
so it adds no engine of its own. Studios live in `packages/presets/catalog/studio/`
beside the presets and appear in `preset-catalog.json` with `kind: "studio"`.

| Field | Meaning |
|---|---|
| `id` | `studio.<slug>`. Also the file name |
| `name`, `description`, `tags` | The tile's title and line, named for the outcome. Translated in the web locale files like preset names |
| `target` | Where the studio opens. See the table below |
| `preset_ids` | The presets the target opens with. Only `create` and `effects` targets take any |

| `target.type` | Opens | Presets |
|---|---|---|
| `create` with `mode` `image` or `video` | The Create view in that mode | Up to three camera and look presets for the mode, set on the preset chip. They must stack under the [stacking rules](#stacking-rules) |
| `effects` | The Effects gallery | Effect ids. The gallery shows only these, with the first chosen, until **Show all effects** |
| `lipsync` | The Lipsync studio | None |
| `skill` with `skill` | The start page prompt with `/<skill>` as its starter. The skill must ship in `packages/system-skills/` | None |
| `flow` with `flow` | A guided flow, as its creation card starts it, for example `storyboard` | None |
| `app` with `app` | A shipped example mini app from `packages/base-nodes/nodetool/examples/apps/`, in its own tab | None |

`createCatalog` rejects a studio whose preset ids are unknown, are studios, or do
not fit the target, so `npm run build --workspace=packages/presets` fails on one.
Studios are kept apart from presets in the catalogue: `getPreset`, `byAlias` and
`filter` return presets only, `getStudio` and `studios` return studios, and
`compilePresets` throws on a studio id.

The start page shows the studios in a **Studios** section below the creation
types. The Effects gallery and the Lipsync studio appear there as studios, and
**+ New** opens both surfaces directly.

## Lipsync studio

Open **+ New → Lipsync**, or choose **Talking head** under the start page's
studios. Upload a picture or choose an entity with a saved reference image. Enter
a line, choose a speech model and voice, then choose an audio-to-video model.
**Render lipsync** generates speech first and uses that audio to animate the
picture. The clip appears in the studio and in **Generations**. Closing the tab
keeps the working state and the running generation.

For a real person, select **This is a real person** and confirm that you have
their consent. Replacing the picture clears that confirmation. The
`generate_media` request records `person_consent` (`real_person`, `confirmed`)
in the lipsync prediction's params with `source_asset_id` and `audio_asset_id`.
The server rejects a real-person request without confirmation.

The keyless studio check is registered as `lipsync-studio`. Run
`npm run test:journeys --workspace=web -- lipsync-studio.spec.ts` for the full
fake-provider browser flow, including consent and the Generations result.

## Storyboard looks

Choose a **Board look** in **Change Style** to apply look presets across a storyboard. **Choose look** in the shot editor sets that shot's override. Clearing the override inherits the board selection. The Prompts preview shows the look compiled for the selected still and video models. A video-only ramp is omitted from still prompts.

Camera and effective look presets share the three-preset limit. Choose one per slot and avoid conflicts. Looks and camera direction compile together for clips. Changing a board look marks inherited renders stale while keeping existing media.

The composer uses one Presets picker with Camera, Look and Effect kind filters. This keeps the shared selection limit visible and lets a look combine with a camera move. Only presets supporting the current mode appear.

Agents can set `look_preset_ids` with `edit_storyboard` on `set_board`, `add_shot` or `update_shot`. The frontend bridge exposes the board field through `ui_storyboard_set_style` and shot fields through the add/update tools.

### Local Wan models

| Family | Model ids |
| --- | --- |
| `wan` | Hosted Wan 2.6 video routes |
| `local-wan` | Exact Wan2GP Wan video defaults stems, including `t2v`, `i2v`, `t2v_2_2`, `i2v_2_2`, `ti2v_2_2` and `ti2v_2_2_fastwan` |

The `wangp` provider reports bare defaults stems as model ids. Both server
compilation and web previews use the shared case-insensitive allowlist in
[`families.ts`](../packages/presets/src/families.ts). It includes Wan-derived
control, talking, editing and distilled variants, plus legacy Fun Camera ids.
Provider prefixes, arbitrary suffixes, neighboring versions and non-Wan defaults
such as Hunyuan, LTX, Kandinsky, image and audio models do not map to `local-wan`.
The complete claimed and excluded defaults are pinned in the
[Wan2GP fixtures](../packages/presets/tests/wan2gp-models.json).

Every camera and effect has a local fragment with positive motion or material
instructions. Restyles describe the whole frame in the target medium. These
fragments compile independently of `families`, which records tested eligibility.
Local eligibility and rendered previews remain P24 work. Local Wan 2.1/2.2 does
not select the Wan 2.6 prompting guide, whose shot controls are version-specific.
