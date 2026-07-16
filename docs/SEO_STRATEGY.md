---
layout: page
title: "SEO Strategy"
permalink: /seo-strategy
description: "Content and search strategy for nodetool.ai — audit, competitive landscape, page-type playbooks, and a prioritized roadmap."
---

Research basis: an audit of `marketing/` (the nodetool.ai Next.js site), `docs/`, the 61 example
workflows in `packages/base-nodes/nodetool/examples/`, and the node packages in `packages/`, plus
external research on competitor positioning and search behavior (sources linked inline). Written
2026-07-01, updated 2026-07-02 — re-audit the live site before acting on the numbers below if this
file is more than a quarter old.

**Status**: the movie-trailer sitemap fix shipped 2026-07-01. `/vs/langflow` and `/vs/n8n` (§4.1
items 1 and 3) and the footer "Compare" column (§1, orphaned-pages finding) shipped 2026-07-02.
`/marketing` (§4.0), `/vs/flowise`, and `/vs/dify` (§4.1 items 2 and 5) shipped 2026-07-02.
§0 (the Search Console audit) added 2026-07-02 — it re-prioritizes §7 with real query data.
The programmatic build plan (template pages, the seeded showcase engine, model and
model-vs-model pages, keyword landing matrix, comparison/alternatives mesh at scale, and
FAQ/ideas hubs) lives in [SEO_PROGRAMMATIC.md](SEO_PROGRAMMATIC.md) — it extends §4 from
hand-built pages to data-driven page factories, adapted from a photoai.com teardown.
Shipped from §0 on 2026-07-02: 79 redirect stubs under `docs/redirects/` (§0.5, plus a fix to the
three pre-existing stubs, whose trailing-slash `redirect_to` 404s on GitHub Pages); `providers.md`
and `installation.md` rewrites (§0.6); `comparisons.md` cross-links to `/vs/*` (§0.6); `/agents`
and `/cloud` retitles (§0.7); `llms.txt` on nodetool.ai and JSON-LD on `/agents`, `/creatives`,
`/marketing` (§0.8). The Weavy → Figma Weave capture plan (§0.9) shipped 2026-07-16.

## 0.9 Weavy → Figma Weave capture plan (2026-07-16)

Figma acquired Weavy in October 2025 and renamed it **Figma Weave** (weave.figma.com, separate
billing and its own AI credits). The integration is deepening — Weave Workflows on Figma Community
(April 2026), Weave tools inside Figma Design (Config 2026) — so search demand is splitting into
two query sets, and the second one is growing:

