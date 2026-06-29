---
layout: page
title: "Use Cases"
description: "Flagship NodeTool workflows, end to end. Each starts from a few inputs and builds a finished result on one canvas you can re-run, restyle, and re-point at your own story."
image: /assets/use-cases/poster-singularity-1.png
---

These are the showcase workflows from [nodetool.ai](https://nodetool.ai). Each
one starts from a handful of inputs and ends with a finished result — a trailer,
a product video, a set of poster concepts — built on a single canvas. Nothing is
locked: swap a model, rewrite an agent's prompt, or drop in a new brief and run
it again. The workflow is the reusable part, not the example output.

Every model runs with your own keys. The bill comes from the provider, not from
us, and you can switch any model for a better one the day it ships.

<div class="usecase-grid">
  <article class="usecase-card">
    <a href="{{ '/use-cases/movie-trailer' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" alt="Cinematic key-art frame from the Movie Trailer Generator">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Film</span>
      <h3><a href="{{ '/use-cases/movie-trailer' | relative_url }}">Movie Trailer Generator</a></h3>
      <p>Type one logline and the canvas builds a cinematic teaser: a showrunner agent writes the treatment, a list generator breaks it into shots, each shot is rendered as key art, animated, and cut into a finished trailer.</p>
      <div class="pipeline-chips">
        <span>Logline</span><span>Treatment</span><span>Shots</span><span>Key art</span><span>Trailer</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/product-video' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" alt="Product photo feeding the Product Video Generator">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Marketing</span>
      <h3><a href="{{ '/use-cases/product-video' | relative_url }}">Product Video Generator</a></h3>
      <p>Turn a campaign brief and a single product photo into a cinematic 16:9 product video. Your inputs feed a prompt, an agent directs the shot, and a text-to-video model renders it.</p>
      <div class="pipeline-chips">
        <span>Brief</span><span>Prompt</span><span>Agent</span><span>Text-to-Video</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/movie-poster' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/poster-singularity-1.png' | relative_url }}" alt="Movie poster concept from the Movie Poster Generator">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Design</span>
      <h3><a href="{{ '/use-cases/movie-poster' | relative_url }}">Movie Poster Generator</a></h3>
      <p>From a title, genre, and audience, the canvas writes a creative strategy and renders a batch of cinematic poster concepts — title, tagline, billing block and all.</p>
      <div class="pipeline-chips">
        <span>Brief</span><span>Strategy</span><span>Concepts</span><span>Key art</span>
      </div>
    </div>
  </article>
</div>

## Build your own

These three are starting points, not limits. The same building blocks — inputs,
prompts, agents, and image/video/audio models on one canvas — cover far more
ground. For smaller, single-purpose examples, see the [Workflow
Gallery]({{ '/workflows/' | relative_url }}) and the
[Cookbook]({{ '/cookbook' | relative_url }}).

- **New to the canvas?** Start with [Getting Started]({{ '/getting-started' | relative_url }}).
- **Want the building blocks?** See [Key Concepts]({{ '/key-concepts' | relative_url }}) and [Nodes]({{ '/nodes/' | relative_url }}).
- **Bringing your own keys?** See [Models &amp; Providers]({{ '/models-and-providers' | relative_url }}).
</content>
</invoke>
