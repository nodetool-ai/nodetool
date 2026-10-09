---
layout: page
title: "Use Cases"
description: "What people make with NodeTool, by kind of work: product marketing, ads, film, creator content, localization, design, games, team tools, and private local AI."
image: /assets/use-cases/poster-singularity-1.png
---

NodeTool is an agent-first creative workspace. You describe the result, the
agent builds it as a project, and you finish it in an editor. This page groups
what people make by the kind of work. Each section names where to start: a
shipped skill you type after `/` in chat, a guided flow on **New project**, or
an app from the [Examples]({{ '/workflows/' | relative_url }}) page.

Every model runs on your own provider keys, on hosted credits, or locally. You
can switch any model for another one without rebuilding the project. See
[Costs & Credits]({{ '/costs-and-credits' | relative_url }}).

## Product marketing and e-commerce

Launch films, product spots, and listing images built from your real product
photos and pages.

| You want | Start with |
|---|---|
| A launch film from a product page | `/launch-commercial` with the page URL |
| A polished product film | `/product-commercial`, or the **Storyboard** flow |
| A full image set from one packshot | The **SKU Factory** app, or the [packshot recipe](https://nodetool.ai/recipes/ecommerce-sku-visual-factory) |
| Lifestyle mockups, then video | The **Product Launch Kit** app |
| A campaign with one cast across stills and cuts | `/launch-kit`, or the **Directed Campaign Kit** app |
| Your brand filled in from your website | The **Brand & Social** app |

Add the product as an [entity]({{ '/entities' | relative_url }}) once, and
every shot uses its reference image.

## Performance ads

Many ad variants, each editable, so you can test angles and refresh them.

| You want | Start with |
|---|---|
| A 15-second sound-off ad from screenshots | `/motion-ad`, or one of the sixteen ad-format apps |
| A phone-shot creator testimonial | `/ugc-video`, or the **UGC Product Video** app |
| Copy and hooks compared before rendering | The **Viral Ad Engine** or **Ad Maker** app |
| Your version of an ad you saw | `/video-clone` with the reference video |
| The same ad in 9:16, 1:1, and 16:9 | The **Three Ratios** workflow |

The [ad library](https://nodetool.ai/ad-library) shows each ad format with a
beat sheet and a sample cut.

## Film, trailers, and narrative

Stories boarded shot by shot, with stills approved before any video renders.

| You want | Start with |
|---|---|
| A short film, scene, or trailer | The **Storyboard** flow, or `/short-film` |
| A trailer from a story pitch | The **Trailer Room** app |
| A music video treatment | `/music-video-treatment` |
| One brief in, a cut film out, unattended | The **Direct a Short Film** workflow |

Characters and locations are [entities]({{ '/entities' | relative_url }}), so
they look the same in every shot. The
[Creative Agent]({{ '/creative-agent' | relative_url }}) page covers redoing a
single shot by note.

## Creators, podcasts, and explainers

| You want | Start with |
|---|---|
| Show notes, a newsletter, and social posts from an episode | The **Podcast Production Desk** app |
| A narrated explainer | The **Script** flow, or `/script-video` |
| A vlog or creator video | `/ugc-video` |
| Captions and titles on a finished cut | The [timeline]({{ '/video-editor' | relative_url }}), or `/caption-titles` |

## Localization

| You want | Start with |
|---|---|
| A clip dubbed into another language | The **Dubbing Desk** app, or the [dubbing recipe](https://nodetool.ai/recipes/multilingual-video-dubber) |
| An explainer voiced and captioned per language | The **Localized Explainer** workflow |

You review and edit the translation before it is voiced.

## Design and key art

| You want | Start with |
|---|---|
| One image with variations to choose from | The **Image** flow, which opens the pick as a [sketch]({{ '/sketch-editor' | relative_url }}) |
| Concept art directions from one brief | The **Concept Studio** app |
| One change to an image, such as lighting or pose | The **Vary Image** app |
| Photo grading and batch retouching | The **Photo Studio** app |
| A set blocked out in 3D as a shot reference | The [3D editor]({{ '/3d-editor' | relative_url }}), or `/nodetool-3d-scene` |

## Games

Describe a world, a player, and a goal. The agent builds a playable 2D or 3D
game in the [game editor]({{ '/game-editor' | relative_url }}), where you play
it, change it, and export a web player. Start with the **Game** flow or
`/native-game`, or open one of the five shipped games.

## Team tools and automation

| You want | Start with |
|---|---|
| A simple screen a coworker runs without seeing the graph | A [mini app]({{ '/mini-apps' | relative_url }}), or `/nodetool-app-builder` |
| Answers from your own documents | [Collections]({{ '/collections' | relative_url }}), or `/nodetool-rag-indexing` |
| Work in Drive, Gmail, Docs, Sheets, and Calendar | [Google Workspace]({{ '/google-workspace' | relative_url }}) |
| A run on a schedule, a file drop, or a webhook | [Triggers]({{ '/triggers' | relative_url }}) |
| Your agent in Telegram | [Telegram Bot]({{ '/telegram-bot' | relative_url }}) |
| A procedure the agent repeats the same way | Your own [skill]({{ '/skills' | relative_url }}) |

## Developers

NodeTool runs inside other tools as well as on its own. Claude Code and other
agents drive it through the [MCP server]({{ '/mcp-server' | relative_url }}).
Your code calls workflows over the [API]({{ '/api-reference' | relative_url }})
or runs them with the [CLI]({{ '/cli' | relative_url }}). New node types are
written in TypeScript, as covered in the
[Developer Guide]({{ '/developer/' | relative_url }}).

## Private and local AI

Run language, image, and speech models on your own machine with Ollama,
llama.cpp, or MLX on Apple Silicon, so your files stay on it. Self-host the
server with Docker for a team. See [Local vs Cloud]({{ '/models' | relative_url }})
and [Self-Hosted]({{ '/self-hosted-deployment' | relative_url }}).

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
      <p>One product photo and one offer become a batch of ready-to-test vertical video ads. A strategist agent plans a persona × angle test matrix, and every cell becomes a spoken hook, a staged scene, an animated clip, and a voiceover.</p>
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
  <a class="doc-card" href="{{ '/cookbook' | relative_url }}"><strong>Cookbook</strong><span>Where to start for each kind of project, and when to turn it into a workflow.</span></a>
  <a class="doc-card" href="{{ '/workflows/' | relative_url }}"><strong>Examples</strong><span>Every shipped example: apps, recipes, workflows, storyboards, timelines, sketches, 3D models, and games.</span></a>
  <a class="doc-card" href="{{ '/skills' | relative_url }}"><strong>Shipped Skills</strong><span>The procedures the agent follows for each kind of project.</span></a>
  <a class="doc-card" href="{{ '/getting-started' | relative_url }}"><strong>Quick Start</strong><span>Install NodeTool and make a first project.</span></a>
</div>
