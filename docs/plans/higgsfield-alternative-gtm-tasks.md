# NodeTool as an Open-Source Higgsfield Alternative — Implementation Tickets

Spec: [higgsfield-alternative-gtm.md](higgsfield-alternative-gtm.md)

## Dependency Graph

- **T1** (Repo hygiene & narrative carve-out) — no blockers
- **T2** (Shared 30-move camera vocabulary & empty-canvas template gallery button) — no blockers
- **T3** (Pack 1 & Pack 2 P0 workflow templates: Camera Moves & Effects) — blocked by **T2**
- **T4** (Pack 3 P0 workflow templates: Consistent Characters) — no blockers
- **T5** (Pack 4 & Pack 5 P0 workflow templates: Product Ads & Lipsync) — no blockers
- **T6** (Rewrite `/alternatives/higgsfield` with dated cost table, preset map & starter) — blocked by **T1**, **T3**, **T4**, **T5**
- **T7** (Regenerate marketing template catalog, SEO artifacts & verify gates) — blocked by **T3**, **T4**, **T5**, **T6**
- **T8** (Wave 2 P1 workflow templates: Morpher, 4K Upscale, Face Swap, Headshots, Synced SFX) — blocked by **T7**
- **T9** (Wave 2 interactive mini apps for Camera Move Studio & Effects Gallery) — blocked by **T3**, **T8** (closed, superseded)
- **T10** (Wave 2 Remotion 60-second side-by-side demo video on `/alternatives/higgsfield`) — blocked by **T6**, **T7**

---

### T1: Fix installer license header, surface shipped templates in README, and document `/alternatives/*` narrative rule

- **Status**: Completed (Wave 1)
- **Blocked by**: None
- **Blocks**: T6
- **Description**:
  Update `install.sh` line 27 from `# License: Apache-2.0` to `# License: AGPL-3.0`. Update `README.md` (`## First run from source` and `## Project layout`) so evaluators see that `examples/workflows/` holds small CLI smoke tests while the 200+ shipped creator workflows, mini apps, storyboards, timelines, and recipes live in `packages/base-nodes/nodetool/examples/` and at `https://nodetool.ai/templates`. Update `marketing/NARRATIVE.md` (`## The argument we do not make`) to state explicitly that `/alternatives/*` comparison pages are exempt from the homepage competitor-name rule.
- **Acceptance Criteria**:
  - `install.sh` header states `# License: AGPL-3.0`.
  - `README.md` links `packages/base-nodes/nodetool/examples/` and `https://nodetool.ai/templates` in both `## First run from source` and `## Project layout`.
  - `marketing/NARRATIVE.md` documents the `/alternatives/*` exemption.

---

### T2: Expand shared camera movement vocabulary to 30 presets and add "Start from a template" to FirstWorkflowGuide

- **Status**: Completed (Wave 1)
- **Blocked by**: None
- **Blocks**: T3
- **Description**:
  Expand `MOVEMENT_OPTIONS` in `web/src/components/storyboard/cameraOptions.ts` to include all 30 camera-move presets from the Go-to-Market spec while preserving all existing option values. Add an optional `onBrowseTemplates?: () => void` prop to `FirstWorkflowGuide` (`web/src/components/node_editor/FirstWorkflowGuide.tsx`), wire it in `web/src/components/node/ReactFlowWrapper.tsx` via `openExamplesTab("workflows")`, and add a unit test in `web/src/components/node_editor/__tests__/FirstWorkflowGuide.test.tsx`.
- **Acceptance Criteria**:
  - `MOVEMENT_OPTIONS` in `web/src/components/storyboard/cameraOptions.ts` includes all 30 camera moves (`dolly in`, `dolly out`, `dolly zoom (vertigo)`, `push in slow`, `pull back reveal`, `truck left`, `truck right`, `pedestal up`, `pedestal down`, `pan left`, `pan right`, `whip pan`, `tilt up`, `tilt down`, `crane up`, `crane down`, `orbit left`, `orbit right`, `360 orbit`, `crash zoom in`, `crash zoom out`, `handheld follow`, `FPV drone fly-through`, `top-down rise`, `snorricam`, `bullet time`, `rack focus`, `through-object pass`, `low-angle hero rise`, `overhead spiral`) plus existing entries.
  - `FirstWorkflowGuide` renders a `"Start from a template"` button when `onBrowseTemplates` is provided and not yet started.
  - `web/src/components/node_editor/__tests__/FirstWorkflowGuide.test.tsx` passes.

---

### T3: Build Pack 1 (Camera Moves) and Pack 2 (Effects) P0 workflow templates