1. **"weavy alternative"** — the established term. Every ranking page now leads with the rebrand
   ([Wireflow's "Top 8 Weavy Alternatives (Weavy Is Now Figma Weave)"](https://www.wireflow.ai/blog/top-8-ai-weavy-alternatives),
   [Chase Jarvis's "Best Weavy Alternatives for Creative Pros"](https://chasejarvis.com/blog/the-best-weavy-alternatives-for-free-and-paid/),
   [designtools.fyi](https://designtools.fyi/tools/figma-weave)). A `/vs/weavy` page that never
   mentions Figma reads stale to searchers and to the AI assistants in §0.8.
2. **"figma weave alternative"** — the new term. Wireflow, Astorie, and Krea already run dedicated
   pages for it; NodeTool had zero surface.

What shipped 2026-07-16:

- **`/vs/weavy` and `/alternatives/weavy` refreshed** — title, hero, bullets, and a new FAQ row
  ("What happened to Weavy?") acknowledge the acquisition while keeping the BYOK/open-source
  argument. The slug and query target stay "weavy".
- **`/vs/figma-weave` and `/alternatives/figma-weave` added** (`competitorEntries.ts`, `isNew`) —
  distinct copy angle from the weavy pages: ecosystem lock-in and post-acquisition ownership
  ("build on a canvas nobody can acquire") rather than a re-tread of the credits argument, with an
  honest "when is Figma Weave the better pick?" FAQ and a free-tier concession row. Both pages are
  one product, so watch GSC for cannibalization between the weavy and figma-weave pages; if one set
  stops earning impressions, fold it into the other with a redirect. Keeping both mirrors how
  Wireflow serves the two query sets today.
- **FAQ page** `/faq/open-source-figma-weave-alternative` — targets the question form AI assistants
  ask (§0.8); JSON-LD comes with the FAQ template.
- **Metadata**: "Figma Weave alternative" keyword on `/` and `/creatives`; homepage JSON-LD and
  the homepage comparison card renamed; `docs/comparisons.md` updated; `llms.txt` regenerated.

Distribution follow-ups (the §6 play, with named targets — these pages rank today and take
listings): request inclusion in Wireflow's "Top 8 Weavy Alternatives", Chase Jarvis's roundup, and
designtools.fyi's Figma Weave page. The migration audience — Weavy users re-evaluating after the
acquisition — is the highest-intent segment this site can address, and "your workflows are files
you own" is the argument acquisitions make for us.

Watch queries (GSC, weekly, alongside the §0.2 set): "weavy alternative", "figma weave
alternative", "figma weave pricing", "figma weave vs", "open source figma weave".

## 0.10 Second capture wave (2026-07-16)

Shipped the same day as §0.9, extending the same playbooks to the rest of the 2026 landscape:

- **Four competitor entries** (`competitorEntries.ts`, all `isNew`): `/vs/firefly-graph` (Adobe's
  Project Graph → Firefly Graph — copy carries both names, same rename-capture logic as §0.9),
  `/vs/freepik-spaces` (Freepik rebranded company-wide to **Magnific** on 2026-04-28 — the copy
  states it and an FAQ row targets "is freepik now magnific"; if "magnific spaces" queries
  materialize, a dedicated slug can follow the figma-weave pattern), `/vs/higgsfield`, and
  `/vs/openart`. Pricing copy avoids exact dollar figures — tiers and mechanisms only, with
  "check their current pricing" hedges — so the pages don't rot with plan changes.
- **Three task hubs** (`taskEntries.ts`): `/tasks/ai-b-roll` ("ai b-roll generator" — one of the
  most-searched editor-tool queries of 2026), `/tasks/ai-storyboard`, and
  `/tasks/consistent-characters` ("consistent character ai video" — a workflow-shaped query a
  node canvas answers better than single-shot tools). Template matchers verified against
  `templateEntries.generated.ts`; model lists reuse version strings already in the data files.
- **`/node-based-ai-editor`** — the §0.2 fix. A dedicated page for the site's only ranking
  non-branded cluster ("ai node editor" and variants, ~5k impressions stuck at position 7–9 on the
  homepage), with the exact phrase in title/h1/hero, definitional section for the informational
  intent, links into `/vs/*`, and SoftwareApplication + FAQPage JSON-LD. In the footer Product
  column. Watch whether it takes over the cluster's impressions from the homepage.
- **Model roster freshness** (`modelEntries.ts`): added `/models/nano-banana` (the Gemini image
  family — very high search volume, provider coverage confirmed: atlascloud/fal/kie/replicate) and
  `/models/grok-imagine` (xAI, kie/replicate). Updated Seedance copy for 2.0 (native audio,
  reference-to-video) and Kling resolution for 3.0; fixed a dead `templateSlug` ("movie-trailers" →
  "movie-trailer-generator") that 404'd the featured-workflow link on all six video model pages.
  Process note: a new model slug needs a keyword entry in `generate-model-coverage.mjs` plus
  `npm run seo:model-coverage`, or the page renders an empty provider table.

Watch queries: "firefly graph alternative", "project graph adobe", "freepik spaces alternative",
"magnific ai", "higgsfield alternative", "openart alternative", "ai b-roll generator", "ai
storyboard generator", "consistent character ai video", "nano banana", "grok imagine", and the
§0.2 "ai node editor" cluster (expect the new page to absorb it).

## 0. What Search Console actually says (audit 2026-07-02)

Everything below §0 was written from a content audit. This section is the first pass with real
Google Search Console data (export pulled 2026-07-02, trailing window): 939 clicks / 48.2k
impressions across 474 pages; 504 clicks / 11.1k impressions across the visible query set; 933
clicks / 40.1k impressions by country. Eight findings, each with the action it forces:

1. **Traffic is almost entirely branded.** "nodetool"-variant queries deliver 389 of 504 visible
   query clicks (77%) at position ~1.7 and 23.6% CTR. Non-branded queries: 115 clicks on 9.4k
   impressions — 1.23% CTR. The doc's premise (the site lacks non-branded surface) is confirmed,
   not just plausible.
2. **Exactly one non-branded cluster ranks, and it's stuck at position 7–9.** "ai node" (3,171
   impressions, pos 7.4), "node ai" (1,093, pos 8.7), "node based ai" (797, pos 8.7), "ai node
   editor" (197, pos 5.8) and ~20 variants — all landing on the homepage. At position 7–9 CTR is
   ~1%; the same impressions at top-3 would be 10–25×. This cluster is also intent-ambiguous
   (Node.js AI? ComfyUI nodes?), which is why the better-intent comparison and use-case queries in
   §3–§4 matter more: the export shows **zero impressions** for "comfyui alternative", "weavy
   alternative", "langflow", or "n8n alternative" — the `/vs/*` pages shipped 07-01/07-02 and have
   no data yet. Watch them weekly.
3. **The US is the weak market, and it's the biggest.** 17.3k of 40.1k impressions are US, but
   average US position is 12.5 vs 6.4–7.3 in every other top-10 country (US CTR 0.59% vs 3–5%
   elsewhere). That gap is authority/competition, not on-page tags — it upgrades §6 (distribution:
   directories, awesome-lists, Show HN, roundup outreach) from "ongoing" to a priority.
4. **Docs earn 39% of impressions and 0.4% CTR.** docs.nodetool.ai: 75 clicks / 18.9k impressions.
   The 375 node-reference URLs in the export took 7.8k impressions for **12 clicks** — the queries
   are "official docs" lookups for third-party libraries (pdfplumber, stable diffusion img2img,
   mlx_whisper) that will never click a NodeTool page. Do not invest in ranking node pages further;
   fix their meta (§4.3) and move on.
5. **The node-docs restructure orphaned 234 of 460 docs URLs in the export (~6.9k impressions) with
   no redirects.** `nodes/comfy/*`, `nodes/mlx/*`, `nodes/huggingface/image_to_image/*`,
   `nodes/lib/pdfplumber/*`, and `runpod-deployment` all 404 now. The mechanism to fix it already
   exists (`_layouts/redirect.html` + `redirect_to` front matter, used by `desktop-app.md`,
   `api.md`, `packs.md`). Batch-generate redirect stubs where a successor page exists
   (`lib/pdfplumber/*` → `lib/pdf/*`, `huggingface/image_to_image/*` → `huggingface/imagetoimage`,
   `runpod-deployment` → `deployment`); let genuinely removed packs 404.
6. **Three docs pages carry real demand and rank badly.** `providers.html` is the second-highest
   impression URL on either domain (3,181 impressions, position 20, 0.09% CTR); `installation.html`
   (1,904, pos 15.1); `comparisons.html` (716, pos 21 — it overlaps the new `/vs/*` pages and
   should link to them prominently). These three are the only docs pages worth active optimization:
   restructure `providers.html` with per-provider H2s and a capability table; expand
   `installation.html` with per-OS sections and troubleshooting.
7. **Marketing pages at position 5–9 get near-zero clicks** — `/cloud` (716 impressions, pos 4.9,
   0 clicks), `/agents` (664, pos 5.1, 0), `/developers` (1,570, pos 6.1, 0.51%), `/creatives`
   (1,034, pos 9.1, 0.48%), `/studio` (942, pos 6.8, 0.32%). Most of these impressions are likely
   sitelinks under branded queries, where the homepage absorbs the click — so title rewrites alone
   won't fix CTR. The durable fix is giving each page a distinct non-branded query target so it
   earns its own impressions: `/agents` → "AI agent workflow builder" (its current title, "Agents
   for creative work", targets nothing anyone searches), `/cloud` → "browser AI workflow builder /
   no-install", `/developers` already targets "AI workflow SDK" reasonably.
8. **AI assistants are a real, visible acquisition channel.** Dozens of queries in the export are
   LLM-generated: persona-length prompts ("shortlist node-based ai editors that let design teams…"),
   `site:`/`after:` operators, and conversational follow-ups ("which is free", "are any of these
   open source?", "you sure?"). NodeTool is being evaluated inside AI-assisted research sessions.
   Actions: add `llms.txt` to nodetool.ai (docs already has one); keep license/pricing/free-tier
   facts as plain crawlable text on `/pricing` and every `/vs/*` page; extend the existing JSON-LD
   (`JsonLd.tsx`, currently on a handful of pages) to all indexed routes.

One stray demand signal: "real time agent api" (132 impressions, pos 36) plus the now-deleted
`nodes/openai/agents/realtimeagent.html` (192 impressions) — there is search demand for a realtime
agent guide; a proper docs page would inherit it.

## 1. Where nodetool.ai stands today

The site (`marketing/src/app/`) has 13 indexed pages: `/`, `/studio`, `/cloud`, `/pricing`,
`/agents`, `/creatives`, `/developers`, two comparison pages (`/vs/comfyui`, `/vs/weavy`), two
use-case pages (`/use-cases/product-video`, `/use-cases/movie-poster`), and three legal pages.

Five gaps stand out:

- **`/use-cases/movie-trailer` exists but is missing from `sitemap.ts`** (`marketing/src/app/sitemap.ts`).
  ~~It has a page folder and an entry in `useCaseEntries.ts` but never reaches search engines.~~
  **Fixed 2026-07-01.**
- **The `/vs/*` comparison pages are orphaned.** Nothing on the site links to them — they're
  reachable only through `sitemap.xml`. Pages with zero internal links get crawled less, rank
  worse, and pass no authority. **Fixed 2026-07-02** with a "Compare" column in the shared footer
  (`marketing/src/components/SiteFooter.tsx`), which gives every comparison page a sitewide
  internal link. Keep this rule for every future page type: nothing ships without at least one
  internal link from an existing page.
- **No blog.** Every competitor identified in research below (Dify, n8n, Flowise, Langflow, Lindy,
  Gumloop, Vellum, StackAI, Wireflow) runs a blog and ranks on "X vs Y" and "best tools for Z"
  queries, which is exactly the traffic NodeTool needs and currently cedes to them.
- **3 use-case pages for 61 shipped example workflows.** The `useCaseEntries.ts` pattern (a single
  data array plus a matching page folder) is already built to scale — it's just underused by a
  factor of 20.
- ~~**No `/marketing` segment page.**~~ **Fixed 2026-07-02.** `/marketing` ships, featuring the
  Product Video Generator, in the nav, footer, and sitemap alongside Creatives/Agents/Developers.
  See §4.0.

The existing meta setup is solid: `layout.tsx` already ships title/description/OG/Twitter tags and
a keyword list (creative AI workspace, BYOK AI canvas, ComfyUI alternative, Weavy alternative,
node-based AI canvas). `robots.txt` and `sitemap.ts` both exist. The problem is page count and
content depth, not technical hygiene.

## 2. Competitive landscape

Three groups of tools currently absorb the search intent NodeTool could capture:

**LLM/agent workflow builders** — Dify, Flowise, Langflow, n8n. StackAI's comparison names Dify
"the best starting point for most teams in 2026" on debugging and knowledge-base features; Langflow
is positioned for teams that need custom Python nodes and LangGraph; Flowise for the fastest path
to a RAG chatbot; n8n where orchestration (retries, branches, schedules) is the hard part
([Runchat comparison](https://runchat.com/p/runchat/runchat-vs-comfyui-vs-n8n-vs-langflow-visual-ai-to-55)).
None of these natively render image, video, or audio — they're text/LLM-first, which is NodeTool's
opening.

**Node-based creative canvases** — ComfyUI (already covered at `/vs/comfyui`), Weavy (covered at
`/vs/weavy` and, post-rebrand, `/vs/figma-weave` — see §0.9; acquisition first flagged in
[Chase Jarvis's review](https://chasejarvis.com/blog/what-the-heck-is-weavy-the-100-honest-review-after-the-figma-acqusition/)),
plus Flora, Freepik Spaces, Krea, Layer AI, Griptape Nodes, and Reflet.ai — all covered in a single
["2026: The Year of the Node-Based Editor"](https://medium.com/@fadimantium/2026-the-year-of-the-node-based-editor-941f0f15d467)
roundup and multiple "Weavy alternatives" posts
([Wireflow](https://www.wireflow.ai/blog/top-8-ai-weavy-alternatives)). Most are browser-only,
credit-metered SaaS with no local execution and no BYOK — the same gap NodeTool already argues
against Weavy, reusable against this whole category.

**Local-first AI tooling** — Ollama, LM Studio, Jan, Open WebUI cover local chat; none combine
local inference with cloud generation or a visual workflow canvas
([overchat.ai roundup](https://overchat.ai/ai-hub/best-offline-ai-apps),
[needaitool.com roundup](https://www.needaitool.com/blogs/local-ai-apps-2026-ollama-lm-studio-open-webui)).

**Net position**: NodeTool is the only tool showing up across all three searches — LLM/agent
builders don't do media, creative canvases don't do local models or agents, local-first tools don't
do workflows. That's the argument every comparison page and use-case page should make concrete,
not assert abstractly.

## 3. Audience segments and what they search

| Segment | What they search | Where they currently land instead |
|---|---|---|
| Creatives (filmmakers, designers) | "text to video pipeline", "ComfyUI alternative no code", "AI movie poster generator" | Runway, Krea, Melies, Weavy alternatives posts |
| Marketing teams (campaigns, growth, social) | "product video AI tool", "AI content calendar generator", "brand asset generator AI", "AI ad video generator" | Lindy, Gumloop, Runway, Weavy alternatives posts |
| Developers / ML engineers | "open source AI agent framework", "RAG pipeline no code", "TypeScript AI workflow SDK", "custom LLM node builder" | Langflow, Flowise, LlamaIndex RAGArch |
| Automation / ops teams | "n8n alternative for AI agents", "no-code AI workflow local", "email triage AI automation" | n8n, Activepieces, Gumloop |
| Privacy-conscious / local-first users | "run AI models locally desktop app", "local LLM privacy no cloud", "self-hosted AI agent" | Jan, LM Studio, Ollama-based roundups |
| Researchers / knowledge workers | "chat with PDF tool", "summarize research papers AI", "document RAG open source" | Kapa.ai, Prisme.ai |

The site already has landing pages for creatives, developers, and agents (automation). It has none
targeting marketing teams specifically, even though the homepage copy names them by title (see
§4.0) — nor the local-first/privacy segment (this is argued piecemeal on `/studio` and in
comparisons, never as its own page), nor the researcher/knowledge-worker segment (despite shipping
5 document-processing example workflows: Chat with Docs, Index PDFs, Summarize Paper, Fetch Papers,
Meeting Transcript Summarizer).

## 4. Page-type playbooks

### 4.0 Segment landing page — `/marketing`

**Shipped 2026-07-02.** `/creatives`, `/agents`, `/developers`, and now `/marketing` are each a
persona-framed rewrite of the same product, built to rank on that persona's job-title searches and
to give paid/social traffic a landing page that speaks their language instead of the generic
homepage.

`/marketing` (`marketing/src/app/marketing/page.tsx`) follows the `/creatives` pattern — headline,
"why marketing teams choose NodeTool" section, a lead use-case feature, community/CTA — and is in
`sitemap.ts` at priority 0.8/monthly, the main nav, and the footer "Solutions" column:

- **Lead use case**: Product Video Generator (`use-cases/product-video`, already `category:
  "Marketing"` in `useCaseEntries.ts`), featured with its own section and real assets.
- **Supporting use cases still to build** (§4.2 backlog): Social Media Calendar Filler, Brand Asset
  Generator, Cold Outreach Co-Pilot, YouTube Thumbnail Pipeline. `/marketing` lists these as
  "coming soon" teaser cards (no dead links — they get real hrefs once `useCaseEntries.ts` gains
  matching entries and page folders with real generated assets).
- **Target keywords**: "AI product video generator", "AI content calendar tool", "brand asset
  generator AI", "AI ad video tool open source" (§3) — in the page's metadata/keywords.
- **Differentiation angle**: same BYOK/no-markup argument as `/creatives`, reframed around output
  volume and cost-per-asset at campaign scale rather than single-artifact craft.

### 4.1 Comparison pages (`/vs/*`)

Pattern already proven at `marketing/src/app/vs/comfyui/page.tsx` and `vs/weavy/page.tsx`
(feature-table format, ~250 lines each, hand-built per page). Expand from 2 to a target list based
on what people are already comparing:

1. ~~`/vs/langflow` — pull in the "no media generation" gap~~ **Shipped 2026-07-02.** Angle used:
   both cover agents/RAG; only NodeTool generates media natively (Langflow is MIT, has a
   macOS/Windows desktop app — the honest table concedes both).
2. ~~`/vs/flowise` — same gap, plus BYOK vs. hosted credits~~ **Shipped 2026-07-02.** Angle used:
   Flowise is the fastest path to a LangChain RAG chatbot; NodeTool covers the same agent/RAG
   ground and adds native image, video, and music generation plus editing tools on the same canvas.
3. ~~`/vs/n8n` — orchestration-only vs. orchestration + native generation~~ **Shipped 2026-07-02.**
   Angle used: "workflows that create, not just connect", plus AGPL-3.0 (open source) vs.
   Sustainable Use License (fair-code, commercially restricted) — a real differentiator n8n's own
   docs confirm. The FAQ answers "when should I pick n8n instead?" honestly (400+ connectors,
   schedules/retries), which is what makes the rest of the page credible.
4. `/vs/flora` (or a combined "AI canvas alternatives" page covering Flora, Freepik Spaces, Krea)
5. ~~`/vs/dify` — RAG/agent platform, no creative media~~ **Shipped 2026-07-02.** Angle used: Dify
   is a strong text-first LLM app platform (prompt orchestration, knowledge bases, agent
   debugging); NodeTool starts from the same agent/RAG ground and adds native media generation and
   editing tools. License claim about Dify's modified Apache 2.0 terms is hedged ("check Dify's own
   license file for current terms") rather than asserted precisely, since Dify's commercial-use
   conditions change between releases.
6. `/vs/lmstudio` or `/vs/jan` — local chat only vs. local + cloud workflow canvas

Each page keeps the existing format: one comparison table, one differentiation section, one CTA.
Do not invent a new template per competitor — the value here is coverage, not novelty.

### 4.2 Use-case pages (`/use-cases/*`)

The `useCaseEntries.ts` array is the scaling mechanism: add an entry, build the matching page
folder. 61 example workflows already exist in
`packages/base-nodes/nodetool/examples/nodetool-base/` with titles, descriptions, and (per the
internal audit) natural category groupings. Prioritize by search-intent match, not by what's
easiest to build:

- **Ship first** (clear existing search terms, per §3): Research Paper Summarizer, Chat with Docs
  (→ "chat with PDF"), Meeting Transcript Summarizer, Music Video Visualizer
- **Ship second**: Hacker News Agent / YouTube Research Agent (agent-mode examples double as
  `/agents` landing-page proof)
- **Marketing segment** (feature on `/marketing`, see §4.0): Cold Outreach Co-Pilot, Social Media
  Calendar Filler, Brand Asset Generator, YouTube Thumbnail Pipeline
- **Fix immediately**: add `/use-cases/movie-trailer` to `sitemap.ts` (see §1)

At 61 candidates, treat this as a backlog, not a one-time push — 3-5 new use-case pages per month
sustains a steady stream of long-tail landing pages without a content team.

### 4.3 Node / provider pages

`docs/nodes/<provider>/` and `docs/developer/providers/<provider>.md` already exist for FAL, KIE,
Gemini, ElevenLabs, Together, Replicate, Ollama, HuggingFace, Topaz, AtlasCloud, and more (20+
providers). These are developer docs, not landing pages, but each one is a near-zero-cost target
for provider-name search traffic ("FAL nodes for NodeTool", "use Kling in NodeTool") once they carry
proper titles/descriptions and get linked from `/developers`. No new pages needed here — just meta
tags on what already exists (see §5).

### 4.4 Blog (net new)

No blog exists. This is the biggest structural gap relative to every competitor in §2. Recommended
scope, not a general-purpose blog:

- **Comparison/roundup posts** that NodeTool can legitimately win a mention in: "best ComfyUI
  alternatives 2026", "open source Weavy alternatives", "local-first AI tools 2026" — these are the
  exact post titles already ranking for competitors (§2 sources). Writing NodeTool's own version,
  plus getting listed in the external ones (see §6), covers both sides.
- **Cookbook walkthroughs** built directly from `docs/cookbook/core-concepts.md` and the 15+
  recipes in `docs/cookbook.md` — these already exist as docs; a blog post is a rewrite with a
  narrative frame and screenshots, not new research.
- **Technical posts for the developer segment**: actor-model workflow execution, the Python bridge
  (`PythonStdioBridge`), the planning agent system (`packages/agents/`) — these map to real
  architecture (`docs/architecture.md`, `docs/AGENTS.md`) and target "how do AI agent frameworks
  work" / "TypeScript LLM orchestration" searches from engineers evaluating tools.

## 5. Technical SEO checklist

- [x] Add `/use-cases/movie-trailer` to `marketing/src/app/sitemap.ts` (shipped 2026-07-01)
- [x] Internal-link the `/vs/*` pages — footer "Compare" column in `SiteFooter.tsx` links all four
      comparison pages sitewide (shipped 2026-07-02); every future page needs at least one internal
      link before it ships
- [x] Build `/marketing` (§4.0) and add it to `sitemap.ts` at priority 0.8 / monthly — same tier as
      `/agents`, `/creatives`, `/developers` — plus main nav (shipped 2026-07-02)
- [x] Confirm every new page under `/vs/`, `/use-cases/`, `/marketing`, and any future `/blog/` gets
      an `opengraph-image.tsx` (all six `vs/*` pages and `/marketing` do — keep the pattern)
- [x] Add `priority`/`changeFrequency` entries to `sitemap.ts` for every new page as it ships —
      don't let the list drift out of sync with `app/` folders again (`/marketing`, `/vs/flowise`,
      `/vs/dify` added 2026-07-02)
- [x] Add every new indexed route to `marketing/tests/e2e/smoke.spec.ts` — it guards title,
      single-`h1`, and render status per route (`/marketing`, `/vs/flowise`, `/vs/dify` added
      2026-07-02)
- [ ] Verify `docs/nodes/<provider>/index.md` pages carry unique titles and descriptions (currently
      generated docs; check for duplicate/boilerplate meta across providers)
- [ ] Internal linking: `/agents`, `/creatives`, `/developers` should each link to the use-case
      pages relevant to their segment (per §3's mapping) — `/marketing` now does this for its lead
      use case, but the use-case showcase otherwise only appears on the homepage and `/creatives`

## 6. Distribution (off-site)

Content only ranks if something points at it:

- **"Alternatives to X" roundups** (Wireflow, Lindy, Vellum, Gumloop, StackAI, and similar sites
  identified in §2 already publish and rank these lists) — get NodeTool listed via outreach when a
  new comparison or use-case page ships. This is lower effort than link-building from scratch and
  targets people already close to a decision.
- **Directories already listing NodeTool**: futuretools.io, theaidb.com, SourceForge (confirmed via
  search in this audit). Keep listings current with each release; check for others in the same
  category (There's An AI For That, AI Tools Directory sites).
  Adjacent projects to note for competitive tracking, not for outreach: `alvinreal/awesome-opensource-ai`
  and `light-and-ray/awesome-alternative-uis-for-comfyui` on GitHub — both are community-curated
  lists where a PR adding NodeTool is a legitimate, low-effort listing (not unsolicited outreach).
- **GitHub topics and README SEO**: confirm the repo carries relevant GitHub topics (`ai-workflow`,
  `comfyui-alternative`, `llm-agents`, `node-based`, `local-first`) — these surface in GitHub's own
  search and get scraped into "awesome-*" lists.
- **Reddit / Hacker News**: no existing discussion threads found in this audit (searched directly).
  This is upside, not a gap to fix — a Show HN or r/LocalLLaMA / r/comfyui post timed to a specific
  release (e.g., a new local-model integration) reaches an audience already primed for exactly this
  positioning.

## 7. Prioritized roadmap

Re-prioritized 2026-07-02 against the Search Console audit in §0.

1. **Immediate** (hours): ~~fix the `movie-trailer` sitemap omission (§1, §5)~~ done 2026-07-01;
   ~~internal-link the orphaned `/vs/*` pages (§1, §5)~~ done 2026-07-02; ~~batch-generate redirect
   stubs for the moved node-docs URLs (§0.5)~~ done 2026-07-02 (79 stubs); ~~link
   `comparisons.html` to the `/vs/*` pages (§0.6)~~ done 2026-07-02; ~~add `llms.txt` to
   nodetool.ai (§0.8)~~ done 2026-07-02.
2. **Phase 1** (this month): ~~rework `providers.html` and `installation.html` — the two
   highest-demand docs pages, both ranking on page 2 (§0.6)~~ done 2026-07-02; ~~give `/agents`
   and `/cloud` distinct non-branded query targets (§0.7)~~ done 2026-07-02; ~~build `/marketing`
   (§4.0)~~ done 2026-07-02 — its four
   supporting use-case pages (Cold Outreach Co-Pilot, Social Media Calendar Filler, Brand Asset
   Generator, YouTube Thumbnail Pipeline) still need real generated assets before they can ship;
   ship the remaining "ship first" use-case pages (§4.2); ~~add `/vs/langflow` and `/vs/n8n`~~ done
   2026-07-02, ~~add `/vs/flowise` and `/vs/dify`~~ done 2026-07-02 — next comparison target is
   `/vs/flora` (or a combined AI-canvas-alternatives page, §4.1 item 4).
3. **Phase 2** (next month): distribution (§6) — upgraded from "ongoing" because the US
   position gap (§0.3) is an authority problem: submit to the two GitHub awesome-lists, refresh
   directory listings, and time a Show HN / r/LocalLLaMA post to a release; stand up the blog with
   3 posts — one comparison/roundup post, one cookbook walkthrough, one technical post (§4.4).
4. **Ongoing**: 3-5 use-case pages/month from the remaining 61-workflow backlog; one comparison page
   per new credible competitor; internal-link every new page from its matching segment landing page
   (§5); check the `/vs/*` pages' query impressions weekly until they register (§0.2).

## 8. Measurement

Baseline (GSC export, trailing window ending 2026-07-02): 939 clicks / 48.2k impressions total;
non-branded 115 clicks / 9.4k impressions / 1.23% CTR; US position 12.5; docs 75 clicks / 18.9k
impressions. The numbers to move: non-branded clicks (proves §4's content plan), US average
position (proves §6's distribution plan), and impressions on `/vs/*` and `/use-cases/*` (currently
zero — proves the pages are entering the index at all).

Track per page: organic impressions/clicks (Search Console), and which comparison/use-case pages
convert to `/studio` or `/pricing` visits (the two highest-priority pages in the existing sitemap).
Re-run the competitive scan in §2 quarterly — this is a fast-moving category and new entrants
(Flora, Reflet.ai, both surfaced only in this audit's research) can appear within months.
