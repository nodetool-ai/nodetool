---
layout: page
title: "Programmatic SEO Playbook"
permalink: /seo-programmatic
description: "The page-machine plan for nodetool.ai — four programmatic page engines adapted from the photoai.com playbook, mapped to NodeTool's real assets."
---

Companion to [SEO Strategy](SEO_STRATEGY.md). That document is the audit and roadmap; this one
is the build plan for programmatic pages. Source: a teardown of photoai.com (9,466 indexed URLs,
~78% generated from user activity, the rest templated per keyword). Written 2026-07-02 against
the codebase as of that date — the file paths and counts below drift, so re-verify before building.

## The thesis, adapted

Photo AI treats pages as a product output, not a content cost: adding a keyword or a user
generating an image both create a fully-optimized, schema-rich, interlinked page automatically.
The thing to copy is the machine, not the pages.

NodeTool cannot copy it literally, for three reasons that shape everything below:

1. **No public UGC stream exists.** Photo AI's 7,428 `/photos/*` pages come from users generating
   images on a hosted service. NodeTool is local-first; workflows are `"access": "private"` by
   default and generations never leave the user's machine. Making output public by default would
   contradict the privacy positioning that `/studio` and every `/vs/*` page argue. The UGC engine
   must be opt-in publish, which means it starts at zero volume and is the last engine to ship,
   not the first.
2. **Search Console already shows what thin programmatic pages earn here.** The 375 node-reference
   URLs on docs.nodetool.ai took 7.8k impressions for 12 clicks (SEO Strategy §0.4) because the
   queries were "official docs" lookups for third-party libraries. Page count without intent match
   is a proven zero on this domain. Every engine below has a quality gate for this reason.
3. **NodeTool's unique asset is workflows, not images.** A workflow has structure an image
   doesn't: a rendered graph, a node list, input/output types, a category, sample outputs. That
   structure is unique page content for free — the thing Photo AI has to approximate with
   "related photos" blocks, NodeTool gets from the graph itself.

What survives the adaptation intact: the fixed-template-per-page-type discipline, the dense
internal-link mesh, per-page-type JSON-LD, the single dynamic sitemap, and the principle that
adding one row of data ships one complete page.

## Engine 1 — Template pages (`/templates/*`)

The analog of Photo AI's `/photos/*`, built from curated supply instead of UGC.
37 example workflows ship in `packages/base-nodes/nodetool/examples/nodetool-base/*.json`, each
with `name`, `description`, `tags`, and the full `graph`. Three have marketing pages
(`/use-cases/*`); 34 have none. Every one becomes a page at `/templates/<slug>`.

Page anatomy, in the order it renders:

- **Slug and H1** from the workflow name (`Movie Posters` → `/templates/movie-posters`,
  H1 "Movie Poster Generator — free AI workflow template").
