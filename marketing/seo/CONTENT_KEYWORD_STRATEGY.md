# Content & keyword strategy

Long-tail and differentiation keywords for nodetool.ai. Written against what the
site ships today (`marketing/src/data/*`), so every row below is either an
existing URL to strengthen or a named gap to fill. Nothing here duplicates a
live page.

Volume is not quoted as a number anywhere. Where a tier is given it is a
relative estimate (`high` / `mid` / `low` / `near-zero`), judged from SERP
competition and phrasing, not from a keyword tool.

## What already exists

| Engine | Route shape | Count today | Data module |
|---|---|---|---|
| Static | `/`, `/studio`, `/cloud`, `/pricing`, `/agents`, `/developers`, `/marketing` | 7 + legal | `staticEntries.ts` |
| Competitors | `/vs/<slug>`, `/alternatives/<slug>` | 13 competitors × 2 | `competitorEntries.ts` |
| Models | `/models/<slug>`, `/models/<a>-vs-<b>` | 10 + pairs | `modelEntries.ts`, `modelComparisonEntries.ts` |
| Providers | `/providers/<slug>` | 24 | `providerEntries.ts` |
| FAQ + glossary | `/faq`, `/faq/<slug>` | 15 | `faqEntries.ts` |
| Solutions | `/solutions/<slug>` | 6 | `landingEntries.ts` |
| Tasks | `/tasks/<slug>` | 6 | `taskEntries.ts` |
| Templates | `/templates/<slug>` | generated from shipped examples | `templateEntries.generated.ts` |
| Mini apps | `/apps/<slug>` | generated from example bundles | `miniAppEntries.generated.ts` |
| Ideas | `/ideas/<category>` | one per catalog category | `ideasEntries.ts` |
| Showcase | `/showcase/**` | generated per batch | `showcasePages.ts` |
| Use cases (hand-built) | `/use-cases/{movie-poster,movie-trailer,product-video}` | 3 | route folders |
| Blog | `/blog/<slug>` | one per file in `content/blog/` | `blogEntries.generated.ts` |

One structural hole: `/vs` and `/alternatives` have no hub index (only
`[slug]`). It is addressed below. The tutorial route is `/blog`; its
editorial formulas and backlog are in [BLOG_STRATEGY.md](BLOG_STRATEGY.md).

## Seed keyword audit

The eight stakeholder seeds, mapped onto what ships:

| Seed | Covered today? | Verdict |
|---|---|---|
| agent-first AI workspace | `/agents`, `/faq/what-does-agent-first-mean` | Term is owned but undefended — no cluster beneath it |
| local-first visual AI workflow | `/solutions/local-first`, `/studio` | Landing exists, no supporting how-to depth |
| BYOK AI node editor | `/pricing`, `/faq/what-is-byok`, `/providers/*` | Concept explained, never given a page to rank |
| ComfyUI alternative for agents | `/vs/comfyui`, `/alternatives/comfyui` | Head term covered; the *for agents* qualifier is not |
| open source multimodal AI canvas | homepage only | No `/open-source` surface; homepage cannot rank for all of it |
| privacy-first AI workflow builder | partially `/solutions/local-first` | Gap. `/privacy` is the legal page and must stay that |
| AI agent that builds workflows | none | Largest gap, and the sharpest differentiator |
| local RAG + image/video pipeline | `/faq/what-is-rag` only | Gap. No `/tasks/rag`, no local-RAG guide |

Two SERP notes worth acting on. "BYOK" is currently dominated by AI *coding*
tools; write BYOK pages against "AI image/video generation" modifiers, not the
bare acronym. "ComfyUI alternative" is a listicle SERP — the win comes from
qualifiers (`for agents`, `for video`, `without a GPU`, `for macOS`), not from
the head term.

## Keyword map

Intent: `I` informational · `C` commercial-investigation · `T` transactional.
Funnel: `TOF` / `MOF` / `BOF`. `P` = primary target, `S` = secondary.

