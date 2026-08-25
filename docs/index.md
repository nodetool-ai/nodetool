---
layout: home
description: "NodeTool — the open creative AI workspace. Ask an agent to build the workflow, then take the controls. Image, video, audio, and LLM models on one canvas, with your own keys or local models."
---

<section class="home-hero">
  <p class="eyebrow">The open creative AI workspace</p>
  <h1>Ask for it. Then take the controls.</h1>
  <p class="lead">
   Describe what you want and NodeTool's agent builds it: a workflow, a layered image, a video cut, a small app. Everything it makes lands on a canvas you can open, inspect, and change by hand. Your keys or your own hardware. Open source, AGPL-3.0.
  </p>
  <img src="{{ '/assets/home.png' | relative_url }}" alt="NodeTool canvas" class="home-screenshot">
  <div class="cta-row">
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button primary">Get started</a>
    <a href="{{ '/workflows/' | relative_url }}" class="cta-button">Examples</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

## Start by asking

One agent runs through the whole app. It reads the document you have open and
edits it with the same actions you would use by hand, so its work is a normal
workflow, sketch, or timeline afterwards. Nothing it builds is locked, and
nothing it builds is hidden.

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>Say what you want</h5>
    <p>"Turn this logline into a storyboard and a cut teaser." The agent picks nodes, wires them, chooses models, and runs it.</p>
    <a href="{{ '/global-chat-agents' | relative_url }}">Chat &amp; Agents →</a>
  </article>
  <article class="pattern-card">
    <h5>Watch it work</h5>
    <p>Every step streams: the plan, each tool call, each node as it lights up. A permission chip sets whether it asks first.</p>
    <a href="{{ '/global-chat' | relative_url }}#agent-mode">The agent loop →</a>
  </article>
  <article class="pattern-card">
    <h5>Take over any time</h5>
    <p>Click a node, change a value, rewire an edge, re-run. The graph is the source of truth for both of you.</p>
    <a href="{{ '/workflow-editor' | relative_url }}">Workflow editor →</a>
  </article>
</div>

The same agent works on every surface: the node graph, the [Sketch
Editor]({{ '/sketch-editor' | relative_url }}), the [Video
Editor]({{ '/video-editor' | relative_url }}), scripts and storyboards, and the
[App Builder]({{ '/app-builder' | relative_url }}). Ask it to add a track, paint
a layer, revise a shot, or wire a form field, and watch the document change.

## Featured use cases

Three flagship workflows, end to end. Each starts from a few inputs and builds a
finished result on one canvas you can re-run, restyle, and re-point at your own
story. [See all use cases →]({{ '/use-cases' | relative_url }})

<div class="usecase-grid">
  <article class="usecase-card">
    <a href="{{ '/use-cases/movie-trailer' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/trailer-shot-1.png' | relative_url }}" alt="Movie Trailer Generator key art">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Film</span>
      <h3><a href="{{ '/use-cases/movie-trailer' | relative_url }}">Movie Trailer Generator</a></h3>
      <p>One logline becomes a storyboard, key art, and a cut teaser.</p>
    </div>
  </article>
  <article class="usecase-card">
    <a href="{{ '/use-cases/documentary-teaser' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/deep-shot-6.jpg' | relative_url }}" alt="Documentary Teaser Generator still">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Documentary</span>
      <h3><a href="{{ '/use-cases/documentary-teaser' | relative_url }}">Documentary Teaser Generator</a></h3>
      <p>One sentence becomes a board, stills, clips, and a cut teaser.</p>
    </div>
  </article>

 <article class="usecase-card">
    <a href="{{ '/use-cases/product-video' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/smartwatch.png' | relative_url }}" alt="Product Video Generator hero photo">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Marketing</span>
      <h3><a href="{{ '/use-cases/product-video' | relative_url }}">Product Video Generator</a></h3>
      <p>A brief and one product photo become a cinematic 16:9 clip.</p>
    </div>
  </article>
  <article class="usecase-card">
    <a href="{{ '/use-cases/movie-poster' | relative_url }}" class="usecase-media">
      <img src="{{ '/assets/use-cases/poster-singularity-1.png' | relative_url }}" alt="Movie Poster Generator concept">
    </a>
    <div class="usecase-body">
      <span class="usecase-tag">Design</span>
      <h3><a href="{{ '/use-cases/movie-poster' | relative_url }}">Movie Poster Generator</a></h3>
      <p>Title, genre, and audience become a batch of theatrical poster concepts.</p>
    </div>
  </article>
</div>

## What you can do

