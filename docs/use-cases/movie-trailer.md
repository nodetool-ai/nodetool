---
layout: page
title: "Movie Trailer Generator"
description: "Type one logline and the canvas builds a cinematic teaser: a showrunner agent writes the treatment, a list generator breaks it into shots, a text-to-image model renders the key art, and a video model animates and cuts it into a finished trailer."
image: /assets/use-cases/trailer-shot-1.png
---

<p class="usecase-eyebrow">Use case · Film</p>

Type one logline and the canvas builds a cinematic teaser — a treatment, a shot
list, key art for every beat, then animated and cut into a finished trailer. No
editor, no studio, one canvas you can re-run for any story.

<div class="usecase-hero">
  <video src="{{ '/assets/use-cases/movie_trailer_example.mp4' | relative_url }}" poster="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" autoplay loop muted playsinline controls></video>
</div>

## How it works

A handful of nodes do the work. One line becomes a treatment, the treatment
becomes shots, the shots become a trailer.

{% mermaid %}
graph LR
  logline["Logline (String)"]
  vstyle["Visual style (String)"]
  treatment["Treatment (Prompt)"]
  showrunner["Showrunner (Agent)"]
  shotlist["Shot list (ListGenerator)"]
  keyart["Key art (TextToImage)"]
  i2v["Animate (ImageToVideo)"]
  concat["Concat → Trailer"]
  logline --> treatment
  vstyle --> treatment
  treatment --> showrunner
  showrunner --> shotlist
  shotlist --> keyart
  keyart --> i2v
  i2v --> concat
{% endmermaid %}

1. **Start with one line.** Type the logline. Two more inputs set the visual
   style and the shot count — that's the entire brief.
   *(e.g. "A getaway driver outruns a collapsing bridge · gritty daylight · 6 shots")*
2. **Treatment, then shots.** A Prompt frames the brief, a showrunner agent
   returns a teaser treatment, and a list generator breaks it into concrete,
   one-line shots.
3. **Render the key art.** Each shot is templated into a key-art prompt, then a
   text-to-image model renders it as a cinematic 16:9 frame.
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
  the treatment, shots, and key art stay exactly the same.
- **Redirect the showrunner.** Rewrite the agent's system prompt for horror,
  comedy, or arthouse without touching the pipeline.
- **Restyle every shot.** The visual-style input flows into each key-art prompt.
  Change one line and the whole trailer shifts mood.
- **Re-run any story.** Drop in a new logline and run it again. The workflow is
  the reusable part, not this trailer.

## Models in this workflow

Called with your own keys. The bill comes from the provider, and you can switch
any of them for a better model the day it ships.

| Model | Role | Provider |
| --- | --- | --- |
| Gemini 3.1 Pro Preview | Writes the treatment and shot list | Gemini |
| GPT Image-2 | Renders each shot's key art | kie |
| Veo 3.1 Preview | Animates the frames into video | Gemini |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- [Product Video Generator]({{ '/use-cases/product-video' | relative_url }}) — one product photo to a cinematic clip
- [All use cases]({{ '/use-cases' | relative_url }})
</content>
</invoke>
