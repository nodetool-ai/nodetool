---
title: "How much does AI video generation cost in 2026? Per-second rates, 6 providers"
description: "Per-second prices for Veo 3, Sora 2, Kling 3, Seedance 2, and Wan 2.7 across fal, Replicate, kie, AtlasCloud, and Together, and what a 30-second ad costs at those rates."
headline: "How much does AI video generation cost in 2026?"
excerpt: "Between $0.02 and $0.40 per second of output, depending on the model and the provider you call it through. Here are the rates, side by side, and what a 30-second ad or a 10-shot storyboard comes to."
tag: Cost
date: 2026-09-02
author: "The NodeTool team"
accent: amber
ogImage: screen_canvas.png
priority: 0.8
changeFrequency: monthly
---

A second of AI-generated video costs between two cents and forty cents at provider rates in 2026. The spread is the whole story: the same model can cost twice as much through one provider as through another, and the top model costs twenty times the cheapest usable one.

Every number below is a provider's own list price per second of output video, read from the [GenSpend](https://genspend.io) catalog NodeTool bills a run against, as of 23 August 2026. Prices via genspend.io. Nothing here includes a markup, because [NodeTool adds none](/pricing): you bring the provider key and pay the provider.

## Price per second, by model and provider

| Model | Provider | USD per second |
| :--- | :--- | ---: |
| Infinitalk | [kie](/providers/kie) | 0.015 |
| Grok Imagine Video | [kie](/providers/kie) | 0.0225 |
| Veo 3.1 Lite | [AtlasCloud](/providers/atlascloud) | 0.05 |
| Seedance 1 Pro | [Replicate](/providers/replicate) | 0.06 |
| Kling 3.0 Standard | [kie](/providers/kie) | 0.07 |
| Kling 3.0 Standard | [AtlasCloud](/providers/atlascloud) | 0.071 |
| Veo 3.1 Fast | [AtlasCloud](/providers/atlascloud) | 0.08 |
| Wan 2.7 | [kie](/providers/kie) | 0.08 |
| Kling 3.0 Turbo | [AtlasCloud](/providers/atlascloud) | 0.095 |
| Wan 2.7 | [fal](/providers/fal) | 0.10 |
| Kling Motion Control 3 | [kie](/providers/kie) | 0.10 |
| Sora 2 | [Together AI](/providers/together-ai) | 0.10 |
| Happyhorse 1.1 | [kie](/providers/kie) | 0.1125 |
| Happyhorse 1.1 | [fal](/providers/fal) | 0.14 |
| Veo 3 Fast | [Replicate](/providers/replicate) | 0.15 |
| Luma Ray 2 | [Replicate](/providers/replicate) | 0.18 |
| Seedance 2 | [kie](/providers/kie) | 0.205 |
| Veo 3 | [Replicate](/providers/replicate) | 0.40 |

Three things to read off that table.

**The same model is priced differently per provider.** Wan 2.7 is $0.08 a second on kie and $0.10 on fal. Happyhorse 1.1 is $0.1125 on kie and $0.14 on fal. That is a 25 percent difference for the same weights. When the model is fixed, the provider is the lever.

**A model family spans a wide range.** Veo runs from $0.05 (3.1 Lite) to $0.40 (Veo 3 full) a second. Kling 3.0 runs from $0.07 (Standard) to $0.095 (Turbo). The tier you pick matters more than most people expect, and for a first pass the cheap tier is usually the right one.

**The floor is very low.** Below a nickel a second you are in territory where a whole afternoon of iterating costs less than a coffee.

## What a real job costs

Per-second rates are abstract until you multiply them by a deliverable. Three common ones:

| Job | Output | Cheapest usable tier | Mid tier | Top tier |
| :--- | :--- | ---: | ---: | ---: |
| One 8-second social clip | 8 s | $0.40 (Veo 3.1 Lite) | $0.64 (Veo 3.1 Fast) | $3.20 (Veo 3) |
| 30-second product ad | 30 s | $1.50 | $2.40 | $12.00 |
| 10-shot storyboard, 5 s each, 3 takes per shot | 150 s | $7.50 | $12.00 | $60.00 |