- **Status**: Completed (Wave 1)
- **Blocked by**: T2
- **Blocks**: T6, T7, T9
- **Description**:
  Create four P0 workflow templates in `packages/base-nodes/nodetool/examples/nodetool-base/`:
  1. `Camera Move.json` (`camera-moves` pack): `ImageInput` + 30-move `SelectInput` + speed `SelectInput` + `IntegerInput` duration -> `Template` -> `ImageToVideo` -> `Output`.
  2. `Camera Move Contact Sheet.json` (`camera-moves` pack): `ImageInput` + 6-move `StringListInput` -> `ForEach` -> `Template` -> `ImageToVideo` -> `Collect` -> `Output`.
  3. `Lens and Look.json` (`camera-moves` pack): focal length, aperture, film look, and camera move `SelectInput`s -> `Template` -> `TextToImage` -> `ImageToVideo` -> keyframe and clip `Output`s.
  4. `Effects Gallery.json` (`effects` pack): `ImageInput` + 12-preset VFX `SelectInput` + intensity `SelectInput` -> `Template` -> `ImageToVideo` -> `Output`.
- **Acceptance Criteria**:
  - All 4 JSON files ship with empty `*_model` fields, `required_providers: ["fal"]`, bundled `package://nodetool-base/recipe-inputs/*` defaults, `"higgsfield-pack"` tags, and Markdown `Comment` intro nodes.
  - All 4 workflows pass `packages/base-nodes/tests/example-workflows-validation.test.ts`.

---

### T4: Build Pack 3 (Consistent Characters) P0 workflow templates

- **Status**: Completed (Wave 1)
- **Blocked by**: None
- **Blocks**: T6, T7
- **Description**:
  Create three P0 character consistency templates in `packages/base-nodes/nodetool/examples/nodetool-base/`:
  1. `Train a Character.json` (`characters` pack): reference portrait, character name, trigger word, and visual descriptor -> `nodetool.entity.CreateEntity` + `Template` -> `ImageToImage` 3-angle turnaround sheet -> entity and turnaround `Output`s.
  2. `Character in Any Scene.json` (`characters` pack): reference portrait, descriptor, scene prompt, and camera move -> `ImageToImage` scene keyframe -> `ImageToVideo` animated shot -> still and video `Output`s.
  3. `Consistent Cast Storyboard.json` (`characters` pack): lead portrait, name, descriptor, and story brief -> `CreateEntity` + `nodetool.creative.Director` -> `CreateStoryboard` -> `RenderStills` -> `RenderClips` -> `AssembleTimeline` -> storyboard and timeline `Output`s.
- **Acceptance Criteria**:
  - All 3 JSON files ship with empty `*_model` fields, `required_providers: ["fal"]`, bundled `package://nodetool-base/recipe-inputs/ugc-creator-reference.png` defaults, `"higgsfield-pack"` and `"characters"` tags, and Markdown `Comment` intro nodes.
  - All 3 workflows pass `packages/base-nodes/tests/example-workflows-validation.test.ts`.

---

### T5: Build Pack 4 (Product Ads) and Pack 5 (Lipsync & Dubbing) P0 workflow templates

- **Status**: Completed (Wave 1)
- **Blocked by**: None
- **Blocks**: T6, T7
- **Description**:
  Create five P0 ad and lipsync workflow templates in `packages/base-nodes/nodetool/examples/nodetool-base/`:
  1. `Product URL to UGC Ad.json` (`ads` pack): `product_url`, `creator_persona`, and `creator_photo` -> browser-enabled `Agent` scriptwriter -> `TextToSpeech` + `Normalize` + `ImageToVideo` -> `LipSync` -> script and UGC video `Output`s.
  2. `Product URL to CGI Commercial.json` (`ads` pack): `product_url`, `visual_style`, and `camera_move` -> browser-enabled `Agent` commercial director -> `TextToImage` studio packshot -> `ImageToVideo` -> packshot and commercial `Output`s.
  3. `50 Ad Variants Overnight.json` (`ads` pack): `product_url`, `product_photo`, and token budget -> browser-enabled `Agent` brief extractor -> `nodetool.generators.ListGenerator` -> `Template` -> `ImageToVideo` -> `Collect` -> `Output`.
  4. `Talking Avatar from a Photo and a Script.json` (`lipsync` pack): `portrait_photo` and `script` -> `TextToSpeech` -> `Normalize` -> `FadeIn` -> `FadeOut` + `ImageToVideo` -> `LipSync` -> `Output`.
  5. `Dub a Video into 5 Languages.json` (`lipsync` pack): `source_video` and 5-language `StringListInput` -> `ExtractAudio` -> `AutomaticSpeechRecognition` + `ForEach` -> `Agent` dubbing translator -> `TextToSpeech` -> `LipSync` -> `Collect` -> `Output`.
- **Acceptance Criteria**:
  - All 5 JSON files ship with empty `*_model` fields, `required_providers: ["fal"]`, bundled `package://nodetool-base/recipe-inputs/*` defaults, `"higgsfield-pack"` tags, and Markdown `Comment` intro nodes.
  - All 5 workflows pass `packages/base-nodes/tests/example-workflows-validation.test.ts`.

---

### T6: Rewrite `/alternatives/higgsfield` with dated cost table, preset-to-template map, and Camera Move starter

