# Examples Revamp Plan

Status: draft, 2026-07-17. Scope: the 37 shipped templates in
`packages/base-nodes/nodetool/examples/nodetool-base/` and their generated mini
apps (`scripts/generate-template-apps.mjs`, `web/public/app-preview/`).

## Why

The examples are the product's first impression three times over: the template
gallery in the editor, the mini apps on `/apps/*` marketing pages, and the
first thing a new user runs. Today they undersell on all three surfaces. The
workflows are mostly linear prompt pipes that don't justify a node editor, and
the generated apps are 37 copies of the same form. Meanwhile the platform just
gained the features that would make them compelling — node-property bindings,
reactive subgraph runs, run pacing, container-responsive app layout — and no
example uses any of them.

## Analysis

Measured across all 37 templates (graph JSON + generated `app_doc`):

### Workflow shape

- 15 of 37 graphs are purely linear (max fan-out 1); median size ~7 nodes.
  The dominant shape is Input → Prompt template → LLM → Output — a prompt
  wrapper that a chat box does better.
- Control flow is nearly absent: 14 `nodetool.control` nodes and 6
  `nodetool.boolean` nodes across the whole set, almost all in one teaching
  example (Conditional Logic Engine).
- Node namespace census: `nodetool.input` 72, `nodetool.text` 60,
  `nodetool.agents` 24, `nodetool.generators` 19, image 34, video 11,
  `lib.sqlite` 3. No vectorstore/RAG usage, no workflow-as-tool composition,
  no streaming showcase.

### Models

- `gpt-5-mini` appears 41 times — effectively every text node. Images are all
  `fal-ai/flux/schnell` (16). Video is `veo-3.1` (5, expensive).
- Providers: openai 43, fal 22, gemini 6, claude_agent_sdk 1. Zero local
  models (Ollama/MLX). A fresh install without an OpenAI key has ~30 broken
  examples and no private/offline example at all.

### Content hygiene