The storyboard row is the one that changes how people work. Three takes per shot at the top tier is $60. The same board at the Lite tier is $7.50. The sensible pipeline is to iterate on the cheap tier until the shot is right and re-render only the picks on the expensive one. On a canvas that is one node swap, and the [movie trailer template](/templates/movie-trailer-generator) is built that way.

## Where credits change the arithmetic

Most hosted AI video tools sell credits rather than seconds. A credit pack hides two numbers: the provider rate underneath, and the markup on top. The markup is usually between two and five times the provider's price, and the pack expires.

With your own key there is no pack. The $0.40 for an 8-second Lite clip is what leaves your account, itemized on the provider's own invoice. NodeTool's [cost tracking](/pricing) records every call so you can see per run where the money went, and the [BYOK calculator](/pricing) on the pricing page runs these same rates against your own volume.

## Which price to design for

- **Iterating on a look:** Veo 3.1 Lite, Kling 3.0 Standard, or Seedance 1 Pro. All under a dime a second.
- **Motion from a still (image-to-video):** [Kling](/models/kling) on kie at $0.07 or AtlasCloud at $0.071. See [image to video](/tasks/image-to-video).
- **Synchronized audio in the clip:** [Veo 3](/models/veo-3) or [Sora 2](/models/sora). Sora 2 on Together at $0.10 is the cheaper route into native audio.
- **Steerable motion (pose, depth, inpaint):** [Wan 2.7](/models/wan) on kie at $0.08.
- **The final render:** whichever model won the test, at its pro tier, for the picks only.

For the model side of this decision, the [best AI video models in 2026](/blog/best-ai-video-models) post ranks the same list by job rather than by price.

## How to keep the number honest

Prices move. Providers cut rates when a new model ships and raise them when demand spikes. Two habits keep a budget accurate:

1. Read the rate before the run. Every video node in NodeTool shows the unit price of the selected model, and a run's estimated cost before it starts.
2. Read the ledger after. Per-call cost records are kept for every provider call, so a month of work adds up to a number you can put next to the provider's invoice.

The table above is regenerated from the same catalog when a price moves. The date at the top is when it was last read.

## FAQ

### What is the cheapest AI video model in 2026?

At provider rates, Infinitalk on kie at $0.015 a second and Grok Imagine Video on kie at $0.0225 a second are the cheapest in the catalog. For general text-to-video with a recognizable quality floor, Veo 3.1 Lite on AtlasCloud at $0.05 a second is the cheapest mainstream option.

### How much does Veo 3 cost per second?

Veo 3 on Replicate is $0.40 a second. Veo 3 Fast on Replicate is $0.15. Veo 3.1 Fast on AtlasCloud is $0.08 and Veo 3.1 Lite is $0.05. An 8-second clip is therefore between $0.40 and $3.20 depending on the tier.

### How much does Sora 2 cost?

Sora 2 through Together AI is $0.10 per second of output, so a 10-second clip is $1.00 and a 20-second clip is $2.00.

### Is it cheaper to use my own API key than a credit pack?

Almost always. A credit pack bundles the provider's rate with a markup and often an expiry. With your own key you pay the provider's list price and nothing else. NodeTool takes no per-generation fee.

### Do these prices include upscaling or audio?

No. They are the per-second price of the generation call itself. Native audio is included where the model produces it (Veo 3, Sora 2). Upscaling is a separate call to a separate model, priced on its own.

## Read next

- [Best AI video models in 2026](/blog/best-ai-video-models) — the same models ranked by job instead of price
- [How much does AI image generation cost?](/blog/ai-image-generation-cost) — per-image rates across the same providers
- [Pricing](/pricing) — free Studio, your keys, provider rates, and the BYOK calculator
- [Text to video](/tasks/text-to-video) — the models, templates, and nodes for the job
