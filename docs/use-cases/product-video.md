---
layout: page
title: "Product Video Generator"
description: "Turn a campaign brief and a single product photo into a cinematic 16:9 product video. Your inputs feed a prompt, an agent directs the shot, and an image-to-video model renders it."
image: /assets/use-cases/smartwatch.png
# This page mirrors the marketing site's version of the same use case, so the
# two competed for one query set across domains (docs/SEO_STRATEGY.md § 0.10,
# finding 4). The marketing page is the search destination — it carries the
# video, the shot gallery, and the HowTo schema — so it takes the canonical and
# this page stays for docs readers who browse the use-case index.
canonical_url: "https://nodetool.ai/use-cases/product-video"
---

<p class="usecase-eyebrow">Use case · Marketing</p>

A campaign brief and a single product photo feed a prompt. An agent directs the
shot, and an image-to-video model renders a 16:9 clip.

<div class="usecase-hero">
  <video src="{{ '/assets/use-cases/product_video_example.mp4' | relative_url }}" poster="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" autoplay loop muted playsinline controls></video>
</div>

## How it works

The inputs are a brief, an audience, a feature list, and the hero photo. The
shipped template is named *Product Video Generator* (**Examples** in the sidebar, **Workflows** tab).

{% mermaid %}
graph LR
  brief["Brief (String)"]
  audience["Audience (String)"]
  features["Features (String)"]
  photo["Product photo (Image)"]
  prompt["Prompt"]
  agent["Director (Agent)"]
  i2v["Render (ImageToVideo)"]
  brief --> prompt
  audience --> prompt
  features --> prompt
  prompt --> agent
  photo --> agent
  agent --> i2v
  photo --> i2v
{% endmermaid %}

1. **Feed in the campaign.** Three text inputs hold the brief, the target
   audience, and the key features. The product photo is the hero shot. *(e.g. "Aurora Trail smart fitness watch · active millennials who
   hike · GPS, heart-rate, adaptive coaching, water resistance")*
2. **Assemble the prompt.** A Prompt node templates those inputs into a precise,
   rule-based request: one camera move, one subject action, lighting, color
   anchors, and hard constraints (no on-screen text, logos, or watermarks).
3. **Direct the shot.** An agent turns the request into a concrete, cinematic
   prompt with framing, lens, and motion cues.
4. **Render the video.** An image-to-video model animates the product photo from
   the agent's prompt into the clip.

## One photo in, a clip out

The pipeline runs from a single product render. Use the same graph for any product.

<div class="usecase-gallery two">
  <figure>
    <img src="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" alt="Input product photo of the smart watch">
    <figcaption>Input · product photo</figcaption>
  </figure>
  <figure>
    <video src="{{ '/assets/use-cases/product_video_example.mp4' | relative_url }}" poster="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" autoplay loop muted playsinline></video>
    <figcaption>Output · cinematic clip</figcaption>
  </figure>
</div>

## Make it yours

- Swap the video model (Veo, Seedance, Kling, Runway) by changing one node.
- Rewrite the agent's system prompt for a luxury, playful, or technical tone
  without touching the pipeline.
- Aspect ratio, resolution, and duration live on the video node. Set vertical
  for social.
- Drop in a new photo and brief and run it again for another product.

## Models in this workflow

Calls use your own keys, so the provider bills you, and Veo bills per second of
video. The template ships with these defaults, each a dropdown.

| Model | Role | Provider |
| --- | --- | --- |
| GPT-5 mini | Writes the video prompt (the agent also sees the photo) | OpenAI |
| Veo 3.1 Preview | Renders an 8-second 720p 16:9 clip from the product photo | Gemini |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- [Movie Trailer Generator]({{ '/use-cases/movie-trailer' | relative_url }}): one logline to a cut teaser
- [Color Boost Video]({{ '/workflows/color-boost-video' | relative_url }}): polish footage on the canvas
- [All use cases]({{ '/use-cases' | relative_url }})
</content>
</invoke>