| Keyword / cluster | Intent | Funnel | Target URL | P/S | Est. tier | Internal links out |
|---|---|---|---|---|---|---|
| ai agent that builds workflows | I | TOF | `/agents` (new: `/agents/workflow-builder-agent`) | P | mid | `/templates/*`, `/faq/what-is-a-planning-agent`, `/vs/n8n` |
| agent that fixes broken workflows | I | MOF | new `/guides/agent-repairs-a-failing-workflow` | P | low | `/agents`, `/developers` |
| agent-first ai workspace | C | TOF | `/agents` | P | near-zero (brand-defining) | `/`, `/faq/what-does-agent-first-mean` |
| what does agent-first mean | I | TOF | `/faq/what-does-agent-first-mean` | P | low | `/agents` |
| visual agent builder open source | C | MOF | `/agents` | S | mid | `/vs/langflow`, `/vs/flowise` |
| ai agent builds mini app | I | MOF | new `/apps` hub copy + `/guides/prompt-to-mini-app` | P | near-zero | `/apps/*`, `/agents` |
| local-first ai workflow | C | MOF | `/solutions/local-first` | P | low | `/studio`, `/tasks/*` |
| run ai models locally on mac | I | TOF | new `/guides/run-local-models-apple-silicon` | P | high | `/studio`, `/solutions/local-first` |
| ollama visual workflow / ollama node editor | I | MOF | new `/guides/ollama-workflows` | P | mid | `/providers/*`, `/solutions/local-first` |
| offline ai image generation | I | TOF | new `/solutions/offline` | P | mid | `/studio`, `/tasks/text-to-image` |
| privacy-first ai workflow builder | C | MOF | new `/solutions/privacy-first` | P | low | `/solutions/local-first`, `/cloud`, `/privacy` |
| ai tool that doesn't send data to the cloud | I | TOF | `/solutions/privacy-first` | S | mid | `/studio` |
| self-hosted ai workflow platform | C | MOF | new `/solutions/self-hosted` | P | mid | `/developers`, `/cloud`, `/vs/n8n` |
| byok ai image generation | C | MOF | new `/byok` | P | low | `/pricing`, `/providers`, `/faq/what-is-byok` |
| bring your own api key ai canvas | C | MOF | `/byok` | S | low | `/providers/*` |
| ai tools with no credits / no markup | C | BOF | `/pricing` | P | mid | `/byok`, `/vs/flora`, `/vs/krea` |
| how much does <provider> cost through nodetool | C | BOF | `/providers/<slug>` | S | low | `/pricing`, `/models/<slug>` |
| comfyui alternative for agents | C | MOF | new `/alternatives/comfyui-for-agents` | P | low | `/vs/comfyui`, `/agents` |
| comfyui alternative for video | C | MOF | new `/alternatives/comfyui-for-video` | P | mid | `/tasks/image-to-video`, `/models/*` |
| comfyui alternative without a gpu | C | MOF | new `/alternatives/comfyui-without-a-gpu` | P | mid | `/cloud`, `/providers/fal` |
| migrate from comfyui | I | MOF | new `/guides/comfyui-to-nodetool` | P | low | `/vs/comfyui`, `/templates/*` |
| best ai workflow builders / comparison hub | C | MOF | new `/alternatives` hub | P | high | every `/alternatives/<slug>` |
| nodetool vs <tool> | C | BOF | `/vs/<slug>` | P | low | `/alternatives/<slug>`, `/pricing` |
| open source ai canvas | C | TOF | new `/open-source` | P | mid | `/`, GitHub, `/developers` |
| open source multimodal ai workspace | C | TOF | `/open-source` | S | low | `/tasks`, `/models` |
| open source alternative to <closed canvas> | C | MOF | `/alternatives/flora`, `/alternatives/krea`, `/alternatives/figma-weave` | P | mid | `/open-source` |
| local rag pipeline | I | MOF | new `/tasks/rag` | P | mid | `/faq/what-is-rag`, `/solutions/local-first` |
| chat with your documents locally | I | TOF | new `/guides/local-rag-chat-with-documents` | P | high | `/tasks/rag`, `/templates/*` |
| rag + image generation pipeline | I | MOF | new `/guides/rag-to-image-pipeline` | P | near-zero | `/tasks/rag`, `/tasks/text-to-image` |
| image to video workflow | I | MOF | `/tasks/image-to-video` | P | mid | `/models/kling`, `/models/veo-3` |
| text to video ai workflow | I | MOF | new `/tasks/text-to-video` | P | high | `/models/sora`, `/models/veo-3` |
| ai video upscaling workflow | I | MOF | `/tasks/upscale-video` | P | mid | `/providers/topaz` |
| batch image generation | I | MOF | new `/tasks/batch-generation` | P | mid | `/templates/*`, `/apps/*` |
| <model> vs <model> | C | MOF | `/models/<a>-vs-<b>` | P | high | `/showcase/model/*`, `/tasks/*` |
| what is a node-based workflow | I | TOF | `/faq/what-is-a-node-based-workflow` | P | mid | `/`, `/templates` |
| what is a planning agent | I | TOF | `/faq/what-is-a-planning-agent` | P | low | `/agents` |
| what is byok | I | TOF | `/faq/what-is-byok` | P | mid | `/byok`, `/pricing` |
| ai workflow template <task> | T | BOF | `/templates/<slug>` | P | low | `/tasks/<slug>`, `/ideas/<cat>` |

