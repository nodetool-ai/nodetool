# Blog strategy

How `/blog` earns search traffic the programmatic pages cannot, what a post
looks like, and the backlog. The keyword map and pillar structure live in
[CONTENT_KEYWORD_STRATEGY.md](CONTENT_KEYWORD_STRATEGY.md); this file is the
editorial half.

## The model we are copying

Homestra (a European property portal) runs a blog that carries a large share of
its organic traffic. Read the index and the pattern is plain:

1. **Every title is a query someone types.** "Can a US citizen live in Italy
   permanently?", "Cheapest European countries to buy a second home in 2026",
   "Germany vs USA cost of living". Question, superlative, or comparison, with
   the year stamped on.
2. **Four formulas, reused for dozens of posts.** Country guide, portal
   comparison, cost-of-living comparison, how-to. A new post is a new cell in a
   grid, not a new idea.
3. **Every post links down into the product's listing pages** with filtered
   URLs: houses for sale in a country, under a price, with a feature. The blog
   is a funnel into pages that convert, and those pages inherit its links.
4. **Volume over polish.** Sixty-plus posts, a steady cadence, dated and
   refreshed with the year.

NodeTool has the same shape available. The programmatic engines (`/models`,
`/providers`, `/templates`, `/tasks`, `/apps`, `/alternatives`) are our
listing pages. The blog is the layer above them that answers the questions
people ask before they know a node canvas is what they want.

## What the blog does that the engines cannot

| Engine page answers | Blog post answers |
|---|---|
| "What is Veo 3?" (`/models/veo-3`) | "How much does 30 seconds of AI video cost?" |
| "fal.ai on NodeTool" (`/providers/fal`) | "Which provider is cheapest for Kling?" |
| "NodeTool vs ComfyUI" (`/vs/comfyui`) | "Can I run ComfyUI workflows without a GPU?" |
| "Text to video" (`/tasks/text-to-video`) | "Best AI video models in 2026, by job" |

Engine pages are nouns. Blog posts are questions. Search demand is mostly
questions.

## Post families

Six tags, each a formula. A post is one cell: formula × subject × year.

| Tag | Formula | Example title | Feeds |
|---|---|---|---|
| **Cost** | "How much does [modality] cost in [year]?" / "What does [job] cost at provider rates?" | How much does AI video generation cost in 2026? | `/pricing`, `/providers/*`, `/models/*` |
| **Roundup** | "Best [category] models in [year]" / "[N] [things] for [job]" | Best AI video models in 2026, ranked by job | `/models/*`, `/models/a-vs-b`, `/tasks/*` |
| **Guide** | "Can you [do X] [constraint]?" / "How to [job] with [tool]" | Can you generate AI video without a GPU? | `/studio`, `/cloud`, `/solutions/*`, `/templates/*` |
| **Comparison** | "[A] vs [B] vs [C]" / "[A] alternative for [job]" | NodeTool vs ComfyUI vs n8n vs Flowise | `/vs/*`, `/alternatives/*` |
| **Tutorial** | "Build [artifact] from [input]" | Build a movie trailer workflow | `/templates/*`, `/apps/*`, `/recipes/*` |
| **Deep dive** | "What [term] means in practice" | The agent-first, privacy-first workspace | `/agents`, `/faq/*` |

Cost and Roundup are the volume families. Both are written from data the repo
already holds (`calculatorPricing.generated.ts`, `modelEntries.ts`,
`providerCatalog.generated.ts`), so a post is a table plus the reading of it,
and a price change is a regeneration plus a one-line edit.

## Rules for a post

1. **Title is the query, year included.** "How much does AI video cost in
   2026?" not "Understanding AI video pricing". Update the year and `updated`
   date on refresh; the slug never carries the year.
2. **Answer in the first paragraph.** The number, the model, the yes/no. The
   rest of the post is the evidence.
3. **One table minimum.** Prices, models, features. Tables are what get pulled
   into featured snippets and AI answers.
4. **Every post links to at least four engine pages** in the body, using the
   same anchor text the target page ranks for. Two links to sibling posts at
   the foot come free from `siblingPosts`.
5. **FAQ section, three to five questions**, phrased as people ask them. It
   ships as FAQPage JSON-LD.
6. **Numbers come from the generated data modules**, never from memory. Cite
   the provider's pricing page where the catalog names one. Say when prices
   were read.
7. **No product claims the repo cannot back.** A capability named in a post
   must exist as a node, a provider manifest entry, or a shipped template.
8. **Brand lexicon applies** ([docs/BRAND.md](../../docs/BRAND.md)):
   `provider rates`, never `credits`; `agent`, never `chatbot`. No slop
   ([docs/WRITING_STYLE.md](../../docs/WRITING_STYLE.md)).
9. **800 to 1500 words.** Long enough to be the best answer, short enough to
   ship one a week.

## Authoring

One Markdown file per post in `content/blog/<slug>.md`:

```
---
title: "<title> tag, ≤ 60 chars before the site suffix"
description: "meta description, ≤ 155 chars"
headline: "H1 — usually the title without the trailing qualifier"
excerpt: "lead paragraph, also the card summary"
tag: Cost
date: 2026-09-02
author: "The NodeTool team"
accent: amber
ogImage: screen_canvas.png
---

Body in GFM, starting at H2.

## FAQ

### Question as people ask it?

Answer in one paragraph.

## Read next

- [Label](/route) — why to read it
```

