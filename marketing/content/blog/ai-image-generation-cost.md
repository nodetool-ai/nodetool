---
title: "How much does AI image generation cost in 2026? Per-image rates compared"
description: "Per-image prices for FLUX, Seedream, GPT Image 2, Imagen 4, Ideogram v3, Gemini image models and more across fal, Replicate, kie, AtlasCloud, and Together AI."
headline: "How much does AI image generation cost in 2026?"
excerpt: "Between a quarter of a cent and fifteen cents per image at provider rates. A thousand images can cost $3 or $150. Here are the rates, what a batch costs, and which model to reach for at each price."
tag: Cost
date: 2026-09-02
author: "The NodeTool team"
accent: amber
ogImage: screen_assets.png
priority: 0.8
changeFrequency: monthly
---

An AI-generated image costs between $0.0027 and $0.15 at provider rates in 2026. That is a 55-fold spread, and it means the answer to "what does a thousand images cost" is anywhere from three dollars to a hundred and fifty.

Every number below is a provider's own list price per image, read from the [GenSpend](https://genspend.io) catalog NodeTool bills a run against, as of 23 August 2026. Prices via genspend.io. No markup is included, because [NodeTool adds none](/pricing): you bring the key and pay the provider.

## Price per image, by model and provider

| Model | Provider | USD per image |
| :--- | :--- | ---: |
| FLUX.1 Schnell | [Together AI](/providers/together-ai) | 0.0027 |
| Z Image Turbo | [AtlasCloud](/providers/atlascloud) | 0.005 |
| GPT Image 2 | [AtlasCloud](/providers/atlascloud) | 0.009 |
| Gemini 2.5 Flash Image | [kie](/providers/kie) | 0.02 |
| Recraft 20B | [fal](/providers/fal) | 0.022 |
| Seedream 5 Lite | [kie](/providers/kie) | 0.0275 |
| Kling Image O3 | [fal](/providers/fal) | 0.028 |
| Ideogram v3 | [fal](/providers/fal) | 0.03 |
| Seedream 4 | [Together AI](/providers/together-ai) | 0.03 |
| Recraft v4.1 | [fal](/providers/fal) | 0.035 |
| Bria Fibo | [fal](/providers/fal) | 0.04 |
| Imagen 4 | [fal](/providers/fal) | 0.04 |
| Gemini 3.1 Flash Image | [kie](/providers/kie) | 0.04 |
| FLUX.1 Kontext Pro | [Together AI](/providers/together-ai) | 0.04 |
| FLUX.2 Flex | [fal](/providers/fal) | 0.05 |
| Qwen Image Max | [fal](/providers/fal) | 0.075 |
| Ideogram v3 | [Replicate](/providers/replicate) | 0.09 |
| Gemini 3 Pro Image | [fal](/providers/fal) | 0.15 |

Two things stand out.

**The provider matters as much as the model.** Ideogram v3 is $0.03 on fal and $0.09 on Replicate, three times the price for the same model. If you have both keys, the choice is not a coin flip.

**The cheap tier is genuinely cheap.** FLUX.1 Schnell at $0.0027 means 370 images for a dollar. That changes what "iterate" means: you can generate a hundred variations of a concept before deciding which three to render at a premium tier.

## What a batch costs

| Job | Images | Cheapest | Mid ($0.03) | Premium ($0.15) |
| :--- | ---: | ---: | ---: | ---: |
| One concept board, 24 variations | 24 | $0.06 | $0.72 | $3.60 |
| Product catalog, 200 SKUs, one shot each | 200 | $0.54 | $6.00 | $30.00 |
| 1,000 social images from a spreadsheet | 1,000 | $2.70 | $30.00 | $150.00 |
| Sequential storyboard, 12 shots, 4 takes each | 48 | $0.13 | $1.44 | $7.20 |

The middle column is where most work sits: Ideogram v3, Seedream 4, Recraft, and Imagen 4 all cluster around three to four cents. The premium column is Gemini 3 Pro Image, which is what you reach for when a text-heavy or reasoning-heavy prompt needs to land first time.

The spreadsheet row is a real workflow. The [batch a list template](/templates/batch-a-list) runs one image node across every row of a table, and the [product mockup generator](/templates/product-mockup-generator) does the SKU case.

## Which price to design for

- **Exploring a look:** FLUX.1 Schnell or Z Image Turbo. Under a cent. Generate widely, judge later.
- **Text in the image (posters, packaging, thumbnails):** Ideogram v3 on fal at $0.03, or Recraft v4.1 at $0.035. Typography is what these models are for.
- **Photoreal product and people:** [Seedream](/models/seedream) 4 on Together at $0.03, or [Imagen 4](/models/imagen) on fal at $0.04.
- **Editing an existing image with a prompt:** FLUX.1 Kontext Pro on Together at $0.04. See the [edit a still with words](/templates/edit-a-still-with-words) template.
- **A hard prompt that must land first time:** [GPT Image](/models/gpt-image) 2 on AtlasCloud at $0.009 is the surprise here, cheaper than most of the mid tier. Gemini 3 Pro Image at $0.15 is the top of the range.

The [best AI image models](/tasks/text-to-image) page covers the same models by what they are good at rather than what they cost.

## Where the credit model breaks down

Hosted image tools mostly sell credits: a monthly allowance that maps to some number of generations at some hidden rate. Two problems with that for anyone doing volume work.

First, the markup. A credit that buys one image at a tool charging $20 a month for 500 images is $0.04 per image, for a model that the provider sells at $0.0027. That is a fifteen-fold markup on the cheapest tier.

Second, the ceiling. When the allowance runs out on the 20th of the month, the work stops or the plan gets upgraded. At provider rates there is no allowance. The thousand-image batch costs $2.70 and runs today.

NodeTool records every provider call in a [cost ledger](/pricing), so a month of generation adds up to a number you can put beside the provider's invoice. The BYOK calculator on the pricing page runs these rates against your own volume.

## Keeping the numbers current

Image prices move more often than video prices, mostly downward when a new fast tier ships. Two habits:

1. Read the unit price on the node before a batch. Every image node shows the selected model's rate and the run's estimated cost before it starts.
2. The table above regenerates from the same catalog when a price changes. The date at the top says when it was last read.

## FAQ

### What is the cheapest AI image model in 2026?

FLUX.1 Schnell through Together AI at $0.0027 per image is the cheapest in the catalog, followed by Z Image Turbo on AtlasCloud at $0.005 and GPT Image 2 on AtlasCloud at $0.009.

### How much do 1,000 AI images cost?

Between $2.70 and $150 at provider rates, depending on the model. At the common mid tier of around $0.03 per image, a thousand images is $30.

### How much does Imagen 4 cost per image?

Imagen 4 through fal is $0.04 per image, so 100 images is $4.00.

### Is Ideogram cheaper on fal or Replicate?

fal. Ideogram v3 is $0.03 per image on fal and $0.09 on Replicate. Same model, three times the price.

### Do these prices depend on resolution?

Often, yes. Providers price some models by output size or quality tier, and the catalog records the tier NodeTool's node calls by default. A larger output or a pro tier can cost more. The node shows the rate for the settings you have chosen.

## Read next

- [How much does AI video generation cost?](/blog/ai-video-generation-cost) — per-second rates for Veo, Sora, Kling, Seedance, and Wan
- [Text to image](/tasks/text-to-image) — the models, templates, and nodes for the job
- [Pricing](/pricing) — free Studio, your keys, provider rates, and the BYOK calculator
- [Batch a list](/templates/batch-a-list) — the template behind the spreadsheet row
