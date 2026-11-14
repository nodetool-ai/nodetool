---
layout: page
title: "Ad Creative Factory"
description: "Turn one product photo and one offer into a batch of ready-to-test vertical video ads. A strategist agent plans a persona × angle test matrix, and every cell becomes a spoken hook, a staged product scene, an animated 9:16 clip, and a voiceover."
image: /assets/use-cases/smartwatch.png
# This page mirrors the marketing site's version of the same use case, so the
# two competed for one query set across domains (docs/SEO_STRATEGY.md § 0.10,
# finding 4). The marketing page is the search destination — it carries the
# video, the shot gallery, and the HowTo schema — so it takes the canonical and
# this page stays for docs readers who browse the use-case index.
canonical_url: "https://nodetool.ai/templates/ad-creative-factory"
---

<p class="usecase-eyebrow">Use case · Advertising</p>

A strategist agent plans a persona × angle test matrix from one product photo
and one offer. Each matrix cell becomes a staged, animated, voiced vertical ad.

## How it works

This page describes a graph design. NodeTool does not ship it as a template, so
there is nothing to open under Examples. Build it on the canvas from the nodes
named below, or start from one of the shipped ad workflows listed under
[Next steps](#next-steps).

Four inputs, one fan-out. The strategist plans once. Everything after the list
generator runs once per variant.

{% mermaid %}
graph LR
  brief["Product & offer (String)"]
  audience["Audience (String)"]
  count["Variant count (Integer)"]
  photo["Product photo (Image)"]
  strategist["Strategist (Agent)"]
  hooks["Hooks (ListGenerator)"]
  scene["Stage scene (ImageToImage)"]
  clip["Animate (ImageToVideo)"]
  vo["Voiceover (TextToSpeech)"]
  mix["Mix (AddAudio)"]
  brief --> strategist
  audience --> strategist
  count --> strategist
  photo --> strategist
  strategist --> hooks
  hooks --> scene
  photo --> scene
  scene --> clip
  hooks --> vo
  clip --> mix
  vo --> mix
{% endmermaid %}

1. **Feed in the campaign.** The product and offer, the audience, a variant
   count, and one clean product photo. The same photo anchors every variant.
   *(e.g. "Aurora Trail smart fitness watch · 20% off launch week · weekend
   hikers · 6 variants")*
2. **Plan the test.** A strategist agent studies the photo and brief, then
   writes a test matrix of buyer personas × message angles (pain point, bold
   claim, social proof, offer urgency) and picks the strongest pairings.
3. **Write the hooks.** A list generator turns each matrix cell into one spoken
   hook: 18 words or fewer, plain language, said in the first three seconds.
4. **Stage every scene.** For each hook, an image-to-image model places the
   product from your photo into that hook's world: native UGC framing, natural
   light, 9:16, upper third kept clear for caption text.
5. **Animate and voice.** An image-to-video model adds a subtle handheld
   push-in; a text-to-speech model reads the hook.
6. **Mix and ship.** The voiceover lands on the clip, and the finished ads
   collect in a preview grid, one per matrix cell.

## One photo in, a test cell out

Every variant isolates one persona × angle pairing, so a winning ad shows which
pairing worked. Paste last week's winning hooks into the audience or offer
input, raise the variant count, and the strategist plans the next generation
around them.

## Make it yours

- Language, image, video, and voice are each one node. Use a pricier video
  model for hero variants and a cheaper one for broad tests.
- The persona × angle matrix is a prompt you can edit. Push it toward
  founder-story ads, comparison ads, or a single angle across ten personas.
- Aspect ratio, duration, and resolution live on the image and video nodes.
  Set 1:1 for feed placements or 16:9 for YouTube.
- Point the voiceover at another voice or language and re-run to ship the same
  matrix in another market.

## Models in this workflow

Pick one model per role. Calls use your own keys, so the provider bills you.

| Role | Node | Works well with |
| --- | --- | --- |
| Test-matrix strategist | Agent | Any strong language model |
| Hook writer | List Generator | Any language model |
| Scene staging | Image To Image | An image-editing model that keeps the product intact (Nano Banana, FLUX) |
| Ad animation | Image To Video | Veo, Kling, Seedance |
| Voiceover | Text To Speech | OpenAI TTS, ElevenLabs |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Shipped ad workflows (**Examples** in the sidebar, **Workflows** tab):
  *Ad Loop from a Product Photo* animates one photo into a looping hero shot
  with Kling 2.6 on Kie, and *Per-SKU Ad Factory* turns one approved storyboard
  into one ad per product.
- [Product Video Generator]({{ '/use-cases/product-video' | relative_url }}): one cinematic hero video instead of a test batch
- [Movie Trailer Generator]({{ '/use-cases/movie-trailer' | relative_url }}): the same fan-out pattern, pointed at film
- [All use cases]({{ '/use-cases' | relative_url }})