* **Have the agent build it** — Describe the outcome and it assembles the graph, picks the models, runs it, and reports what came back.
* **Edit what it built** — Click a node, change a value, re-run. Nothing is generated behind glass; the graph is a file you own.
* **Put agents inside the pipeline too** — An Agent node plans, calls tools, and streams, as one step of a larger workflow.
* **Mix models from every vendor** — Wire Flux next to GPT-5.6 next to ElevenLabs in one graph. Pick the best model per step, not per project.
* **Run frontier models locally** — Ollama, MLX, and GGUF on your hardware. Works offline. Files never leave your disk.
* **Bring your own keys** — Pay OpenAI, Anthropic, Gemini, Replicate, FAL, and ElevenLabs directly. No credit markup, no provider tax.
* **Ship a workflow as a Mini-App** — Hide the graph, expose just inputs and outputs. Share a link, no install required.
* **Chat with your documents** — Local SQLite-vec, embeddings, RAG. Your data never leaves the machine.

## Studio or Cloud

Same code, same workflows. Both AGPL-3.0.

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>NodeTool Studio — desktop</h5>
    <p>
      Mac, Windows, Linux. Local inference via Ollama, MLX, and GGUF. Works offline. Prompts and outputs stay on disk. BYOK for cloud providers when you want them.
    </p>
    <a href="https://nodetool.ai/studio">Download Studio →</a>
  </article>
  <article class="pattern-card">
    <h5>NodeTool Cloud — browser</h5>
    <p>
      Hosted, no install. Same canvas, same nodes. BYOK for every cloud provider — OpenAI, Anthropic, Gemini, Replicate, FAL, ElevenLabs, HuggingFace. No local models.
    </p>
    <a href="https://nodetool.ai/cloud">Open Cloud →</a>
  </article>
</div>

> **No credit markup.** Cloud hosts the same code in this repo. Self-host the Docker images any time. You pay providers directly.

## What you can build

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>Image and video</h5>
    <p>Flux, Qwen, Wan, Seedance, Sora, Veo, Kling on one canvas.</p>
    <a href="{{ '/workflows/movie-posters' | relative_url }}">Movie Posters →</a>
  </article>
  <article class="pattern-card">
    <h5>Story to video</h5>
    <p>Prompt to storyboard to narration to animation to score.</p>
    <a href="{{ '/use-cases/movie-trailer' | relative_url }}">Movie Trailer Generator →</a>
  </article>
  <article class="pattern-card">
    <h5>Sound and voice</h5>
    <p>Music, sound design, narration. ElevenLabs, MusicGen, Whisper in the graph.</p>
    <a href="{{ '/workflows/image-to-audio-story' | relative_url }}">Image to Audio Story →</a>
  </article>
  <article class="pattern-card">
    <h5>Agents</h5>
    <p>Agents that plan, call tools, and drive pipelines — in chat or as a node.</p>
    <a href="{{ '/workflows/fetch-papers' | relative_url }}">Fetch Papers →</a>
  </article>
</div>

More patterns — pipelines, data, RAG, email — in the [Cookbook]({{ '/cookbook' | relative_url }}).

## Get started

<ol class="step-sequence">
  <li><a href="{{ '/installation' | relative_url }}">Download NodeTool</a> for macOS, Windows, or Linux.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-2--ask-for-what-you-want">Connect a provider and ask the agent for something.</a></li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-4--change-something">Open what it built, change it, ship it as a Mini-App.</a></li>
</ol>

## Explore

- **New here:** [Getting Started]({{ '/getting-started' | relative_url }}) · [Key Concepts]({{ '/key-concepts' | relative_url }}) · [UI]({{ '/user-interface' | relative_url }})
- **Working with the agent:** [Chat]({{ '/global-chat' | relative_url }}) · [Chat & Agents]({{ '/global-chat-agents' | relative_url }}) · [Agent Memory]({{ '/agent-memory' | relative_url }})
- **Building:** [Cookbook]({{ '/cookbook' | relative_url }}) · [Examples]({{ '/workflows/' | relative_url }}) · [Mini Apps]({{ '/mini-apps' | relative_url }})
- **Self-hosting:** [Deployment]({{ '/deployment' | relative_url }}) · [Configuration]({{ '/configuration' | relative_url }}) · [API]({{ '/api-reference' | relative_url }})
- **Extending:** [Developer Guide]({{ '/developer/' | relative_url }}) · [Custom Nodes]({{ '/developer/node-reference' | relative_url }}) · [CLI]({{ '/cli' | relative_url }})

<section class="home-section">
  <h2>Open source</h2>
  <p>
    AGPL-3.0. <a href="https://discord.gg/WmQTWZRcYE" target="_blank" rel="noopener">Discord</a> ·
    <a href="https://github.com/nodetool-ai/nodetool" target="_blank" rel="noopener">GitHub</a>.
  </p>
</section>