## Pillar and cluster structure

Five pillars. Each pillar page is the canonical target for its head term and
links down to every cluster page; every cluster page links back up exactly
once, in its first two paragraphs.

### Pillar 1 — Agent-first (`/agents`)

The differentiator nobody else on the comparison set claims: the agent builds,
runs, and repairs the workflow on the same canvas the user edits.

| Cluster page | Status |
|---|---|
| `/agents/workflow-builder-agent` | new |
| `/guides/agent-repairs-a-failing-workflow` | new |
| `/guides/prompt-to-mini-app` | new |
| `/apps/<slug>` | exists (generated) |
| `/faq/what-is-a-planning-agent`, `/faq/what-does-agent-first-mean` | exist |
| `/alternatives/comfyui-for-agents` | new |

### Pillar 2 — Local-first & privacy (`/solutions/local-first`)

| Cluster page | Status |
|---|---|
| `/studio` | exists |
| `/guides/run-local-models-apple-silicon` | new |
| `/guides/ollama-workflows` | new |
| `/solutions/offline` | new |
| `/solutions/privacy-first` | new |
| `/solutions/self-hosted` | new |
| `/vs/lm-studio`, `/vs/jan` | exist |

### Pillar 3 — BYOK & cost ownership (`/byok`, new)

Today BYOK is a pricing bullet and an FAQ row with no page of its own. The
pillar page carries the arithmetic — what a run costs at provider rates, with
no markup — and feeds the 24 provider pages.

| Cluster page | Status |
|---|---|
| `/pricing` | exists |
| `/providers/<slug>` × 24 | exist |
| `/guides/what-a-workflow-actually-costs` | new |
| `/faq/what-is-byok`, `/faq/does-nodetool-mark-up-model-pricing` | exist |

### Pillar 4 — Open-source canvas & migration (`/open-source`, new)

| Cluster page | Status |
|---|---|
| `/alternatives` hub | new |
| `/alternatives/<slug>` × 13, `/vs/<slug>` × 13 | exist |
| `/alternatives/comfyui-for-video`, `/alternatives/comfyui-without-a-gpu` | new |
| `/guides/comfyui-to-nodetool` | new |
| `/developers` | exists |

### Pillar 5 — Multimodal pipelines (`/tasks`)

The volume pillar: one hub per capability, each pulling in the models that do
it, the templates that wire it, and showcase output.

| Cluster page | Status |
|---|---|
| `/tasks/<slug>` × 6 | exist |
| `/tasks/text-to-video`, `/tasks/rag`, `/tasks/batch-generation`, `/tasks/speech-to-text`, `/tasks/image-editing` | new |
| `/models/<slug>`, `/models/<a>-vs-<b>` | exist |
| `/templates/<slug>`, `/ideas/<category>` | exist |
| `/showcase/**` | exists |

## Backlog

Effort: **S** = new row in an existing data module (`landingEntries`,
`taskEntries`, `faqEntries`, `competitorEntries`) — no new route folder. **M** =
new route folder or a new data module. **L** = new engine plus research or
asset generation.

Impact is judged on differentiation × reachable demand, not raw volume.

### Comparison posts

