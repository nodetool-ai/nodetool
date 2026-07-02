---
layout: page
title: "SEO Content Engine"
description: "One topic in, a keyword-targeted article batch out. A strategist agent plans the topic cluster, a list generator turns it into briefs, and every brief becomes a full Markdown article with an editorial hero image."
---

<p class="usecase-eyebrow">Use case · Content</p>

One topic in, a keyword-targeted article batch out. A strategist agent plans
the cluster, and every article arrives written, structured for search, and
paired with an editorial hero image — the deliverable content agencies bill
per article, produced by the batch at provider cost.

Ranking rarely comes from one article. Search engines reward *clusters* —
several pieces that own a topic together, each answering a different intent.
Producing a cluster is what makes content expensive; this graph makes it one
run.

## How it works

The strategist plans once; everything after the list generator runs once per
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

1. **Feed in the campaign.** Who's publishing and which pages the articles
   support, who searches and the seed topics, and how many articles to
   produce. *(e.g. "ultralight hiking shop · beginner hikers · trail runners
   vs boots · 4 articles")*
2. **Plan the cluster.** A strategist agent picks the topic cluster, assigns
   one primary keyword per article with its search intent, and divides
   coverage so the articles don't compete with each other.
3. **Write the briefs.** A list generator turns the plan into one brief per
   article: title, keyword, intent, H2 sections, and what the reader must be
   able to do afterward.
4. **Write the articles.** For each brief, a writer agent produces the full
   Markdown piece — meta description, answer-first opening, the brief's
   section structure, an FAQ, and one unforced CTA.
5. **Render the heroes.** In parallel, each brief becomes a 16:9 editorial
   hero image with room left for a headline overlay.

## One run, one cluster

Because every article comes from the same plan, the batch behaves like a
cluster instead of a pile: keywords don't cannibalize, internal logic is
consistent, and the voice section of the plan keeps ten articles sounding
like one publication. Point the seed inputs at the next cluster and run it
again.

## Make it yours

- **Retune the writer.** The article rules — length, structure, point of
  view, FAQ — are a prompt, not a setting. Make it terse and technical or
  warm and story-led.
- **Raise the stakes per article.** Swap the writer's model up for money
  pages, down for supporting pieces.
- **Change the imagery.** The hero prompt controls the visual language —
  photography, flat illustration, product-in-context.
- **Chain the next step.** Add a Save Text node per article, or a translation
  branch to ship each cluster in every market's language.

## Models in this workflow

The template ships with no models selected — pick one per role when you open
it. Called with your own keys; the bill comes from the provider.

| Role | Node | Works well with |
| --- | --- | --- |
| Cluster strategist | Agent | Any strong language model |
| Brief writer | List Generator | Any language model |
| Article writer | Agent | A long-output model you trust with prose |
| Hero images | Text To Image | FLUX, Imagen, Nano Banana |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Open the template: **Templates → SEO Content Engine** in the dashboard
- [Ad Creative Factory]({{ '/use-cases/ad-creative-factory' | relative_url }}) — paid acquisition from the same brief-style inputs
- [Podcast Repurposing Studio]({{ '/use-cases/podcast-repurposing-studio' | relative_url }}) — the content pack for what you've already recorded
- [All use cases]({{ '/use-cases' | relative_url }})
