---
layout: page
title: "SEO Content Engine"
description: "One topic in, a keyword-targeted article batch out. A strategist agent plans the topic cluster, a list generator turns it into briefs, and every brief becomes a full article with an editorial hero image."
# This page mirrors the marketing site's version of the same use case, so the
# two competed for one query set across domains (docs/SEO_STRATEGY.md § 0.10,
# finding 4). The marketing page is the search destination — it carries the
# video, the shot gallery, and the HowTo schema — so it takes the canonical and
# this page stays for docs readers who browse the use-case index.
canonical_url: "https://nodetool.ai/templates/seo-content-engine"
---

<p class="usecase-eyebrow">Use case · Content</p>

One topic in, a keyword-targeted article batch out. A strategist agent plans
the topic cluster, and each article is written with a hero image.

## How it works

The strategist plans once. Everything after the list generator runs once per
article.

{% mermaid %}
graph LR
  business["Business & site (String)"]
  seeds["Audience & seeds (String)"]
  count["Article count (Integer)"]
  strategist["Strategist (Agent)"]
  briefs["Briefs (ListGenerator)"]
  writer["Writer (Agent)"]
  hero["Hero image (TextToImage)"]
  business --> strategist
  seeds --> strategist
  count --> strategist
  strategist --> briefs
  briefs --> writer
  briefs --> hero
{% endmermaid %}

1. **Feed in the campaign.** Who is publishing and which pages the articles
   support, who searches and the seed topics, and how many articles to
   produce (2 to 10, default 4).
   *(e.g. "ultralight hiking shop · beginner hikers · trail runners vs boots · 4 articles")*
2. **Plan the cluster.** A strategist agent picks the topic cluster, assigns
   one primary keyword per article with its search intent, and divides
   coverage so the articles don't compete with each other.
3. **Write the briefs.** A list generator turns the plan into one brief per
   article: title, keyword, intent, H2 sections, and what the reader must be
   able to do afterward.
4. **Write the articles.** For each brief, a writer agent returns typed fields:
   `title`, `meta_description`, `keywords`, and a Markdown `body` of 900 to
   1,200 words with an answer-first opening, the brief's section structure, a
   three-question FAQ, and one unforced CTA. The template previews each field
   separately.
5. **Render the heroes.** In parallel, each brief becomes a 16:9 editorial
   hero image with room left for a headline overlay.

## One run, one cluster

Every article comes from the same plan, so keywords don't cannibalize each
other and the voice section of the plan keeps the batch in one voice. Point the
seed inputs at the next cluster and run it again.

## Make it yours

- The article rules (length, structure, point of view, FAQ) are a prompt you can
  edit. Make it terse and technical or warm and story-led.
- Use a stronger writer model for money pages and a cheaper one for supporting
  pieces.
- The hero prompt controls the visual language: photography, flat
  illustration, or product-in-context.
- Add a Save Text node per article, or a translation branch to ship each
  cluster in other languages.

## Models in this workflow

Calls use your own keys, so the provider bills you. The template ships with the
defaults below, each a dropdown.

| Role | Node | Shipped default | Also works with |
| --- | --- | --- | --- |
| Cluster strategist | Agent | GPT-5 mini | Any strong language model |
| Brief writer | List Generator | GPT-5 mini | Any language model |
| Article writer | Agent | GPT-5 mini | A long-output model you trust with prose |
| Hero images | Text To Image | FLUX.1 Schnell (16:9, 1K) | FLUX, Imagen, Nano Banana |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Open the template: **Examples** in the sidebar, **Workflows** tab, *SEO Content Engine*
- [Ad Creative Factory]({{ '/use-cases/ad-creative-factory' | relative_url }}): paid acquisition from the same brief-style inputs
- [Podcast Repurposing Studio]({{ '/use-cases/podcast-repurposing-studio' | relative_url }}): the content pack for what you've already recorded
- [All use cases]({{ '/use-cases' | relative_url }})
