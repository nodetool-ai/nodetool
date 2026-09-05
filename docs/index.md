---
layout: home
description: "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together."
---

<section class="home-hero">
  <p class="eyebrow">NodeTool documentation</p>
  <h1>Open-source creative AI workspace</h1>
  <p class="lead">
    Create and edit images, video, audio, and text with agents that work alongside
    you. Let them build and revise workflows, then inspect and edit the results
    yourself. Your project keeps the brief, assets, and edits together.
  </p>
  <img src="{{ '/assets/home.png' | relative_url }}" alt="NodeTool canvas" class="home-screenshot">
  <div class="cta-row">
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button primary">Get started</a>
    <a href="{{ '/workflows/' | relative_url }}" class="cta-button">Examples</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

## Start by asking

One agent works across the whole app. It looks at your open document and edits it just like you would. This means everything it creates acts like a normal workflow, drawing, or timeline. Nothing is locked, and nothing is hidden from you.

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>Say what you want</h5>
    <p>"Turn this story idea into a storyboard and a short video trailer." The agent picks the right parts, connects them, chooses the best tools, and runs it all.</p>
    <a href="{{ '/global-chat-agents' | relative_url }}">Chat &amp; Agents →</a>
  </article>
  <article class="pattern-card">
    <h5>Watch it work</h5>
    <p>You can see everything happen in real-time: the plan, every tool it uses, and every part as it works. A simple setting lets you choose if it needs your permission before doing anything.</p>
    <a href="{{ '/global-chat' | relative_url }}#agent-mode">The agent loop →</a>
  </article>
  <article class="pattern-card">
    <h5>Take over any time</h5>
    <p>Click a node, change a value, rewire an edge, re-run. The graph is the source of truth for both of you.</p>
    <a href="{{ '/workflow-editor' | relative_url }}">Workflow editor →</a>
  </article>
</div>

The same agent works everywhere: the node view, the [Sketch Editor]({{ '/sketch-editor' | relative_url }}), the [Video Editor]({{ '/video-editor' | relative_url }}), scripts, storyboards, and the [App Builder]({{ '/app-builder' | relative_url }}). Just ask it to add a new music track, draw a layer, change a video clip, or connect a form, and watch it happen.

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

* **Let the AI build it** — Describe what you want, and it puts everything together, chooses the tools, runs them, and shows you the result.
* **Edit what it built** — Click any part, change its settings, and run it again. Nothing is hidden; you own everything it creates.
* **Put AI inside your workflows** — You can make an agent act as one step in a larger process, letting it plan and use tools.
* **Mix models from anywhere** — Use different AI models together, like an image maker with a text writer and a voice generator, all in one place. Choose the best tool for each specific job.
* **Run advanced models on your computer** — Run powerful models directly on your hardware. It works without the internet, and your files stay private.
* **Use your own accounts** — Pay AI companies like OpenAI or Google directly. We do not add any extra fees or charges.
* **Share your workflow as a Mini-App** — Turn your complex work into a simple app with just inputs and outputs. Share a link, and others can use it without installing anything.
* **Chat with your documents** — Search and talk to your own files securely. Your data stays safely on your computer.

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

More creative patterns — directed films, entity-consistent batches, script-driven cuts — in the [Cookbook]({{ '/cookbook' | relative_url }}).

## Get started

<ol class="step-sequence">
  <li><a href="{{ '/installation' | relative_url }}">Download NodeTool</a> for macOS, Windows, or Linux.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-1--install-and-connect-your-models">Connect a language, image, and video model.</a></li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-2--ask-the-agent-for-a-storyboard">Ask the agent for a storyboard, render it, and export the film.</a></li>
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
