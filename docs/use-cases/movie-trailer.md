---
layout: page
title: "Movie Trailer Generator"
description: "Type one logline and the canvas builds a cinematic teaser: a Director node storyboards it into shots, a text-to-image model renders the key art, and a video model animates and cuts it into a finished trailer."
image: /assets/use-cases/trailer-shot-1.png
# This page mirrors the marketing site's version of the same use case, so the
# two competed for one query set across domains (docs/SEO_STRATEGY.md § 0.10,
# finding 4). The marketing page is the search destination — it carries the
# video, the shot gallery, and the HowTo schema — so it takes the canonical and
# this page stays for docs readers who browse the use-case index.
canonical_url: "https://nodetool.ai/use-cases/movie-trailer"
---

<p class="usecase-eyebrow">Use case · Film</p>

Type one logline and the canvas builds a cinematic teaser — a storyboard, key
art for every beat, then animated and cut into a finished trailer. No editor,
no studio, one canvas you can re-run for any story.

<div class="usecase-hero">
  <video src="{{ '/assets/use-cases/movie_trailer_example.mp4' | relative_url }}" poster="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" autoplay loop muted playsinline controls></video>
</div>

## How it works

A handful of nodes do the work. One line becomes a storyboard, the storyboard
becomes shots, the shots become a trailer.

{% mermaid %}
graph LR
  logline["Logline (String)"]
  vstyle["Visual style (String)"]
  count["Shot count (Integer)"]
  director["Director → screenplay"]
  shots["Screenplay Shots"]
  keyart["Key art (TextToImage)"]
  i2v["Animate (ImageToVideo)"]
  concat["Concat → Trailer"]
  logline --> director
  vstyle --> director
  count --> director
  director --> shots
  shots --> keyart
  keyart --> i2v
  i2v --> concat
{% endmermaid %}

1. **Start with one line.** Type the logline. Two more inputs set the visual
   style and the shot count — that's the entire brief.
   *(e.g. "A getaway driver outruns a collapsing bridge · gritty daylight · 6 shots")*
2. **Direct the storyboard.** The Director node writes the screenplay: one shot
   per beat, each with framing, lens, angle, and movement, under a single style
   bible. It is the same node the Storyboard editor runs behind its Direct
   button.
3. **Render the key art.** Screenplay Shots turns each shot into an image prompt
   — action, camera, style bible — and a text-to-image model renders it as a
   cinematic 16:9 frame.
4. **Animate and cut.** An image-to-video model animates every frame, then a
   Concat node stitches them into one finished trailer.

## Six shots, one trailer

Every beat is rendered as its own cinematic frame, then animated and cut
together. Here are all six frames from a single run, straight off the canvas.

<div class="usecase-gallery">
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" alt="Blown supercharger spits fire down the straight">
    <figcaption>Blown supercharger spits fire down the straight</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-2.png' | relative_url }}" alt="A raider hauls the war-rig in by the chain">
    <figcaption>A raider hauls the war-rig in by the chain</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-3.png' | relative_url }}" alt="Tires tear through the canyon floor">
    <figcaption>Tires tear through the canyon floor</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-4.png' | relative_url }}" alt="A lone rider guns it through the ruins">
    <figcaption>A lone rider guns it through the ruins</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-5.png' | relative_url }}" alt="Last repairs before the run">
    <figcaption>Last repairs before the run</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/trailer-shot-6.png' | relative_url }}" alt="The getaway car breaks loose across the flats">
    <figcaption>The getaway car breaks loose across the flats</figcaption>
  </figure>
</div>

## Make it yours

Nothing here is locked. Swap models, change the tone, or point it at a different
story.

- **Swap the video model.** Veo, Seedance, Kling, Runway. Change one node and
  the storyboard, shots, and key art stay exactly the same.
- **Redirect the storyboard.** Raise the shot count, change the aspect ratio, or
  point the Director at a different model. The rest of the graph is untouched.
- **Restyle every shot.** The visual-style input becomes the screenplay's style
  bible, and the style bible lands in every shot prompt. Change one line and the
  whole trailer shifts mood.
- **Re-run any story.** Drop in a new logline and run it again. The workflow is
  the reusable part, not this trailer.

## Models in this workflow

Called with your own keys. The bill comes from the provider, and you can switch
any of them for a better model the day it ships.

| Model | Role | Provider |
| --- | --- | --- |
| Gemini 3.1 Pro Preview | Directs the storyboard | Gemini |
| GPT Image-2 | Renders each shot's key art | kie |
| Veo 3.1 Preview | Animates the frames into video | Gemini |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- [Product Video Generator]({{ '/use-cases/product-video' | relative_url }}) — one product photo to a cinematic clip
- [All use cases]({{ '/use-cases' | relative_url }})
</content>
</invoke>
