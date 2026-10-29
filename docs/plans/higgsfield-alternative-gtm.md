# NodeTool as an Open-Source Higgsfield Alternative — Go-to-Market Specification

## Problem Statement

Higgsfield has captured creator mindshare by wrapping third-party video and image models (Veo 3.1, Kling 3.0, Seedance 2.0, Wan 2.6, Nano Banana Pro, Flux.2) inside one-click studio presets — Cinema Studio (70+ camera moves), Soul ID (consistent characters), Lipsync Studio, and Marketing Studio (product URL to ad) — billed in expiring monthly credits ($9–$79/mo).

NodeTool already ships a broader model catalog (including the same video/image models via fal, Replicate, KIE, and local runtimes, plus an 80-endpoint first-party `@nodetool-ai/higgsfield-nodes` provider pack), a 92k-LOC multi-track timeline editor, storyboard direction with entity casting, lipsync nodes, and automation via CLI and MCP. However, three gaps prevent NodeTool from winning the Higgsfield comparison today:

1. **Missing one-click preset packs**: NodeTool's camera movements, VFX prompts, character consistency flows, and URL-to-ad pipelines are spread across lower-level nodes or buried inside `packages/base-nodes/nodetool/examples/` while `README.md` and the empty workflow canvas do not surface them directly.
2. **Neutral comparison copy on `/alternatives/higgsfield`**: `marketing/src/data/competitorEntries.ts` uses generic copy, omits a dated per-model cost comparison table, lacks a preset-to-template mapping table, and does not explain the nuance that Higgsfield subsidizes Nano Banana Pro and Kling 3.0 while NodeTool BYOK wins on Veo 3.1 Fast, Wan, non-expiring balance, batch automation, and $0 local models.
3. **Discoverability and hygiene**: `install.sh` carries a stale `Apache-2.0` header comment instead of `AGPL-3.0`, `README.md` points new evaluators only to the 42 CLI smoke tests in `examples/workflows/`, and the empty workflow guide in Studio offers no one-click path to the shipped template gallery.

## Solution

Deliver a two-wave Go-to-Market and product-packaging rollout that positions NodeTool as the open-source, editable-workflow alternative to Higgsfield while preserving factual, dated pricing transparency:

1. **Five creator template packs (12 P0 workflows + 5 P1 workflows)** in `packages/base-nodes/nodetool/examples/nodetool-base/` covering Higgsfield's core studios:
   - **Pack 1 — Camera Moves (`camera-moves`)**: `Camera Move`, `Camera Move Contact Sheet`, `Lens and Look`, and `Start-to-End Frame Morpher` (P1), backed by an expanded 30-move camera vocabulary in `web/src/components/storyboard/cameraOptions.ts`.
   - **Pack 2 — Effects (`effects`)**: `Effects Gallery`, `Video Upscale to 4K` (P1), and `Face Swap` (P1).
   - **Pack 3 — Consistent Characters (`characters`)**: `Train a Character`, `Character in Any Scene`, `Consistent Cast Storyboard`, and `AI Headshot Studio` (P1).
   - **Pack 4 — Product Ads (`ads`)**: `Product URL to UGC Ad`, `Product URL to CGI Commercial`, and `50 Ad Variants Overnight`.
   - **Pack 5 — Lipsync & Dubbing (`lipsync`)**: `Talking Avatar from a Photo and a Script`, `Dub a Video into 5 Languages`, and `Synced Sound Effects` (P1).
2. **Sharpened `/alternatives/higgsfield` comparison page**:
   - Extend `Competitor` in `marketing/src/data/competitorEntries.ts` and `marketing/src/app/alternatives/[slug]/page.tsx` to render a dated per-model cost comparison table (`costComparison`, checked October 20, 2026) and a preset-to-template mapping table (`presetMap`).
   - State the honest cost breakdown: Higgsfield Pro annual ($23/mo, 600 credits ≈ 3.8¢/credit) subsidizes Nano Banana Pro (~$0.08 vs $0.15 on fal) and 5-second Kling 3.0 (~$0.30 vs ~$0.84 on fal), whereas NodeTool BYOK wins on 4-second Veo 3.1 with audio ($0.60 on fal Veo 3.1 Fast vs 40 credits / ~$1.52 on Higgsfield) and Wan (~$0.25 vs ~$0.38), never expires unused balance at cycle end, permits batch/CLI/MCP automation without credit surcharges, runs local Flux and Wan 2.2 at $0, and lets creators bring their own Higgsfield API key through `@nodetool-ai/higgsfield-nodes`.
   - Include a trademark non-affiliation FAQ entry for Higgsfield, Cinema Studio, and Soul.