| # | Title | Slug | Effort | Impact | Notes |
|---|---|---|---|---|---|
| 1 | AI Workflow Builders Compared | `/alternatives` | M | High | Hub for 13 existing pages; recovers the internal-link equity they currently leak |
| 2 | ComfyUI Alternative for AI Agents | `/alternatives/comfyui-for-agents` | S | High | The seed keyword, verbatim. Qualifier avoids the listicle SERP |
| 3 | ComfyUI Alternative for Video Workflows | `/alternatives/comfyui-for-video` | S | High | Points at `/tasks/image-to-video` and the video model pages |
| 4 | ComfyUI Alternative Without a GPU | `/alternatives/comfyui-without-a-gpu` | S | Mid | Routes to `/cloud` and `/providers/fal` |
| 5 | NodeTool vs Open WebUI | `/vs/open-webui` | S | Mid | Local-runtime cluster; pairs with lm-studio and jan |
| 6 | NodeTool vs InvokeAI | `/vs/invokeai` | S | Mid | Named in every ComfyUI-alternative listicle |
| 7 | NodeTool vs SwarmUI | `/vs/swarmui` | S | Low | Same listicle set, thinner demand |
| 8 | NodeTool vs Replicate | `/vs/replicate` | S | Mid | "API vs canvas" framing; strong BYOK tie-in |
| 9 | NodeTool vs Make | `/vs/make` | S | Mid | Automation cluster alongside n8n and gumloop |
| 10 | Open Source Alternatives to Credit-Metered AI Canvases | `/alternatives/credit-metered-canvases` | S | Mid | Category page above flora, krea, figma-weave |

### Tutorials (needs a `/guides` engine — see "Build order")

| # | Title | Slug | Effort | Impact | Notes |
|---|---|---|---|---|---|
| 11 | Run Local AI Models on Apple Silicon | `/guides/run-local-models-apple-silicon` | L | High | Highest-volume item in the whole backlog |
| 12 | Chat With Your Documents, Fully Local | `/guides/local-rag-chat-with-documents` | L | High | Half of the "local RAG" seed |
| 13 | Ollama Workflows on a Canvas | `/guides/ollama-workflows` | L | High | Ollama-modifier queries are underserved by node-editor content |
| 14 | Migrating From ComfyUI | `/guides/comfyui-to-nodetool` | L | High | Bottom-funnel; the page a switcher searches for |
| 15 | From Prompt to Mini App | `/guides/prompt-to-mini-app` | L | High | Only NodeTool can write this one |
| 16 | Let an Agent Repair a Failing Workflow | `/guides/agent-repairs-a-failing-workflow` | L | Mid | Proof for the agent-first pillar |
| 17 | From RAG Answer to Generated Image | `/guides/rag-to-image-pipeline` | L | Mid | The full seed phrase: local RAG + image/video |
| 18 | What a Workflow Actually Costs | `/guides/what-a-workflow-actually-costs` | L | High | Real provider arithmetic; the sharpest BYOK asset |
| 19 | Bring Your Own Key: Setup Per Provider | `/guides/byok-setup` | L | Mid | Feeds all 24 provider pages |
| 20 | Batch-Generate 100 Images From a Spreadsheet | `/guides/batch-generate-from-a-spreadsheet` | L | Mid | Concrete, links to templates and apps |

### Use-case deep dives (`/solutions`, `/tasks`)

| # | Title | Slug | Effort | Impact | Notes |
|---|---|---|---|---|---|
| 21 | ~~Privacy-First AI Workflow Builder~~ | `/solutions/privacy-first` | S | High | ~~Seed keyword. Distinct from the legal `/privacy` page~~ **Shipped 2026-08-07.** |
| 22 | Offline AI Generation | `/solutions/offline` | S | Mid | Splits "offline" intent off the local-first landing |
| 23 | ~~Self-Hosted AI Workflows~~ | `/solutions/self-hosted` | S | High | ~~Owns the deploy/ownership query set~~ **Shipped 2026-08-07.** |
| 24 | AI Workflows for Agencies | `/solutions/agencies` | S | Mid | Client-work framing; per-client key isolation |
| 25 | AI Workflows for Game Art | `/solutions/game-art` | S | Mid | Asset batches, style consistency |
| 26 | AI Workflows for E-commerce Product Shots | `/solutions/product-shots` | S | High | Existing showcase prompts already cover this |
| 27 | ~~Text to Video~~ | `/tasks/text-to-video` | S | High | ~~Missing from a 6-task hub set; high demand~~ **Shipped 2026-08-07.** |
| 28 | ~~Local RAG~~ | `/tasks/rag` | S | High | ~~Seed keyword; the hub the RAG guides point at~~ **Shipped 2026-08-07.** |
| 29 | Batch Generation | `/tasks/batch-generation` | S | Mid | Cross-links templates, apps, showcase |
| 30 | Speech to Text | `/tasks/speech-to-text` | S | Mid | Completes the audio task set with text-to-speech |
| 31 | Image Editing & Inpainting | `/tasks/image-editing` | S | Mid | Big shipped node coverage, no hub |

