---
layout: page
title: "Use Cases"
description: "What people make with NodeTool, by kind of work: product marketing, ads, film, creator content, localization, design, games, team tools, and private local AI."
image: /assets/use-cases/poster-singularity-1.png
---

What people make with NodeTool, grouped by kind of work. Each section links to
the [Cookbook]({{ '/cookbook' | relative_url }}) recipes that start that work, and the
[showcase walkthroughs](#showcase-walkthroughs) at the end take finished
projects apart step by step. Models run on your provider keys, hosted credits,
or your own computer, and you can swap a model without rebuilding the project.
See [Costs & Credits]({{ '/costs-and-credits' | relative_url }}).

## Product marketing and e-commerce

Launch films, product spots, lifestyle mockups, and listing images built from
your real product photos and pages. Add the product as an
[reference]({{ '/entities' | relative_url }}) once, and every shot uses its
reference image. A campaign keeps the same cast across stills and several cuts,
and your brand colors and copy can be filled in from your website.

Start from the [video and ad recipes]({{ '/cookbook' | relative_url }}#video-and-ad-recipes) or the
[image recipes]({{ '/cookbook' | relative_url }}#image-3d-and-game-recipes).

## Performance ads

Many ad variants, each one editable, so you can test angles and refresh them.
Copy and hooks are compared before anything renders. A 15-second sound-off ad
is built from your real screenshots, a phone-shot testimonial from a short
brief, and one approved cut ships in 9:16, 1:1, and 16:9. The
[ad library](https://nodetool.ai/ad-library) shows each ad format with a beat
sheet and a sample cut.

Start from the [video and ad recipes]({{ '/cookbook' | relative_url }}#video-and-ad-recipes).

## Film, trailers, and narrative

Stories boarded shot by shot, with stills approved before any video renders.
Characters and locations are references, so they look the same in every shot.
A trailer can start from a one-line pitch, and a music video from a treatment.
The [Storyboard Editor]({{ '/storyboard-editor' | relative_url }}) covers
boarding and redoing a single shot by note.

Start from the [video and ad recipes]({{ '/cookbook' | relative_url }}#video-and-ad-recipes).

## Creators, podcasts, and explainers

One episode becomes show notes, a newsletter, and social posts. A narrated
explainer is timed to its voiceover, and captions and titles go on in the
[timeline]({{ '/video-editor' | relative_url }}).

Start from the [podcast recipes]({{ '/cookbook' | relative_url }}#podcast-and-localization-recipes) or the
[video recipes]({{ '/cookbook' | relative_url }}#video-and-ad-recipes).

## Localization

A clip dubbed into another language, or one explainer voiced and captioned for
each language. You review and edit the translation before it is voiced.

Start from the [localization recipes]({{ '/cookbook' | relative_url }}#podcast-and-localization-recipes).

## Design and key art

Variations to choose from, concept art directions from one brief, a single
change to an image such as lighting or pose, batch photo retouching, and sets
blocked out in 3D as a shot reference. The image you pick opens as a
[sketch]({{ '/sketch-editor' | relative_url }}), where each layer stays
editable.

Start from the [image and 3D recipes]({{ '/cookbook' | relative_url }}#image-3d-and-game-recipes).

## Games

Describe a world, a player, and a goal. The agent builds a playable 2D or 3D
game in the [game editor]({{ '/game-editor' | relative_url }}), where you play
it, change it, and export a web player. Start with the **Game** flow, or open
one of the shipped games from **Examples**.

## Team tools and automation

Simple screens a coworker runs without seeing the workflow behind them,
answers drawn from your own documents, work across Drive, Gmail, Docs, Sheets,
and Calendar, runs on a schedule or a file drop, and your agent in Telegram.
A procedure you repeat becomes a [skill]({{ '/skills' | relative_url }}) the
agent follows the same way every time.

Start from the [team recipes]({{ '/cookbook' | relative_url }}#tools-for-a-team).

## Developers

NodeTool runs inside other tools as well as on its own. Claude Code and other
agents drive it through the [MCP server]({{ '/mcp-server' | relative_url }}).
Your code calls workflows over the [API]({{ '/api-reference' | relative_url }})
or runs them with the [CLI]({{ '/cli' | relative_url }}). New node types are
written in TypeScript, as covered in the
[Developer Guide]({{ '/developer/' | relative_url }}).

## Private and local AI

Run language, image, and speech models on your own computer, so your files
never leave it. A team can run its own NodeTool server. See
[Local vs Cloud]({{ '/models' | relative_url }}) and
[Self-Hosted]({{ '/self-hosted-deployment' | relative_url }}).

## Showcase walkthroughs

These pages take one showcase workflow apart node by node. Each one starts
from a few inputs and ends with a finished result you can re-run with your own
brief.

<div class="usecase-grid">
  <article class="usecase-card">
    <a href="{{ '/use-cases/movie-trailer' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" alt="Cinematic key-art frame from the Movie Trailer Generator">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Film</span>
      <h3><a href="{{ '/use-cases/movie-trailer' | relative_url }}">Movie Trailer Generator</a></h3>
      <p>Type one logline and the canvas builds a cinematic teaser: a Director node storyboards it into shots, each shot is rendered as key art, animated, and cut into a finished trailer.</p>
      <div class="pipeline-chips">
        <span>Logline</span><span>Storyboard</span><span>Shots</span><span>Key art</span><span>Trailer</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/documentary-teaser' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/deep-shot-6.jpg' | relative_url }}" alt="Bioluminescent whale frame from the Documentary Teaser Generator">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Documentary</span>
      <h3><a href="{{ '/use-cases/documentary-teaser' | relative_url }}">Documentary Teaser Generator</a></h3>
      <p>Describe the film in a sentence and the storyboard boards it shot by shot: a card per beat, a still on every card, animated clips, and a cut teaser on the timeline.</p>
      <div class="pipeline-chips">
        <span>Premise</span><span>Storyboard</span><span>Stills</span><span>Clips</span><span>Timeline</span>
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
      <p>Turn a campaign brief and a single product photo into a cinematic 16:9 product video. Your inputs feed a prompt, an agent directs the shot, and an image-to-video model animates the photo.</p>
      <div class="pipeline-chips">
        <span>Brief</span><span>Prompt</span><span>Agent</span><span>Image-to-Video</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/ad-creative-factory' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" alt="Product photo feeding the Ad Creative Factory">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Advertising</span>
      <h3><a href="{{ '/use-cases/ad-creative-factory' | relative_url }}">Ad Creative Factory</a></h3>
      <p>One product photo and one offer become a batch of ready-to-test vertical video ads. A strategist agent plans which audiences and selling points to test, and each combination becomes a spoken hook, a staged scene, an animated clip, and a voiceover.</p>
      <div class="pipeline-chips">
        <span>Offer</span><span>Matrix</span><span>Hooks</span><span>Scenes</span><span>Ads</span>
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
      <p>From a title, genre, and visual style, the canvas writes a creative strategy and renders a batch of cinematic poster concepts, one image per concept.</p>
      <div class="pipeline-chips">
        <span>Brief</span><span>Strategy</span><span>Concepts</span><span>Key art</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/podcast-repurposing-studio' | relative_url }}" class="usecase-media"></a>
    <div class="usecase-body">
      <span class="usecase-tag">Creators</span>
      <h3><a href="{{ '/use-cases/podcast-repurposing-studio' | relative_url }}">Podcast Repurposing Studio</a></h3>
      <p>Drop in one episode and ship the whole content pack: titles and show notes, a newsletter edition, five social posts, and quote cards rendered as square images. Transcribed once, written four ways.</p>
      <div class="pipeline-chips">
        <span>Episode</span><span>Transcript</span><span>Notes</span><span>Newsletter</span><span>Cards</span>
      </div>
    </div>
  </article>

  <article class="usecase-card">
    <a href="{{ '/use-cases/seo-content-engine' | relative_url }}" class="usecase-media"></a>
    <div class="usecase-body">
      <span class="usecase-tag">Content</span>
      <h3><a href="{{ '/use-cases/seo-content-engine' | relative_url }}">SEO Content Engine</a></h3>
      <p>One topic in, a keyword-targeted article batch out. A strategist agent plans the cluster, and every brief becomes a full article with title, meta description, keywords, and body, plus an editorial hero image.</p>
      <div class="pipeline-chips">
        <span>Topic</span><span>Cluster</span><span>Briefs</span><span>Articles</span><span>Heroes</span>
      </div>
    </div>
  </article>
</div>

The Movie Trailer Generator, Product Video Generator, Movie Posters, Podcast
Repurposing Studio, and SEO Content Engine ship as workflow templates. The
Documentary Teaser Generator and Ad Creative Factory do not, so build them from
the node lists on their pages.

## Related pages

<div class="card-grid">
  <a class="doc-card" href="{{ '/cookbook' | relative_url }}"><strong>Cookbook</strong><span>The skill, flow, or app that starts each kind of project, and when to turn it into a workflow.</span></a>
  <a class="doc-card" href="{{ '/workflows/' | relative_url }}"><strong>Examples</strong><span>Every shipped example: apps, recipes, workflows, storyboards, timelines, sketches, 3D models, and games.</span></a>
  <a class="doc-card" href="{{ '/skills' | relative_url }}"><strong>Shipped Skills</strong><span>The procedures the agent follows for each kind of project.</span></a>
  <a class="doc-card" href="{{ '/getting-started' | relative_url }}"><strong>Quick Start</strong><span>Install NodeTool and make a first project.</span></a>
</div>