- **Meta description** from the workflow's `description` field, extended with the node count and
  category ("Create cinematic movie posters using AI image generation. 12-node NodeTool template,
  free and open source.").
- **Rendered graph.** The static flow components in `marketing/src/components/flow/`
  (`NodeCanvas`, `FlowNode`, `FlowEdge` — proven at `marketing/src/app/flow-preview/page.tsx`)
  render the actual graph server-side. This is the page's unique asset: no competitor page and no
  sibling template page has this image or this DOM. Generate positions from the workflow JSON's
  `ui_properties` rather than hand-placing.
- **"Nodes in this workflow" section.** One line per distinct node type: what it does, which
  provider runs it. Unique copy derived from the graph, and the anchor point for future node/model
  pages (Engine 2).
- **Sample output** where one exists (`marketing/public/` already holds poster, trailer, and
  product-video assets).
- **How to run it**: open in NodeTool Cloud CTA + download-the-app path, with the
  `.nodetool` bundle or Examples-gallery route named explicitly.
- **Related templates**: 8–9 links chosen by shared tags/category, Photo AI's exact mechanism for
  circulating equity and crawl depth through the cluster.
- **JSON-LD**: `HowTo` (steps = the workflow's stages) + `ItemList` (the related templates) via
  the existing `JsonLd.tsx`.

Build mechanics: a build-time script reads the example JSONs into a generated
`templateEntries.ts` (same shape-discipline as `use-cases/useCaseEntries.ts`), one dynamic route
`app/templates/[slug]/page.tsx` with `generateStaticParams`, plus a `/templates` index page that
becomes a footer-linked hub. New example workflow in the repo → new page on deploy, no manual step.
That is the machine.

Quality gate: a template ships to the sitemap only if its description is non-boilerplate, its
graph renders, and it has either a sample output or a written walkthrough section. Below the bar,
build the page but `noindex` it until the gap is filled.

### Engine 1b — Published workflows (the UGC tier, later)

The compounding version: a **Publish** action in the editor/Cloud that makes a workflow public at
`nodetool.ai/w/<slug>-<shortid>`, rendered by the same template as `/templates/*`. Rules that keep
it from becoming the thin-content trap Photo AI risks:

- Opt-in only, never default-public. This is a product decision as much as an SEO one.
- Index gate before a page enters the sitemap: description ≥ 140 chars, ≥ 5 nodes, at least one
  output artifact, and no near-duplicate graph already indexed (hash the node-type multiset;
  duplicates get a canonical to the first-published copy).
- `noindex` from birth; pages earn indexation by passing the gate, not by existing.

This engine needs product work (publish flow, public rendering endpoint, moderation) and real
user volume, so it is sequenced last. It is also the only engine with Photo AI's ceiling.

## Engine 2 — Keyword landing pages

Photo AI runs ~400 of these: one master template, a swappable keyword hero, a large shared body.
NodeTool has the pattern half-built (`/use-cases/*` + `useCaseEntries.ts`) at 3 pages. The
adaptation:

**One master template, two swappable slices.** Hero (H1, subhead, meta title/description, one
asset) and a "proof" slice (the featured template from Engine 1, embedded graph + output). The
shared body reuses existing sections: how-it-works, the BYOK/local-first argument, the templates
grid, and one shared FAQ block. Do not copy the 15,000-word / 59-question body: Photo AI carries
that on domain authority NodeTool doesn't have, and post-helpful-content Google treats
boilerplate-heavy programmatic pages as a site-level risk. Target ~2,500 words with the
keyword-specific slice ≥ 30% of the page.

**Title formula**: front-load the keyword, add the concrete differentiator, keep the boilerplate
suffix short — "AI Product Video Generator — Free, Open Source, Your API Keys | NodeTool". Numbers
where honest ("37 free templates"); skip Photo AI's emoji, it fights the brand.

**Keyword axes**, in priority order (each axis is a data array feeding the same template):

1. **Task keywords** from shipped templates: "AI product video generator", "AI movie poster
   maker", "chat with PDF open source", "AI podcast clip generator". 34 unshipped templates ≈ 34
   pages. This is SEO Strategy §4.2, upgraded from hand-built pages to the factory.
2. **Persona keywords**: `/creatives`, `/agents`, `/developers`, `/marketing` exist; add
   local-first/privacy and researcher/knowledge-worker (SEO Strategy §3 names both as uncovered).
3. **Model/provider keywords**: "run FLUX in a visual workflow", "Kling video workflow", "ElevenLabs
   pipeline". Provider manifests in the node packages (`fal-nodes`, `replicate-nodes`, `kie-nodes`,
   24 node packages total) supply the list. Caution from §0.4 applies at full strength: someone
   searching "flux schnell" wants the model, not NodeTool. Only ship a model page when a real
   template uses that model, and frame it as "do X with <model>", not as reference docs.
4. **Trend/aesthetic keywords** (Photo AI's `/old-money`): weakest fit for NodeTool; skip until
   the first three axes are exhausted.

## Engine 3 — Comparison and alternatives mesh

Furthest along: six `/vs/*` pages shipped 2026-07-01/02 with the honest-concession pattern that
makes them credible (SEO Strategy §4.1). Photo AI's version says what's missing:

- **The `/alternatives/<competitor>` twin.** "langflow alternatives" and "comfyui alternative" are
  different queries from "nodetool vs langflow", with different SERPs. One template: intro naming
  the competitor's real limitation, a 4–6 tool list (NodeTool first, honestly framed), a
  feature table, FAQ, CTA. Two pages per competitor, exactly as Photo AI does.
- **Year in the title, computed not hardcoded**: "NodeTool vs Langflow: Which Is Better? (2026)"
  with the year from the build clock, so every deploy refreshes every comparison title.
- **The cross-link mesh.** Every comparison page gets a "Compare NodeTool with other tools" block
  linking all sibling `/vs/*` and `/alternatives/*` pages. The footer "Compare" column exists;
  the in-content block is what makes the cluster rank as a unit.
- **Cast the wide net.** Photo AI built 466 `/vs/*` pages including tangential tools. NodeTool's
  target list beyond the shipped six: Flora, Krea, Freepik Spaces, Griptape Nodes, Reflet.ai
  (creative canvases, §2); Lindy, Gumloop, Activepieces, Zapier AI, Make AI (automation); LM
  Studio, Jan, Open WebUI (local-first); Runway, Sim.ai as they crowd the same queries. ~20
  competitors × 2 page types ≈ 40 pages. Convert the hand-built ~250-line pages into the same
  data-array + dynamic-route factory as Engines 1–2 before scaling past ten competitors.
- **JSON-LD**: `BreadcrumbList` + `FAQPage` on this page type (Photo AI deliberately uses a
  different schema stack here than on landing pages).

## Engine 4 — FAQ and ideas hubs

Photo AI's `/faq/*` (59) and `/ideas/*` (204) capture question and inspiration intent and pump
internal links into money pages.

- **`/faq/*`**: seed from questions with existing evidence — the GSC query export's conversational
  queries ("which is free", "are any of these open source?", §0.8), `docs/troubleshooting.md`,
  provider-setup friction, and the FAQ blocks already written for the six `/vs/*` pages. Each
  question is one page plus one entry in the shared FAQ data module that Engine 2's landing pages
  render, so every answer exists twice: standalone for question-intent SERPs, embedded with
  `FAQPage`/`Question` markup for snippets and AI-answer surfaces. This is also the LLM-visibility
  play: §0.8 shows AI assistants are a live acquisition channel, and plain crawlable Q&A text plus
  `llms.txt` is what they ingest.
- **`/ideas/*`**: category-level roundups generated from Engine 1 metadata — "12 AI video workflow
  ideas", "AI workflow ideas for marketing teams". Each links every template in its category and
  its persona landing page. These are the hubs that give new template pages their first internal
  links on day one.

## The technical layer (all engines)

| Page type | JSON-LD | Related-links block | Title pattern |
|---|---|---|---|
| `/templates/*`, `/w/*` | `HowTo` + `ItemList` | 8–9 related templates | `<Name> — free AI workflow template` |
| Landing (`/use-cases/*`, personas, models) | `Product` + `FAQPage` | templates grid + sibling landings | `<Keyword> — Free, Open Source \| NodeTool` |
| `/vs/*`, `/alternatives/*` | `BreadcrumbList` + `FAQPage` | all sibling comparisons | `NodeTool vs <X>: Which Is Better? (<year>)` |
| `/faq/*` | `QAPage` | related FAQs + one money page | the question, verbatim |
| `/ideas/*` | `ItemList` | every template in category | `<N> <category> workflow ideas (<year>)` |

- **Sitemap becomes derived, not maintained.** `marketing/src/app/sitemap.ts` is a hand-ordered
  array of 21 entries; at 100+ pages that breaks. Each engine's data module exports its entries;
  `sitemap.ts` concatenates them. The existing rules stay: priority tiers, and no route ships
  without a sitemap entry, an `opengraph-image.tsx`, and a row in
  `marketing/tests/e2e/smoke.spec.ts` (which should walk the same data modules, so coverage is
  automatic).
- **Internal-link floor.** Photo AI runs ~400 internal links per page; NodeTool doesn't need the
  number, it needs the invariant: every page is reachable from a hub (`/templates`, footer
  columns, `/ideas/*`) and every page links onward to 8+ siblings. No orphans — the `/vs/*` pages
  spent their first day orphaned (SEO Strategy §1) and that rule is now standing.
- **Canonicals** self-referencing everywhere; `/w/*` duplicates canonicalize to the
  first-published copy (Engine 1b).
- **`llms.txt`** on nodetool.ai regenerates from the same data modules, listing hubs first.

## Build sequence

Photo AI's order (landing pages → UGC → comparisons → FAQ) assumed a UGC firehose from day one.
NodeTool's order reflects where supply already exists:

1. **The factory + Engine 1** (template pages). Highest unique-content-per-page of any engine,
   supply already in the repo, and Engines 2/4 embed its output. ~35 pages.
   Deliverables: JSON→`templateEntries.ts` build script, graph-render route, `/templates` hub,
   derived sitemap refactor.
2. **Engine 3 completion** (comparisons/alternatives). Bottom-funnel intent, pattern proven,
   zero-impression baseline to measure against (§0.2). Factory-ize, add `/alternatives/*`, add
   the year helper and mesh block, extend to ~15 competitors. ~30 pages.
3. **Engine 2** (keyword landing matrix). Task keywords first, then the two missing personas,
   then model pages gated on template coverage. ~40–60 pages.
4. **Engine 4** (FAQ/ideas hubs) + the schema table above across everything. ~40 pages.
5. **Engine 1b** (publish loop) once Cloud has the product surface and enough users that opt-in
   publishing produces real volume. This is the moat, and it's a product bet, not a content task.

Steps 1–4 take nodetool.ai from 21 indexed pages to ~150–170, every one from a fixed template
with unique structural content, before any UGC exists.

## Guardrails

- **The node-docs lesson is the null hypothesis.** Any engine can reproduce §0.4 (thousands of
  impressions, no clicks) if pages chase queries whose intent NodeTool can't satisfy. The gate for
  every new page: name the query, say why the searcher wants a workflow tool, and check the
  template's unique slice actually answers it.
- **Watch for site-level dilution, not just per-page failure.** If Search Console shows a new
  engine's pages indexed-but-not-ranking after a quarter, prune or `noindex` the tail rather than
  adding more. Photo AI tolerates a thin tail because unique images anchor every page; NodeTool's
  anchor is the rendered graph, which only carries pages whose text also matches intent.
- **Measure per engine.** Extend SEO Strategy §8: impressions/clicks segmented by URL prefix
  (`/templates/`, `/vs/`, `/alternatives/`, `/faq/`, `/ideas/`), plus conversions to `/studio`
  and `/pricing`. An engine that shows zero non-branded impressions after 8 weeks gets its
  keyword axis re-examined before its page count grows.
- **Numbers in this file rot.** 37 templates, 24 node packages, 21 sitemap entries were true on
  2026-07-02. The factory design makes the counts irrelevant; the audit claims don't age as well.