3. **Template discoverability and repo hygiene**:
   - Surface the shipped template gallery (`packages/base-nodes/nodetool/examples/` and `https://nodetool.ai/templates`) in `README.md` alongside the CLI smoke tests.
   - Add a direct "Start from a template" button to `FirstWorkflowGuide` on an empty workflow canvas (`web/src/components/node_editor/FirstWorkflowGuide.tsx` and `web/src/components/node/ReactFlowWrapper.tsx`) that opens the workflow templates tab.
   - Fix `install.sh` line 27 license comment to `AGPL-3.0` and document the `/alternatives/*` carve-out in `marketing/NARRATIVE.md`.

## User Stories

1. As a filmmaker or social video creator evaluating Higgsfield alternatives, I want to pick a named camera movement (such as `dolly in`, `crane up`, `360 orbit`, `crash zoom in`, or `FPV drone fly-through`) from a dropdown and animate a still image in one click, so that I do not have to write camera engineering prompts from scratch.
2. As a creative director testing shot coverage, I want to render one reference still across six camera movements in a single batch (`Camera Move Contact Sheet`), so that I can compare takes side by side before paying for a full-resolution hero render.
3. As a storyteller working with recurring talent, I want to lock a character's portrait, trigger token, and wardrobe descriptor into a reusable entity and 3-angle turnaround sheet (`Train a Character`, `Character in Any Scene`, `Consistent Cast Storyboard`), so that my lead looks identical across a 6-shot storyboard and timeline cut.
4. As a performance marketer, I want to paste a product landing-page URL and generate either a lip-synced vertical creator review (`Product URL to UGC Ad`), a tabletop packshot commercial (`Product URL to CGI Commercial`), or a 50-variant batch (`50 Ad Variants Overnight`), so that I can produce campaign assets without manual copy-pasting or automation bans.
5. As a video producer localizing spoken content, I want to turn a portrait and script into a talking avatar (`Talking Avatar from a Photo and a Script`) or dub an existing presenter clip into five languages with lip-matching (`Dub a Video into 5 Languages`).
6. As a buyer comparing costs on `/alternatives/higgsfield`, I want a dated per-model price table comparing Higgsfield Pro annual credits against fal BYOK list prices and $0 local GPU execution, including models where Higgsfield is subsidized, so that I can make an informed cost decision.
7. As a first-time Studio creator opening an empty workflow canvas, I want a "Start from a template" action right in the onboarding card, so that I can open the shipped creator templates without hunting through menus.

## Implementation Decisions

- **D1 — Honest per-model cost framing**: Never claim NodeTool BYOK is "always cheaper" than Higgsfield. Always cite the dated comparison (checked October 20, 2026) showing that Higgsfield Pro annual subsidizes Nano Banana Pro (~$0.08 vs $0.15 on fal) and 5-second Kling 3.0 (~$0.30 vs ~$0.84 on fal), while BYOK beats Higgsfield on 4-second Veo 3.1 with audio ($0.60 vs ~$1.52) and Wan (~$0.25 vs ~$0.38), never expires at month-end, permits unattended batching and MCP/CLI automation, and runs local models at $0.
- **D2 — Higgsfield provider pack positioning**: Frame `@nodetool-ai/higgsfield-nodes` (80 Higgsfield API endpoints including Soul 2 and Cinema Studio) as a compatibility advantage: creators can bring their Higgsfield API key into NodeTool graphs alongside fal, Replicate, OpenAI, and local models.
- **D3 — Shipped workflow template contract**: Every new template JSON in `packages/base-nodes/nodetool/examples/nodetool-base/` must:
  - Ship all `*_model` fields empty (`provider: ""`, `id: ""`, `name: ""`, `path: null`) so ` applyDefaultModels` populates the creator's configured provider at load time and `presetModelFields` passes.
  - Declare `"required_providers": ["fal"]` at the top level so template cards show single-key compatibility without hardcoding a preset model on a node.
  - Include a `nodetool.workflows.base_node.Comment` intro node with a non-empty Markdown string `data.comment`.
  - Use bundled `package://nodetool-base/recipe-inputs/*` sample media so inputs are pre-populated on first open.
  - Include `"higgsfield-pack"` and the pack slug (`"camera-moves"`, `"effects"`, `"characters"`, `"ads"`, `"lipsync"`) in `tags`.