`npm run gen:blog` writes `src/data/blogEntries.generated.ts`; `seo:check`
fails a PR where the two disagree. The generator refuses a post with an unknown
tag, a missing FAQ, a body H1, or an `ogImage` that is not in `public/`.

A post drafted by an agent goes through the same gate as a model page draft:
it lands as a file, a person reads it against rules 6 and 7, and only then is
it committed.

## Cadence and refresh

- **One post a week.** Cost and Roundup alternate with Guide; a Comparison or
  Tutorial every fourth week.
- **Quarterly refresh of every Cost post** when `sync:genspend` moves a price
  the post quotes. Bump `updated`, keep the slug.
- **Year roll in January.** Every title carrying a year gets the new one and an
  `updated` date. The slug does not change, so the URL keeps its history.

## Backlog

Cheapest first: rows marked **data** are written from generated modules with no
new research.

### Cost

| # | Title | Slug | Source |
|---|---|---|---|
| B1 | ~~How much does AI video generation cost in 2026?~~ | `ai-video-generation-cost` | data — **shipped** |
| B2 | ~~How much does AI image generation cost in 2026?~~ | `ai-image-generation-cost` | data — **shipped** |
| B3 | How much does AI voice generation cost in 2026? | `ai-voice-generation-cost` | data |
| B4 | What does a 60-second AI ad cost to make at provider rates? | `what-a-60-second-ai-ad-costs` | data + a shipped template |
| B5 | Cheapest way to run Kling, Veo, and Sora: provider by provider | `cheapest-provider-for-each-video-model` | data |
| B6 | AI image generation: 100 images for under $1 | `100-ai-images-for-under-a-dollar` | data |
| B7 | Credits vs your own API key: what the markup really is | `credits-vs-your-own-api-key` | `/pricing`, competitor pricing pages |

### Roundup

| # | Title | Slug | Source |
|---|---|---|---|
| B8 | ~~Best AI video models in 2026, ranked by job~~ | `best-ai-video-models` | `modelEntries` — **shipped** |
| B9 | Best AI image models in 2026, by what you are making | `best-ai-image-models` | `modelEntries` |
| B10 | Best open-weight video models you can run yourself | `best-open-weight-video-models` | Wan, Hunyuan, provider catalog |
| B11 | Best text-to-speech models in 2026, by voice and price | `best-text-to-speech-models` | data |
| B12 | 12 workflow templates for marketing teams | `workflow-templates-for-marketing` | `templateEntries` |
| B13 | 10 mini apps you can install in one click | `mini-apps-to-install` | `miniAppEntries` |

### Guide

| # | Title | Slug | Source |
|---|---|---|---|
| B14 | Can you generate AI video without a GPU? | `ai-video-without-a-gpu` | `/cloud`, `/providers/fal` |
| B15 | Can you run AI image generation on a Mac? | `ai-image-generation-on-a-mac` | `/studio`, MLX, provider nodes |
| B16 | How to generate AI video from a single product photo | `ai-video-from-a-product-photo` | `/templates/ad-loop-from-a-product-photo` |
| B17 | How to make a video with Veo 3 without writing code | `make-a-video-with-veo-3` | `/models/veo-3`, a template |
| B18 | How to batch-generate 100 images from a spreadsheet | `batch-generate-images-from-a-spreadsheet` | `/templates/batch-a-list` |
| B19 | How to chat with your documents without sending them anywhere | `chat-with-your-documents-locally` | `/tasks/rag`, `/templates/chat-with-your-documents` |
| B20 | How to migrate a ComfyUI workflow to NodeTool | `migrate-from-comfyui` | `/vs/comfyui` |
| B21 | Which AI video model supports audio? | `ai-video-models-with-audio` | `modelEntries` |
| B22 | How long can AI-generated video be in 2026? | `how-long-can-ai-video-be` | `modelEntries` |

### Comparison

| # | Title | Slug | Source |
|---|---|---|---|
| B23 | Veo 3 vs Sora 2 vs Kling 3: which to use for what | `veo-3-vs-sora-2-vs-kling-3` | `/models/a-vs-b` |
| B24 | fal vs Replicate vs kie: the same models, different bills | `fal-vs-replicate-vs-kie` | `/providers/*`, data |
| B25 | Krea vs Flora vs NodeTool: credits, keys, and ownership | `krea-vs-flora-vs-nodetool` | `/vs/*` |
| B26 | Ollama vs LM Studio vs NodeTool for local models | `ollama-vs-lm-studio-vs-nodetool` | `/vs/lm-studio` |

## Measuring it

Search Console, filtered to `/blog/`. Three numbers, monthly:

1. Impressions per post 28 days after publish. A post under 100 impressions at
   day 28 has the wrong title; rewrite the title before writing the next post.
2. Clicks from a post to an engine page (GA4 outbound-to-internal, or the
   `/blog/` referrer on engine pages). This is the number the whole strategy
   exists for.
3. Download or waitlist conversions with `/blog/` in the path.

Nothing here quotes a volume. The keyword tiers in the keyword strategy are
relative, and the first real signal is the day-28 impression count.
