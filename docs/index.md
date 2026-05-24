---
layout: home
description: "NodeTool — the open creative AI workspace. One node canvas for image, video, audio, and LLM models. Bring your own keys, or run locally."
---

<section class="home-hero">
  <p class="eyebrow">The open creative AI workspace</p>
  <h1>Every model. Your keys. Your canvas.</h1>
  <p class="lead">
   NodeTool replaces the chatbox with a node canvas where image, video, audio, and LLM models run side by side. Bring your keys, or run everything locally. Open source, AGPL-3.0.
  </p>
  <img src="{{ '/assets/home.png' | relative_url }}" alt="NodeTool canvas" class="home-screenshot">
  <div class="cta-row">
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button primary">Get started</a>
    <a href="{{ '/workflows/' | relative_url }}" class="cta-button">Examples</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

## Use cases

* **Mix models from every vendor** — Wire Flux next to GPT-5 next to ElevenLabs in one graph. Pick the best model per step, not per project.
* **Run frontier models locally** — Ollama, MLX, and GGUF on your hardware. Works offline. Files never leave your disk.
* **Bring your own keys** — Pay OpenAI, Anthropic, Gemini, Replicate, FAL, and ElevenLabs directly. No credit markup, no provider tax.
* **Ship a workflow as a Mini-App** — Hide the graph, expose just inputs and outputs. Share a link, no install required.
* **Build agents that drive workflows** — Multi-step planning, tool calling, streaming. Drop them into any pipeline.
* **Chat with your documents** — Local Chroma, embeddings, RAG. Your data never leaves the machine.
* **Iterate visually, not via prompts** — Click a node, change a value, re-run. Watch data flow through every edge.

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
    <a href="{{ '/workflows/story-to-video-generator' | relative_url }}">Story to Video →</a>
  </article>
  <article class="pattern-card">
    <h5>Sound and voice</h5>
    <p>Music, sound design, narration. ElevenLabs, MusicGen, Whisper in the graph.</p>
    <a href="{{ '/workflows/image-to-audio-story' | relative_url }}">Image to Audio Story →</a>
  </article>
  <article class="pattern-card">
    <h5>Agents</h5>
    <p>Multi-step agents that plan, call tools, and drive pipelines.</p>
    <a href="{{ '/workflows/realtime-agent' | relative_url }}">Realtime Agent →</a>
  </article>
</div>

More patterns — pipelines, data, RAG, email — in the [Cookbook]({{ '/cookbook' | relative_url }}).

## Get started

<ol class="step-sequence">
  <li><a href="{{ '/installation' | relative_url }}">Download NodeTool</a> for macOS, Windows, or Linux.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-2--run-a-workflow">Open a template, press Run.</a></li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-3--edit">Edit, re-run, ship as a Mini-App.</a></li>
</ol>

## Explore

- **New here:** [Getting Started]({{ '/getting-started' | relative_url }}) · [Key Concepts]({{ '/key-concepts' | relative_url }}) · [UI]({{ '/user-interface' | relative_url }})
- **Building:** [Chat & Agents]({{ '/global-chat-agents' | relative_url }}) · [Cookbook]({{ '/cookbook' | relative_url }}) · [Examples]({{ '/workflows/' | relative_url }})
- **Self-hosting:** [Deployment]({{ '/deployment' | relative_url }}) · [Configuration]({{ '/configuration' | relative_url }}) · [API]({{ '/api-reference' | relative_url }})
- **Extending:** [Developer Guide]({{ '/developer/' | relative_url }}) · [Custom Nodes]({{ '/developer/node-reference' | relative_url }}) · [CLI]({{ '/cli' | relative_url }})

<section class="home-section">
  <h2>Open source</h2>
  <p>
    AGPL-3.0. <a href="https://discord.gg/WmQTWZRcYE" target="_blank" rel="noopener">Discord</a> ·
    <a href="https://github.com/nodetool-ai/nodetool" target="_blank" rel="noopener">GitHub</a>.
  </p>
</section>
