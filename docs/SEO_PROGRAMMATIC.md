---
layout: page
title: "Programmatic SEO Playbook"
permalink: /seo-programmatic
description: "The page-machine plan for nodetool.ai — programmatic page engines adapted from the photoai.com playbook, mapped to NodeTool's real assets."
---

Companion to [SEO Strategy](SEO_STRATEGY.md). That document is the audit and roadmap; this one
is the build plan for programmatic pages. Source: a teardown of photoai.com (9,466 indexed URLs,
~78% generated from "user activity", the rest templated per keyword). Written 2026-07-02, revised
the same day to add the seeded-showcase engine, model pages, and the ranked list of further
dimensions. File paths and counts below drift — re-verify before building.

## The thesis, adapted

Photo AI treats pages as a product output, not a content cost: adding a keyword or generating an
image both create a fully-optimized, schema-rich, interlinked page automatically. The thing to
copy is the machine, not the pages.

Three facts shape NodeTool's version:

1. **Photo AI's "UGC" pages did not wait for users.** The founder seeded `/photos/*` with his own
   generations; user volume came later. NodeTool can do the same: batch-generate real outputs from
   its own workflows and publish each run as a page. The outputs are genuine (real model, real
   prompt, real workflow) — what's seeded is who pressed the button. The line not to cross is
   fabricated attribution: no invented user names, no synthetic `Review`/`aggregateRating` markup.
   Google's spam policies name fake review markup specifically; the generations themselves are
   fine.
2. **Search Console already shows what thin programmatic pages earn here.** The 375 node-reference
   URLs on docs.nodetool.ai took 7.8k impressions for 12 clicks (SEO Strategy §0.4) because the
   queries were "official docs" lookups for third-party libraries. Page count without intent match
   is a proven zero on this domain. Every engine below has an index gate for this reason.
3. **NodeTool's unique assets are workflows and multi-provider model access.** A workflow has
   structure an image doesn't: a rendered graph, a node list, typed inputs/outputs, a category.
   And the node packages expose the models people actually search for — Seedance, Veo, Kling,
   Sora, Hailuo, Wan, Seedream, FLUX, GPT-Image — each through several providers (Seedance alone
   via fal, kie, replicate, and atlascloud nodes). Same prompt, two models, side by side, with
   real outputs: content no single-model vendor can publish and no competitor bothers to.

What survives the adaptation intact: fixed template per page type, output-first page layout, the
dense internal-link mesh, per-page-type JSON-LD, one derived sitemap, and the principle that
adding one row of data ships one complete page.

## Engine 1 — Template pages (`/templates/*`)

37 example workflows ship in `packages/base-nodes/nodetool/examples/nodetool-base/*.json`, each
with `name`, `description`, `tags`, and the full `graph`. Three have marketing pages
(`/use-cases/*`); 34 have none. Every one becomes a page at `/templates/<slug>`.

Page anatomy, in render order:

- **Sample output first.** The generated video/image/audio leads the page (see Engine 2 for
  supply); the graph explains it below. Photo AI's photo pages lead with the photo for the same
  reason: the output is what the searcher wants to judge.
- **Slug and H1** from the workflow name (`Movie Posters` → `/templates/movie-posters`,
  H1 "Movie Poster Generator — free AI workflow template").
- **Meta description** from the workflow's `description`, extended with node count and category.
- **Rendered graph.** The static flow components in `marketing/src/components/flow/`
  (`NodeCanvas`, `FlowNode`, `FlowEdge`, proven at `marketing/src/app/flow-preview/page.tsx`)
  render the actual graph server-side from the JSON's `ui_properties`. No sibling page and no
  competitor has this DOM.
- **"Nodes in this workflow"**: one line per distinct node type — what it does, which provider
  runs it — with links into the model pages (Engine 3).
