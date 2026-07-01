---
layout: page
title: "Ad Creative Factory"
description: "Turn one product photo and one offer into a batch of ready-to-test vertical video ads. A strategist agent plans a persona × angle test matrix, and every cell becomes a spoken hook, a staged product scene, an animated 9:16 clip, and a voiceover."
image: /assets/use-cases/smartwatch.png
---

<p class="usecase-eyebrow">Use case · Advertising</p>

Turn one product photo and one offer into a batch of ready-to-test vertical
video ads. A strategist agent plans the test, and every variant comes out
staged, animated, and voiced — what an agency bills per video, this graph
produces by the batch at provider cost.

Since ad platforms took over targeting, creative volume is the lever that's
left: accounts win by testing many angles and refreshing them before they
fatigue. That makes ad variants a recurring line item — bought monthly, per
video. This workflow moves that line item onto your canvas.

## How it works

Four inputs, one fan-out. The strategist plans once; everything after the list
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
   count, and one clean product photo — the same shot anchors every variant.
   *(e.g. "Aurora Trail smart fitness watch · 20% off launch week · weekend
   hikers · 6 variants")*
2. **Plan the test.** A strategist agent studies the photo and brief, then
   writes a test matrix: buyer personas × message angles (pain point, bold
   claim, social proof, offer urgency), and picks the strongest pairings to
   test.
3. **Write the hooks.** A list generator turns each matrix cell into one spoken
   hook — 18 words or fewer, plain language, said in the first three seconds.
4. **Stage every scene.** For each hook, an image-to-image model places the
   product from your photo into that hook's world: native UGC framing, natural
   light, 9:16, upper third kept clear for caption text.
5. **Animate and voice.** An image-to-video model adds a subtle handheld
   push-in; a text-to-speech model reads the hook.
6. **Mix and ship.** The voiceover lands on the clip, and the finished ads
   collect in a preview grid — one ready-to-upload vertical ad per matrix cell.

## One photo in, a test cell out

Every variant isolates one persona × angle pairing, so when one ad wins in the
ad account you know *why* it won — and the next run can breed from it. Paste
last week's winning hooks into the audience or offer input, raise the variant
count, and the strategist plans the next generation around them.

## Make it yours

- **Swap any model.** Language, image, video, and voice are each one node.
  Trade the video model up for hero variants, down for cheap broad tests.
- **Retune the strategist.** The persona × angle matrix is a prompt you can
  read and edit — push it toward founder-story ads, comparison ads, or a
  single angle across ten personas.
- **Change the format.** Aspect ratio, duration, and resolution live on the
  image and video nodes. Go 1:1 for feed placements or 16:9 for YouTube in one
  click.
- **Localize the batch.** Point the voiceover at another voice or language and
  re-run — the same matrix ships in every market.

## Models in this workflow

The template ships with no models selected — pick one per role when you open
it. Called with your own keys; the bill comes from the provider.

| Role | Node | Works well with |
| --- | --- | --- |
| Test-matrix strategist | Agent | Any strong language model |
| Hook writer | List Generator | Any language model |
| Scene staging | Image To Image | An image-editing model that keeps the product intact (Nano Banana, FLUX) |
| Ad animation | Image To Video | Veo, Kling, Seedance |
| Voiceover | Text To Speech | OpenAI TTS, ElevenLabs |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- Open the template: **Templates → Ad Creative Factory** in the dashboard
- [Product Video Generator]({{ '/use-cases/product-video' | relative_url }}) — one cinematic hero video instead of a test batch
- [Movie Trailer Generator]({{ '/use-cases/movie-trailer' | relative_url }}) — the same fan-out pattern, pointed at film
- [All use cases]({{ '/use-cases' | relative_url }})