- **D4 — Shared 30-move camera vocabulary**: Expand `MOVEMENT_OPTIONS` in `web/src/components/storyboard/cameraOptions.ts` to include all 30 preset camera moves while preserving every existing option string so existing storyboards and tests remain backward-compatible.
- **D5 — Structured comparison tables on `/alternatives/[slug]`**: Add optional `costComparison` and `presetMap` fields to `Competitor` in `marketing/src/data/competitorEntries.ts` and render them as semantic tables in `marketing/src/app/alternatives/[slug]/page.tsx`.
- **D6 — Homepage vs `/alternatives/*` copy rule**: Keep competitor names off homepage body copy as required by `marketing/NARRATIVE.md`, and explicitly document in `marketing/NARRATIVE.md` that `/alternatives/*` pages are designed for direct, dated competitor comparisons.

## Testing Decisions

- **Workflow structural and hydration validation (`packages/base-nodes/tests/example-workflows-validation.test.ts`)**: Every workflow JSON added to `packages/base-nodes/nodetool/examples/nodetool-base/` is automatically tested for JSON validity, unique node IDs, valid edge handles, registered node types in `NodeRegistry`, empty `*_model` fields, renderable Markdown `Comment` nodes, `Graph.loadFromDict` hydration survival, and required non-model property coverage.
- **FirstWorkflowGuide component test (`web/src/components/node_editor/__tests__/FirstWorkflowGuide.test.tsx`)**: Verify that passing `onBrowseTemplates` renders the "Start from a template" button and invokes the callback when clicked.
- **Marketing catalog and SEO integrity (`npm --prefix marketing run seo:check`, `typecheck`, `lint`, and `marketing/tests/e2e/search-acquisition.spec.ts`)**: Verify that `templateEntries.generated.ts`, `templateCatalog.generated.ts`, `public/llms.txt`, and `public/alternatives.md` are in sync with the source JSONs and `competitorEntries.ts`, and that the `/alternatives/higgsfield` search starter journey matches `searchStarters.ts`.

## Out of Scope

- Scraping or copying Higgsfield's proprietary preview video loops, prompt weights, or UI layouts.
- Paid search advertising on the `"higgsfield"` trademark keyword.
- Announcing hosted NodeTool Cloud pricing tiers (tracked separately from the Wave 1 open-source and BYOK launch).

## Further Notes

### Two-Wave Launch Sequence
- **Wave 1 (Developer & Open-Source Channels)**: Ship the 12 P0 workflow templates, the rewritten `/alternatives/higgsfield` page with dated cost and preset tables, the `README.md` and `FirstWorkflowGuide` discoverability updates, and the `install.sh` license fix. Launch on Show HN, `r/StableDiffusion`, `r/comfyui`, `r/LocalLLaMA`, and `r/aivideo`.
- **Wave 2 (Creator Channels)**: Ship the 5 P1 templates (`Start-to-End Frame Morpher`, `Video Upscale to 4K`, `Face Swap`, `AI Headshot Studio`, `Synced Sound Effects`), dedicated interactive mini-app wrappers for Camera Moves and Effects Gallery, and the 60-second Remotion comparison video on `/alternatives/higgsfield`.