- **How to run it**: open in NodeTool Cloud CTA plus the download path.
- **Related templates**: 8–9 links by shared tags/category — Photo AI's mechanism for circulating
  equity and crawl depth through the cluster.
- **JSON-LD**: `HowTo` + `ItemList` via the existing `JsonLd.tsx`.

Build mechanics: a build-time script reads the example JSONs into a generated
`templateEntries.ts` (same shape-discipline as `use-cases/useCaseEntries.ts`), one dynamic route
`app/templates/[slug]/page.tsx` with `generateStaticParams`, and a `/templates` hub page in the
footer. New example workflow in the repo → new page on deploy. That is the machine.

Index gate: non-boilerplate description, graph renders, and a sample output. Below the bar, the
page builds with `noindex` until the gap is filled.

## Engine 2 — Seeded showcase (`/showcase/*`): the UGC engine, without waiting for users

The direct clone of `/photos/*` (7,428 pages, the biggest lever in the teardown), seeded the way
Photo AI seeded it: generate the content ourselves. Every batch run of a workflow becomes a page.

**The pipeline.** The CLI already does the hard part: `nodetool workflows run <file> --params`
and `nodetool generate <provider> <model> <prompt>` produce outputs headlessly, and the debug
harness captures per-run metadata. A seeding script iterates templates × models × a curated
prompt list, writes each output plus a manifest (prompt, model, provider, workflow slug, duration,
params) to the asset store, and emits one `showcaseEntries` row per run. Marginal cost per page is
inference, not writing.

