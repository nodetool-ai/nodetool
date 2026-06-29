---
layout: page
title: "Movie Poster Generator"
description: "From a title, genre, and audience, the canvas writes a creative strategy and renders a batch of cinematic poster concepts — title, tagline, billing block and all."
image: /assets/use-cases/poster-singularity-1.png
---

<p class="usecase-eyebrow">Use case · Design</p>

From a title, genre, and audience, the canvas writes a creative strategy and
renders a batch of cinematic poster concepts — title, tagline, billing block and
all. One run gives you a spread of directions, not a single guess.

<div class="usecase-hero">
  <img src="{{ '/assets/use-cases/poster-singularity-1.png' | relative_url }}" alt="Movie poster concept: 'The end of time isn't the end.'">
</div>

## How it works

Three text inputs and a strategy-then-render pipeline turn a one-line brief into
a batch of theatrical posters.

{% mermaid %}
graph LR
  title["Title (String)"]
  genre["Genre (String)"]
  audience["Audience (String)"]
  strategy["Strategy (Prompt)"]
  strategist["Strategist (Agent)"]
  plots["Concepts (ListGenerator)"]
  poster["Poster prompt"]
  render["Render (TextToImage)"]
  title --> strategy
  genre --> strategy
  audience --> strategy
  strategy --> strategist
  strategist --> plots
  plots --> poster
  title --> poster
  genre --> poster
  poster --> render
{% endmermaid %}

1. **Set the brief.** Three text inputs hold the film's title, its genre, and the
   audience you're selling to. That's the entire creative input.
   *(e.g. "Singularity · Sci-Fi · AI Enthusiasts")*
2. **Write the strategy.** A Prompt node frames the brief and an agent returns a
   real creative strategy: positioning, audience insight, a core visual concept,
   and a color palette.
3. **Spin up concepts.** A list generator turns the strategy into a batch of
   distinct plot angles, so one run gives you a spread of directions.
4. **Render the key art.** Each concept is templated into a full theatrical
   poster prompt, then an image model renders it — title, tagline, billing block
   and all.

## Concepts from one run

<div class="usecase-gallery two">
  <figure>
    <img src="{{ '/assets/use-cases/poster-singularity-1.png' | relative_url }}" alt="Poster concept: 'The end of time isn't the end.'">
    <figcaption>"The end of time isn't the end."</figcaption>
  </figure>
  <figure>
    <img src="{{ '/assets/use-cases/poster-singularity-2.png' | relative_url }}" alt="Poster concept: 'The end of limits. The beginning of everything.'">
    <figcaption>"The end of limits. The beginning of everything."</figcaption>
  </figure>
</div>

## Make it yours

- **Swap the image model.** GPT Image-2, Flux, Nano Banana, Ideogram. Change one
  node and the whole batch re-renders in a new look.
- **Shift the tone.** Change the genre or audience and the strategy, palette, and
  posters all follow — no manual re-briefing.
- **Edit the poster recipe.** The poster Prompt node owns the composition,
  typography, and billing-block layout. Tune it once, every render obeys.
- **Batch any title.** Drop in a new title and run it again. The workflow is the
  reusable part; the posters are just this run's output.

## Models in this workflow

Called with your own keys. The bill comes from the provider, and you can switch
any of them for a better model the day it ships.

| Model | Role | Provider |
| --- | --- | --- |
| Gemini 3.1 Pro Preview | Writes the strategy and plot concepts | Gemini |
| GPT Image-2 | Renders the poster key art | kie |

See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}) to set up keys.

## Next steps

- [Movie Posters workflow]({{ '/workflows/movie-posters' | relative_url }}) — the build-it-yourself version in the gallery
- [Movie Trailer Generator]({{ '/use-cases/movie-trailer' | relative_url }}) — from one logline to a cut teaser
- [All use cases]({{ '/use-cases' | relative_url }})
</content>
</invoke>