- Shipped prompt text includes typos and one-liners ("Create a 3 compelling
  Pokémons"). No system prompts, no output-format instructions. Prompts are
  the actual product of these workflows and read as first drafts.
- Hardcoded content that should be inputs: RSS feed URL (BBC Europe), search
  topics, folder paths. `FolderPathInput` appears in two templates and is
  meaningless in a hosted app.
- Node titles/descriptions are sparse; comments decorate rather than teach.

### Outputs

- 30 of 37 templates have exactly one Output; nearly everything funnels into
  a text/markdown blob. Flashcards, calendars, SEO fields, and generated data
  are prose instead of structured objects — which caps what the apps can
  render (widget census over all 37 apps: 28 Markdown + 37 Text vs 13 Image,
  7 Video, 1 Audio, 1 Json).

### Apps

- All 37 app docs share one generated shape: heading, tagline, input form,
  Run button, results panel. Zero Slider/Select/Switch widgets anywhere
  (71 WorkflowInput widgets, 37 Buttons).
- 8 templates have no inputs at all — their app is a Run button
  (Agent Google Search, Color Boost Video, Data Generator, Fetch Papers,
  Hacker News Agent, Image To Audio Story, Summarize RSS, YouTube Research
  Agent).
- Apps open with empty fields (seeded demo values exist only in the marketing
  preview bundles), and none use pacing, node-property bindings, variables,
  or an iteration loop (regenerate/variants/gallery).

### Marketing surface

The examples feed the marketing site directly: every template gets a
`/apps/<slug>` landing page (`marketing/scripts/generate-miniapp-entries.mjs`
→ `miniAppEntries.generated.ts`, 37 pages live), a screenshot
(`web/scripts/screenshot-app-previews.mjs` → `marketing/public/apps/<slug>.png`,
37 present), and a `/templates/<slug>` page via the generated template
catalog. Consequences of the current state:

- All 37 screenshots show the same empty form layout — a grid of visually
  identical pages that read as one product with 37 names. Conversion surface,
  currently underselling.
- The 8 no-input apps are marketed as apps while being a Run button.
- Landing pages exist for near-duplicate templates, splitting search intent
  (three YouTube/research agents, two thumbnail pipelines, three audio
  summarizers) instead of concentrating it on one strong page each.

### Root cause

The generator (`generate-template-apps.mjs`) is sound infrastructure with a
timid curation table, and the workflows were authored to demo single nodes,
not to be products. Both are fixable without new platform features — the
platform is now ahead of its own examples.

## Goals

1. Every shipped example runs on first try and passes `nodetool validate`.
2. Every example demonstrates at least one thing a chat box can't do
   (parallel comparison, media pipeline, control flow, RAG, live parameters,
   structured data).
3. A keyless install has at least 3 fully working local examples.
4. The featured apps feel like tools: seeded defaults, real controls,
   visible progress, an iteration loop.
5. Fewer, better: target ~20 curated examples instead of 37 near-duplicates.

## Plan

### Phase 0 — Guardrails (do first, half a day)

- CI job: run `nodetool validate` over every example JSON;
  `--warnings-as-errors` for unknown types, dangling edges, unselected
  models. This is the rot detector for everything that follows.
- Add a cheap smoke tier: `nodetool debug` on 3–4 keyless/local examples.
  Skip paid-model examples in CI; run them in a manual pre-release pass.

### Phase 1 — Hygiene pass on all survivors (1–2 days)

For each kept template:

- Rewrite prompts properly: system prompt, task structure, explicit output
  format, no typos. Prompts are the product; treat them like code review.
- Parametrize hardcoded values into inputs (feed URL, topic, style).
- Name and describe every node; make comments explain the *why* of the graph.
- Set sensible input defaults so Run works with zero typing.
- Model pass: keep a cheap fast default for text, but vary providers
  deliberately where it shows breadth; flag expensive nodes (veo) in the
  description with a cost note.

### Phase 2 — Restructure the catalog (2–3 days)

Disposition of all 37 (keep = hygiene only; fix = keep + targeted change;
merge/retire = fold into another or drop):

| Template | Disposition | Change |
|---|---|---|
| Ad Creative Factory | keep | showcase; structured variant outputs |
| Agent Google Search | merge | into Research Agent (topic input, streaming) |
| Audio To Image | keep | starter; seed demo audio |
| Brand Asset Generator | keep | hero app |
| Cold Outreach Co-Pilot | fix | structured outputs (draft objects) |
| Color Boost Video | fix | VideoInput + slider-bound intensity (live grading) |
| Concept Art Iteration Board | keep | hero; variant gallery loop |
| Conditional Logic Engine | keep | teaching example for control flow |
| Creative Story Ideas | merge | into one "Prompt Template" starter |
| Data Generator | fix | schema input → dataframe output → table app |
| Fetch Papers | merge | into Research Paper Summarizer (topic input) |
| Flashcard Generator | fix | emit card objects, card-flip app rendering |
| Hacker News Agent | fix | topic input, streaming markdown |
| Hook & Thumbnail Factory | keep | hero (absorbs YouTube Thumbnail Pipeline) |
| Image Enhance | fix | FLAGSHIP: sliders bound to node properties, pace: release |
| Image To Audio Story | fix | add ImageInput |
| Image to Video Animation | keep | |
| Learning Path Generator | merge | into Prompt Template starter |
| Meeting Transcript Summarizer | fix | action items as dataframe (absorbs Summarize Audio) |
| Movie Posters | keep | hero |
| Movie Trailer Generator | keep | showcase; cost note |
| Music Video Visualizer | keep | showcase |
| Photo Enhancement Suite | fix | replace FolderPathInput (multi-image) or mark local-only |
| Podcast Repurposing Studio | keep | showcase |
| Pokemon Maker | fix | hero; rewrite prompt, style Select, variant gallery |
| Product Mockup Generator | keep | hero |
| Product Video Generator | keep | |
| Research Paper Summarizer | fix | absorbs Fetch Papers |
| SEO Content Engine | fix | typed field outputs |
| Social Media Calendar Filler | fix | calendar as dataframe |
| Story to Video Generator | retire | overlaps Movie Trailer; FolderPath-bound |
| Summarize Audio | merge | into Meeting Transcript Summarizer |
| Summarize RSS | fix | feed URL input; digest by topic |
| Transcribe Audio | fix | instant tool: auto-run on upload (change event, paced) |
| Wikipedia Agent | merge | into Research Agent |
| YouTube Research Agent | merge | into Research Agent |
| YouTube Thumbnail Pipeline | merge | into Hook & Thumbnail Factory |

Net: 37 → ~24, minus retire → ~23, plus new below → ~28; prune to ~20 at
final curation if the merged families hold up.

Marketing follow-through for every merge/retire: keep the old `/apps/<slug>`
and `/templates/<slug>` URLs as redirects to the absorbing template's page
(the slugs are already indexed), and grep docs/tutorials for retired template
names in the same pass.

### Phase 3 — New differentiator examples (2–3 days)

Each maps to a marketing story the catalog currently can't tell:

1. **Chat With Your Documents** — RAG: index a folder into the vectorstore,
   ask questions with cited answers. (First vectorstore usage in examples.)
2. **Research Agent** — the merged agent family: topic input, real tool use
   (search + browse), streaming markdown brief with citations.
3. **Model Arena** — one brief fanned out to 3 providers side-by-side.
   Earns the graph visually and doubles as a great comparison app.
4. **Private Assistant (local)** — Ollama/MLX end-to-end, no API keys.
   Along with 2 other local-capable starters, satisfies the keyless goal.
5. **Workflow as a Tool** — a workflow exposed via `tool_name`, consumed by
   an agent in another workflow. Shows composition, which nothing demos.

### Phase 4 — App layer (2 days, extends the curation table)

Extend `generate-template-apps.mjs` curation entries with per-template hints
instead of hand-editing app docs:

- `sliders`: node-property bindings with ranges (autofill already derives
  min/max/step from metadata), `pace: "release"` for anything expensive.
- `selects`: finite choices (aspect ratio, style, tone, platform) instead of
  free-text inputs.
- `seeds`: shipped default values in the app itself, not just the marketing
  preview — first Run must work with zero typing.
- `gallery`: append-disposition outputs rendered as a grid with a
  "Make another" button for the creative heroes.
- `featured`: flag the ~8 hero apps for the gallery and `/apps` landing
  pages (Image Enhance, Pokemon Maker, Movie Posters, Brand Asset Generator,
  Hook & Thumbnail Factory, Product Mockup Generator, Concept Art Iteration
  Board, Music Video Visualizer).
- Progress widget on every template whose run exceeds a few seconds.

Regenerate previews and `/apps` pages (`screenshot-app-previews.mjs`,
`marketing/scripts/generate-miniapp-entries.mjs`) as the last step.

### Phase 4b — Marketing page impact

What the revamp changes on the marketing site, and the work it implies:

- **Screenshots become the sell.** Today's 37 near-identical empty-form
  screenshots become ~20 distinct ones showing seeded results: a photo
  mid-enhancement with sliders, a Pokémon variant gallery, a model-arena
  comparison, a calendar table. The screenshot pipeline needs seeded values
  rendered (the preview bundles already seed; verify the new gallery/slider
  states render before the screenshot settles).
- **Fewer, stronger landing pages.** ~20 pages that each answer one search
  intent instead of 37 splitting it. Merged/retired slugs redirect (see
  Phase 2); the `/apps` index orders by the `featured` flag with heroes
  first.
- **New pages with real search demand.** The Phase 3 examples add landing
  pages for terms the site can't currently target: "chat with your
  documents / RAG", "compare AI models side by side", "local private AI
  assistant", "AI research agent". These are stronger queries than most
  existing template names.
- **Copy pass per page.** Landing copy currently describes the workflow;
  rewrite to describe the outcome and name the differentiator ("drag the
  slider, watch the photo update — runs the graph live"), reusing each
  template's new description field so app, gallery, and landing page say the
  same thing.
- **Mechanics.** All of this flows through the existing generators — the
  work is the redirects map, the featured ordering, and the copy fields in
  the curation table; no new marketing infrastructure. Entries without a
  fresh screenshot stay noindexed by the existing rule, which safely gates
  half-finished templates out of search.

### Phase 5 — Verification and release

- `nodetool validate` green across the catalog (CI from Phase 0).
- `nodetool app debug` per hero app: bindings resolve, run trigger exists,
  display widgets receive values.
- Manual pass on paid-model examples before release; screenshot refresh.

## Sequencing and effort

Phases 0–1 are independent of 2–4 and land first (~2 days, pure win, no
decisions needed). Phase 2 dispositions need a maintainer sign-off on the
merge/retire list, then 2–4 parallelize by template family. Total ~7–9
working days; the flagship (Image Enhance live editor) is worth pulling
forward as the proof piece for the whole direction.

## Risks

- **Cost**: veo/fal examples are expensive to smoke-test. Mitigation: CI
  validates but doesn't execute paid models; manual pre-release pass only.
- **Model drift**: pinned model ids rot. Mitigation: Phase 0 CI catches
  unknown models at validate time; prefer provider-default aliases where the
  registry supports them.
- **User familiarity**: retired/merged templates may be referenced in docs
  and tutorials. Mitigation: grep docs for template names during Phase 2;
  keep slugs redirecting on the marketing site.
- **Scope creep**: structured outputs may reveal missing table/gallery
  rendering in app widgets. The Json/Output widgets cover the minimum; a
  dedicated Table widget is a fast follow, not a blocker.

## Success criteria

- Fresh install, no keys: 3+ examples run end-to-end locally.
- Every example passes validate in CI; hero apps pass app debug.
- Every kept example demonstrates a named differentiator (recorded in its
  description).
- Featured apps: seeded first run, at least one real control (slider/select),
  progress on long runs, and an iteration loop on the creative ones.
- Marketing: no dead `/apps` or `/templates` URLs (redirects in place), every
  indexed page has a distinct seeded-result screenshot, heroes lead the
  `/apps` index.