**Page anatomy** (mirrors Photo AI's `/photos/*` mechanics precisely):

- URL slug is the prompt, truncated and hyphenated, with a short id appended:
  `/showcase/neon-jellyfish-drifting-through-a-flooded-subway-station-a7f3k2`.
- The output is the hero — full-width video or image, playing on load.
- Title and meta description are the prompt text; H1 is the prompt plus the model name.
- Below the output: model chip (→ its Engine 3 page), workflow chip (→ its Engine 1 page),
  provider, generation params. This block is what makes the page more than a bare asset.
- ~9 related showcase links (shared model, shared workflow, shared tag) — the equity mesh.
- "Remix this" CTA: opens the workflow in NodeTool Cloud with the prompt pre-filled.
- **JSON-LD**: `ImageObject`/`VideoObject` + `ItemList`, matching Photo AI's photo-page stack.

**Volume math**: 37 templates × 3–4 models × 5–10 prompts is 500–1,500 pages from one weekend of
compute, before any real user publishes anything. Start smaller: ~200 pages across the video and
image templates, watch indexation for 4–6 weeks, then scale.

**Provenance rules** (the adaptation of "fake UGC" that doesn't blow up): outputs must be real
generations from the named model and workflow — never stock, never misattributed to another model.
Pages carry no user identity and no review markup; they are a showcase, not testimonials. Dedupe
near-identical prompts before publishing (same model + cosine-similar prompt → one page, others
canonical to it).

**Engine 2b — real publish loop, later.** Once Cloud has a Publish action, user-published
workflows and runs enter the same `/showcase/*` and `/w/*` templates behind the same index gate
(description ≥ 140 chars, ≥ 5 nodes or a real output, no near-duplicate already indexed,
`noindex` from birth until the gate passes). The seeded corpus is what makes the section already
rank by the time real UGC arrives.

## Engine 3 — Model pages (`/models/*`)

People search the model, not the tool: "seedance", "veo 3", "kling ai", "sora 2", "gpt image",
"seedream", "wan 2.5", "flux". Every one of these is runnable in NodeTool today through multiple
providers (verified in `packages/*-nodes/src`: Seedance via fal/kie/replicate/atlascloud, Veo via
fal/kie/replicate/together, and so on). The honest angle writes itself: one canvas runs them all,
through whichever provider is cheapest, on your own API keys.

**`/models/<slug>`** ("Seedance", "Veo 3", "Kling 2.6", …):

- Hero: 2–3 real outputs from Engine 2 (the showcase supplies every model page's proof).
- What the model does, in NodeTool's words — capability, resolution/duration limits, what it's
  best at. This slice is hand-written per model; it's the intent-match that node-docs pages lacked.
- **Provider table**: which node packages expose it, BYOK pricing note per provider. This is the
  differentiator no single-provider page has, and it's generated from the package manifests.
- A template that uses the model (→ Engine 1), embedded graph and all.
- Prompt examples: 5–10 showcase items for this model (→ Engine 2), each linked.
- FAQ: "is Seedance free", "Seedance vs Kling, which is better" (→ Engine 3b), "can I run it
  locally". `FAQPage` markup.
- Title: "Seedance in NodeTool — run it in a visual AI workflow (2026)".

**Engine 3b — model-vs-model comparisons** (`/models/veo-3-vs-kling-2-6` or similar). The
highest-upside new dimension found in this revision. "veo vs kling", "sora vs veo 3",
"seedance vs hailuo" are real queries with commercial intent, the SERPs are Reddit threads and
listicles, and NodeTool can do the one thing they can't: **run the identical prompt through both
models and embed both outputs side by side**, generated by the same seeding pipeline as Engine 2.
Feature table (resolution, duration, audio, price per clip via each provider), 3–4 same-prompt
pairs, an honest "pick X when…" verdict, FAQ, and a CTA into the workflow that produced the
comparison — which the reader can run with their own prompt. That last link is a page mechanic no
static listicle can copy. Pairs are data rows too: ~10 video models → ship the ~15 pairs people
actually search, not all 45.

**Freshness dimension**: model releases are page events. When fal/kie add a new model (they ship
within days of release), a NodeTool model page + a same-day showcase batch can rank on
"how to try <model>" while the query spikes and before the listicles consolidate. Keep a standing
runbook: new model in a node package → entry in `modelEntries.ts` → seed 10 showcase runs → page
live. Refresh version numbers in titles on each release (the Photo AI year-in-title trick, applied
to model versions).

## Engine 4 — Keyword landing pages

One master template, a swappable hero + proof slice, a shared body. `/use-cases/*` and
`useCaseEntries.ts` are the half-built version at 3 pages. Keyword axes, each a data array
feeding the same template:

1. **Task keywords** from shipped templates: "AI product video generator", "AI movie poster
   maker", "chat with PDF open source". 34 unshipped templates ≈ 34 pages.
2. **Task hubs** ("image to video", "lip sync AI", "AI video upscaler", "text to music"): one hub
   per capability listing the models that do it (→ Engine 3), the templates that wire it
   (→ Engine 1), and showcase output (→ Engine 2). These sit one level above model pages and
   catch the searcher who hasn't picked a model yet.
3. **Persona keywords**: four exist (`/creatives`, `/agents`, `/developers`, `/marketing`); add
   local-first/privacy and researcher/knowledge-worker (SEO Strategy §3 names both as uncovered).
4. **Trend/aesthetic keywords** (Photo AI's `/old-money`): weakest fit; skip until the axes above
   are exhausted.

Do not copy the 15,000-word / 59-question body: Photo AI carries that on domain authority
NodeTool doesn't have. Target ~2,500 words with the keyword-specific slice ≥ 30%. Title formula:
front-load the keyword, add the concrete differentiator, short suffix — "AI Product Video
Generator — Free, Open Source, Your API Keys | NodeTool". Numbers where honest; skip the emoji.

## Engine 5 — Product comparison and alternatives mesh

Six `/vs/*` pages shipped 2026-07-01/02 with the honest-concession pattern (SEO Strategy §4.1).
Remaining work, per the teardown:

- **`/alternatives/<competitor>` twins** — "comfyui alternative" and "nodetool vs comfyui" are
  different queries with different SERPs. One template: the competitor's real limitation, a 4–6
  tool list (NodeTool first, honestly framed), feature table, FAQ, CTA.
- **Year in the title, computed at build**: "NodeTool vs Langflow: Which Is Better? (2026)".
- **In-content cross-link block** ("Compare NodeTool with other tools") on every page, beyond the
  existing footer column — this is what makes the cluster rank as a unit.
- **Wide net** (~20 competitors × 2 page types): the shipped six plus Flora, Krea, Freepik
  Spaces, Griptape Nodes, Reflet.ai (creative canvases); Lindy, Gumloop, Activepieces, Zapier AI,
  Make AI (automation); LM Studio, Jan, Open WebUI (local-first). Factory-ize the hand-built
  ~250-line pages before scaling past ten.
- **JSON-LD**: `BreadcrumbList` + `FAQPage` (Photo AI deliberately uses a different stack here
  than on landing pages).

## Engine 6 — FAQ, ideas, and glossary hubs

- **`/faq/*`**: seed from questions with evidence — the GSC export's conversational queries
  ("which is free", "are any of these open source?"), `docs/troubleshooting.md`, provider-setup
  friction, and the FAQ blocks already written for `/vs/*`. Each question is a standalone page
  plus a row in the shared FAQ module that Engines 3–5 render, so every answer exists twice:
  standalone for question SERPs, embedded with `FAQPage` markup for snippets and AI-answer
  surfaces (§0.8 shows AI assistants are a live acquisition channel).
- **`/ideas/*`**: category roundups generated from Engine 1 metadata ("12 AI video workflow
  ideas"), each linking every template in its category. New template pages get their first
  internal links here on day one.
- **Glossary**: `docs/glossary.md` already exists; per-term pages ("what is image-to-video",
  "what is a node-based editor") are near-free definitional surface that AI assistants quote.

## Other dimensions considered, ranked

Evaluated for this revision; the first two graduated into engines above, the rest are queued:

1. **Model-vs-model comparisons** → Engine 3b. Highest upside: real query volume, weak SERPs,
   and a same-prompt side-by-side only NodeTool can generate.
2. **Task hubs** → Engine 4 axis 2.
3. **"Ollama frontend" positioning page.** "ollama gui", "ollama frontend", "ollama web ui" carry
   real volume; NodeTool genuinely is one (Ollama provider in `packages/runtime`). One hand-built
   page (`/ollama`), same honest-table pattern as `/vs/*`, linking the local-first persona page.
   Quick win, do alongside Engine 5.
4. **Prompt-library pages** ("seedance prompts", "veo 3 prompt examples"): curated collections of
   Engine 2 showcase items per model. Ship as `/models/<slug>/prompts` once a model has 20+
   showcase items — a view over existing data, not a new engine.
5. **New-model release notes** ("Wan 2.6 is out — how to try it"): blog posts tied to the Engine 3
   freshness runbook. Needs the blog to exist (SEO Strategy §4.4).
6. **Integration pages** (`/integrations/supabase`, Google Sheets, the Chrome extension):
   `integration-nodes` exists, but query volume for "<tool> + AI workflow" is unproven — collect
   GSC evidence first.
7. **Free interactive mini-tools** (workflow JSON viewer, prompt enhancer): strong link magnets,
   real engineering cost. Revisit after the engines ship.

## The technical layer (all engines)

| Page type | JSON-LD | Related-links block | Title pattern |
|---|---|---|---|
| `/templates/*` | `HowTo` + `ItemList` | 8–9 related templates | `<Name> — free AI workflow template` |
| `/showcase/*`, `/w/*` | `ImageObject`/`VideoObject` + `ItemList` | ~9 related showcase items | the prompt, verbatim |
| `/models/*` | `SoftwareApplication` + `FAQPage` | sibling models + its prompt/showcase items | `<Model> in NodeTool — run it in a visual AI workflow (<year>)` |
| `/models/*-vs-*` | `BreadcrumbList` + `FAQPage` | all sibling model comparisons | `<A> vs <B>: same prompt, side by side (<year>)` |
| Landing (tasks, personas) | `Product` + `FAQPage` | templates grid + sibling landings | `<Keyword> — Free, Open Source \| NodeTool` |
| `/vs/*`, `/alternatives/*` | `BreadcrumbList` + `FAQPage` | all sibling comparisons | `NodeTool vs <X>: Which Is Better? (<year>)` |
| `/faq/*` | `QAPage` | related FAQs + one money page | the question, verbatim |
| `/ideas/*` | `ItemList` | every template in category | `<N> <category> workflow ideas (<year>)` |

- **Sitemap becomes derived, not maintained.** `marketing/src/app/sitemap.ts` is a hand-ordered
  array of 21 entries; at 1,000+ pages that breaks. Each engine's data module exports its
  entries; `sitemap.ts` concatenates them. Standing rules stay: priority tiers, and no route
  ships without a sitemap entry, an `opengraph-image.tsx`, and a row in
  `marketing/tests/e2e/smoke.spec.ts` (which should walk the same data modules).
- **Internal-link floor.** Photo AI runs ~400 internal links per page; NodeTool needs the
  invariant, not the number: every page reachable from a hub, every page linking onward to 8+
  siblings, no orphans (the `/vs/*` pages spent their first day orphaned — SEO Strategy §1).
- **Canonicals** self-referencing everywhere; near-duplicate showcase pages canonical to the
  first-published copy.
- **`llms.txt`** regenerates from the same data modules, hubs first.

## Build sequence

Revised: the showcase pipeline moves early because Engines 1, 3, and 4 all lead with its outputs.

1. **The factory + Engine 1** (template pages, ~35). Data modules, graph-render route,
   `/templates` hub, derived-sitemap refactor. Everything else reuses this plumbing.
2. **Engine 2 seeding pipeline + first ~200 showcase pages.** CLI batch runner, asset store,
   `showcaseEntries` generation, the `/showcase/*` route. Gate scaling on indexation data.
3. **Engine 3 model pages** for the searched models already in the node packages (Seedance, Veo,
   Kling, Sora, Hailuo, Wan, Seedream, FLUX, GPT-Image, Imagen, ~15 pages) **+ the top ~15
   model-vs-model pairs** (Engine 3b), heroes supplied by step 2.
4. **Engine 5 completion** (~30 pages: `/alternatives/*`, year helper, mesh block, wide net) plus
   the `/ollama` page.
5. **Engine 4** task keywords and task hubs (~40–60 pages), then the two missing personas.
6. **Engine 6** FAQ/ideas/glossary (~40 pages) + the schema table everywhere.
7. **Engine 2b** real publish loop once Cloud has the product surface.

Steps 1–6 take nodetool.ai from 21 indexed pages to ~600–800, every one output-first and from a
fixed template, before any real user publishes anything.

## Execution: NodeTool workflows run the machine

The work splits cleanly into code that ships once and content that regenerates forever. The
second half is exactly what NodeTool is for, so the SEO machine's production layer is NodeTool
workflows run headlessly — which is also a marketing story in itself (the site's content is made
by the product it sells, and the seeder workflows ship as `/templates/*` pages like any other).
The PR-by-PR breakdown of everything below — file-level specs, acceptance criteria, rollout
timeline, and open decisions — is in the [SEO Execution Plan](SEO_EXECUTION_PLAN.md).

**Layer 1 — the factory (TypeScript, one-time, ~3 PRs).** Not workflows; this is Next.js build
plumbing in `marketing/`:

1. Data modules + `/templates/[slug]` route with the JSON→flow-components graph renderer, the
   `/templates` hub, derived sitemap, and the smoke-test walker. Everything later reuses this.
2. `/models/[slug]` and `/models/[a]-vs-[b]` routes reading `modelEntries.ts`.
3. `/showcase/[slug]` route reading the generated showcase manifest.

**Layer 2 — content production (NodeTool workflows in `marketing/seo/workflows/`, DSL `.ts`
files, run via `nodetool run <file> --params`).** Four workflows:

- **Showcase Seeder** — inputs: template slug, model list, prompt count. An agent or
  `ListGenerator` writes prompt variants in the template's domain, each fans out through
  `TextToImage`/`ImageToVideo` per model, outputs land in `marketing/seo/out/<batch>/` with one
  manifest row per run (prompt, model, provider, params, file). The same pattern as the shipped
  `Image to Video Animation` and `Movie Posters` examples, parameterized.
- **Model Duel** — one prompt, two model parameters, identical generation nodes; emits the paired
  outputs plus an agent-drafted observation block for the `/models/a-vs-b` page.
- **Copy Writer** — the shipped `SEO Content Engine` template (strategist agent → briefs → full
  Markdown per brief), retargeted: given a model id and its provider manifest, draft the
  hand-written slice of its model page (capability blurb, FAQ answers, title/meta) as Markdown
  for review. Drafts only — a human edits before merge.
- **Model Watcher** — a plain CI script, not a workflow (reliability beats dogfooding here):
  weekly `generate <provider> --list-models --json` diff against `modelEntries.ts`; a new model
  opens a PR with the stub entry and kicks a Seeder batch for it.

**Layer 3 — glue (GitHub Actions).** One `seo-seed.yml` with cron + manual dispatch: runs the
seeder/duel workflows with provider keys from repo secrets and an explicit per-batch spend cap in
`--params`, then an ingest script that converts manifests into
`showcaseEntries.generated.ts`, moves assets to the CDN path, and opens a PR. **The PR is the
quality gate**: a human eyeballs every batch's outputs before they go live — this is where the
playbook's index gate is enforced, not in code review of the pipeline. Merge deploys the site.

What deliberately stays out of workflows: page rendering, sitemap, canonicals — all derived at
Next.js build time from the checked-in data. The workflows produce data and assets; the build
consumes them. That boundary keeps a bad generation batch revertable with `git revert`.

## Guardrails

- **The node-docs lesson is the null hypothesis.** Any engine can reproduce §0.4 (thousands of
  impressions, no clicks) if pages chase queries whose intent NodeTool can't satisfy. The gate
  for every new page type: name the query, say why that searcher wants a workflow tool, and check
  the unique slice answers it. Model pages pass because "run X cheaper via any provider" is what
  a model searcher wants next; node-reference pages failed because "pdfplumber docs" searchers
  didn't.
- **Seeded content stays honest.** Real generations, correctly attributed to model and workflow;
  no invented users, no review markup, no passing off one model's output as another's. The
  showcase label is load-bearing — it's what distinguishes this from the spam Google actually
  targets.
- **Watch site-level dilution, not just per-page failure.** If a new engine's pages sit
  indexed-but-not-ranking after a quarter, prune or `noindex` the tail rather than adding more.
  Photo AI's thin tail is carried by unique images; NodeTool's showcase pages have the same
  anchor, but template/model pages need their text to match intent too.
- **Cap seeding spend.** The showcase pipeline's cost is inference; set a per-batch budget and
  prefer models NodeTool gets via cheap providers for the long tail, reserving expensive models
  (Veo, Sora) for pages that target their queries.
- **Measure per engine.** Segment GSC by URL prefix (`/templates/`, `/showcase/`, `/models/`,
  `/vs/`, `/alternatives/`, `/faq/`, `/ideas/`) plus conversions to `/studio` and `/pricing`. An
  engine with zero non-branded impressions after 8 weeks gets its keyword axis re-examined before
  its page count grows.
- **Numbers in this file rot.** 37 templates, 24 node packages, 21 sitemap entries were true on
  2026-07-02. The factory design makes the counts irrelevant; the audit claims age worse.