### Concept and product pages

| # | Title | Slug | Effort | Impact | Notes |
|---|---|---|---|---|---|
| 32 | BYOK: Your Keys, No Markup | `/byok` | M | High | Pillar 3's missing home |
| 33 | Open Source AI Canvas | `/open-source` | M | High | Pillar 4's missing home; license, repo, self-host |
| 34 | The Agent That Builds Your Workflow | `/agents/workflow-builder-agent` | M | High | The single strongest differentiation page on this list |

### Glossary / definition pages (`/faq`)

Each is one row in `faqEntries.ts`, rendered on `/faq/<slug>` and inlined on the
surfaces listed in its `surfaces` field. Keep them short; the deep version lives
on docs.nodetool.ai and must not be duplicated here.

| # | Question | Slug | Effort | Impact |
|---|---|---|---|---|
| 35 | What is a multimodal AI workflow? | `/faq/what-is-a-multimodal-workflow` | S | Mid |
| 36 | What does local-first mean for AI tools? | `/faq/what-is-local-first-ai` | S | Mid |
| 37 | What is a workflow template? | `/faq/what-is-a-workflow-template` | S | Low |
| 38 | What is a mini app? | `/faq/what-is-a-mini-app` | S | Mid |
| 39 | ~~Do I need a GPU to run NodeTool?~~ | `/faq/do-i-need-a-gpu` | S | High — **Shipped 2026-08-07.** |
| 40 | Can I use NodeTool commercially? | `/faq/commercial-use` | S | Mid |

### Build order

Ship in three waves, cheapest-first so the `/guides` engine is justified by
traffic the S-effort rows already prove out.

| Wave | Items | Why |
|---|---|---|
| 1 | 2, 3, 4, 21, 23, 27, 28, 39 | All S-effort rows in existing modules. No new routes. **21, 23, 27, 28, 39 shipped 2026-08-07**; 2–4 (qualified alternatives) remain — they need route changes beyond a data row |
| 2 | 1, 32, 33, 34 | Four hub/pillar pages; each needs a route folder but no new engine |
| 3 | 11–20 | The `/guides` engine: one `guideEntries.ts` module plus `app/guides/[slug]`, registered in `registry.ts` like every other engine |

Wave 3 is one engine, not ten page builds. Follow the existing pattern —
a data module exporting `PageEntry[]`, appended to `registryModules` — so the
sitemap and the Playwright smoke walk pick the pages up with no other edit.

## Title, H1, and meta patterns

One pattern per page type. All titles end in the brand except where the page's
head term already contains it.

| Page type | `<title>` | H1 | Meta description |
|---|---|---|---|
| Comparison `/vs/<x>` | `NodeTool vs <X> — <the one real difference>` | `NodeTool vs <X>` | The difference, stated as fact, plus one concession. ≤155 chars |
| Alternative `/alternatives/<x>` | `<N> <X> Alternatives (<year>)` | `<X> alternatives` | Name the limitation the searcher has, then the list |
| Qualified alternative | `<X> Alternative for <qualifier>` | `<X> alternative for <qualifier>` | Lead with the qualifier, not the brand |
| Task `/tasks/<x>` | `<Task> with AI — models, workflows, and templates` | `<Task>` | What the task is + which models do it |
| Solution `/solutions/<x>` | `<Outcome> — NodeTool` | `<Outcome>` | Outcome first, mechanism second |
| Model `/models/<x>` | `<Model> — pricing, providers, and workflows` | `<Model>` | Provider coverage and one capability fact |
| Model pair | `<A> vs <B> — same prompt, side by side (<year>)` | `<A> vs <B>` | The verdict in one sentence |
| Template `/templates/<x>` | `<Name> — NodeTool AI Workflow Template` | `<Name>` | What the graph does, in one sentence |
| Mini app `/apps/<x>` | `<Name> — AI mini app` | `<Name>` | What it takes in, what it gives back |
| Guide `/guides/<x>` | `<Task-shaped title>` | Same as title | The outcome and the time it takes |
| FAQ `/faq/<x>` | The question, verbatim | The question, verbatim | The first sentence of the answer |
| Pillar | `<Head term>` | `<Head term>` | The claim, then the proof |