- **Status**: Completed (Wave 1)
- **Blocked by**: T1, T3, T4, T5
- **Blocks**: T7, T10
- **Description**:
  Add `"camera-move"` to `marketing/src/data/searchStarters.ts`. Extend `Competitor` in `marketing/src/data/competitorEntries.ts` with optional `presetMap` and `costComparison` fields and render both sections in `marketing/src/app/alternatives/[slug]/page.tsx`. Rewrite the `higgsfield` entry in `marketing/src/data/competitorEntries.ts` with sharpened headline/subline, 11-row feature comparison table, 12-row preset-to-template mapping table, dated per-model cost comparison table (checked October 20, 2026), honest explanation of Higgsfield's subsidized models vs BYOK Veo 3.1/Wan/local/non-expiring advantages, note on `@nodetool-ai/higgsfield-nodes` provider pack compatibility, and trademark non-affiliation FAQ. Update `marketing/tests/e2e/search-acquisition.spec.ts` line 8 to assert the `"camera-move"` starter on `/alternatives/higgsfield`.
- **Acceptance Criteria**:
  - `/alternatives/higgsfield` renders the "What it costs" table (dated October 20, 2026) and the 12-row "Higgsfield presets to NodeTool templates" table with working `/templates/<slug>` links.
  - Copy obeys `docs/WRITING_STYLE.md` and `docs/BRAND.md`.
  - `marketing/tests/e2e/search-acquisition.spec.ts` matches the updated starter configuration.

---

### T7: Regenerate marketing template catalog and SEO artifacts and pass all repository gates

- **Status**: Completed (Wave 1)
- **Blocked by**: T3, T4, T5, T6
- **Blocks**: T8, T10
- **Description**:
  Run `npm --prefix marketing run gen:templates`, `npm --prefix marketing run seo:generate`, and `npm --prefix marketing run seo:check` to update `marketing/src/data/templateEntries.generated.ts`, `marketing/src/data/templateCatalog.generated.ts`, `marketing/public/llms.txt`, and `marketing/public/alternatives.md`. Run all mandatory post-change checks (`npm run test:affected`, `npm run typecheck`, `npm run lint`, `npm run dev:nodetool -- harness gate --base origin/main`).
- **Acceptance Criteria**:
  - All 12 new templates appear in `templateEntries.generated.ts` and `templateCatalog.generated.ts` with routes matching `presetMap` in `competitorEntries.ts`.
  - `npm --prefix marketing run seo:check`, `typecheck`, and `lint` pass.
  - All four root verification commands pass.

---

### T8: Build Wave 2 P1 workflow templates (Frame Morpher, 4K Video Upscale, Face Swap, AI Headshot Studio, Synced SFX)

- **Status**: Planned (Wave 2)
- **Blocked by**: T7
- **Blocks**: T9
- **Description**:
  Create the five P1 workflow templates in `packages/base-nodes/nodetool/examples/nodetool-base/`:
  1. `Start-to-End Frame Morpher.json` (`camera-moves` pack): start image + end image + transition prompt -> first/last-frame video interpolation -> `Output`.
  2. `Video Upscale to 4K.json` (`effects` pack): input video + target resolution/fps -> video upscaler node -> before/after comparison outputs.
  3. `Face Swap.json` (`effects` pack): source portrait + target scene/video -> face-swap model + consent reminder comment -> `Output`.
  4. `AI Headshot Studio.json` (`characters` pack): 3–5 casual photos + backdrop/wardrobe selector -> batch of 12 studio portraits.
  5. `Synced Sound Effects.json` (`lipsync` pack): silent video clip -> foley/ambience audio generation -> muxed video `Output`.
- **Acceptance Criteria**:
  - All 5 P1 templates pass `packages/base-nodes/tests/example-workflows-validation.test.ts` and are indexed via `npm --prefix marketing run gen:templates`.

---

### T9: Build Wave 2 interactive mini apps for Camera Move Studio and Effects Gallery

- **Status**: Closed. Superseded by the preset picker and Effects gallery in [open-source-higgsfield-implementation.md](https://github.com/nodetool-ai/nodetool/blob/main/docs/plans/open-source-higgsfield-implementation.md) (P7, P8, P10)
- **Blocked by**: T3, T8
- **Blocks**: None
- **Description**:
  Build shipped mini-app definitions in `packages/base-nodes/nodetool/examples/nodetool-base/apps/` wrapping `Camera Move` and `Effects Gallery` with a visual preset picker card grid and preview thumbnails so non-technical creators can run them as form apps without opening the node graph.
- **Acceptance Criteria**:
  - Both mini apps validate against the app schema and open cleanly in Studio's App view with a single "Open workflow" button for graph inspection.

---

### T10: Produce Wave 2 Remotion 60-second demo video for `/alternatives/higgsfield`

- **Status**: Planned (Wave 2)
- **Blocked by**: T6, T7
- **Blocks**: None
- **Description**:
  Author a 60-second scripted Remotion composition in `demo/` showing: (1) picking a camera move in Studio and running a clip, (2) clicking "Open workflow" to swap Kling for Veo or local Wan 2.2, (3) dropping the rendered shot onto the multi-track timeline with captions and voiceover, and (4) running a 10-SKU ad batch. Render MP4/WebM assets and wire them into `/alternatives/higgsfield`.
- **Acceptance Criteria**:
  - Media assets pass `npm --prefix marketing run verify:media` and render in the hero player on `/alternatives/higgsfield`.