Rules that hold everywhere:

- One H1 per page, matching the primary keyword's head noun. Never two phrasings
  of the same term on one page.
- Meta descriptions ≤155 characters, written as a claim rather than a summary.
  No "Learn more about…".
- `yearToken()` in titles only where recency is genuinely the ranking signal
  (alternatives lists, model pairs). Not on evergreen concept pages.
- A page targets one primary keyword. When two pages would target the same one,
  merge them or re-qualify one of them.
- Every new page ships a `PageEntry` with `indexable`, `priority`, and
  `changeFrequency` set. `indexable: false` for anything thin.

## Internal linking rules

1. **Pillar ↔ cluster is bidirectional and singular.** Cluster pages link up to
   their pillar once, in the first two paragraphs, with the pillar's head term
   as anchor. The pillar links down to every cluster page.
2. **Never cross pillars sideways at the top.** A cluster page may link to
   another pillar's cluster page, but only below the fold and only where the
   next action is genuinely there.
3. **Anchors are the target's head term**, not "click here" and not the raw
   URL. Vary the anchor across sources so 30 pages don't repeat one string.
4. **Comparison pages** link to: `/pricing` (the cost argument), the sibling
   `/vs` ⇄ `/alternatives` page, and at most two task or template pages that
   prove the claim.
5. **Task hubs** link to the models that do the task, the templates that wire
   it, and showcase output for it. That triangle is already built in
   `taskEntries.ts` — keep new tasks inside it.
6. **Template and showcase pages** link *up* to their task hub and *across* to
   one related template. They are the widest, thinnest layer; they must not be
   dead ends.
7. **FAQ rows** use `relatedRoute` for the single best next page and `surfaces`
   to inline themselves on comparison, agent, and model pages. That is the
   cheapest internal link on the site — set both on every new row.
8. **Depth budget: three clicks from `/`.** Pillar at depth 1, cluster at
   depth 2, generated long tail at depth 3. Anything deeper needs a hub.
9. **Cross-domain**: link out to docs.nodetool.ai for the deep how-to and back
   from docs to the pillar. Do not re-host doc content on the marketing site —
   the glossary rows in `faqEntries.ts` already draw that line, keep it.

## Measurement

Track by cluster, not by page. Reporting cadence: monthly, with the query
buckets below pulled from Search Console.

| Bucket | Queries to track | Success at 6 months |
|---|---|---|
| Agent-first | `ai agent that builds workflows`, `agent-first ai`, `visual agent builder`, `agent builds mini app` | Top 10 for the exact seed phrase; the term appears in third-party writeups |
| Local & private | `local-first ai workflow`, `run ai models locally mac`, `offline ai image generation`, `privacy-first ai workflow` | Top 20 on two of four; `/solutions/*` is the top non-brand entry cluster |
| BYOK | `byok ai image generation`, `bring your own api key ai`, `ai tool no credits` | `/byok` ranks top 20 and outranks `/pricing` for BYOK-modified queries |
| Migration | `comfyui alternative for agents`, `comfyui alternative for video`, `migrate from comfyui` | Top 10 on the two qualified terms; head `comfyui alternative` on page 2 |
| Multimodal tasks | `<task> ai workflow` across the 11 task hubs, `<model> vs <model>` | Every task hub ranks for its own head term; task pages beat template pages for it |

Leading indicators, checked monthly:

| Metric | Read it as |
|---|---|
| Impressions on long-tail (4+ word) queries | Whether the cluster is being *seen* before it ranks |
| Queries per page (Search Console) | A page holding one query only is under-written; 5–20 is healthy |
| Non-brand share of clicks | The whole point. Brand-only growth means the strategy did nothing |
| Click depth to the download CTA | Rising depth means the cluster is capturing the wrong intent |
| Pages with zero impressions after 90 days | Merge or `indexable: false`. Thin pages cost the whole site |

What failure looks like, so it gets caught early: a wave of S-effort pages that
each rank for a single query and never accumulate more, or a `/guides` engine
whose pages get impressions but no clicks — the second means the title and meta
patterns above are wrong for that page type, not that the topic was wrong.
