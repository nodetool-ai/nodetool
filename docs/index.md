---
layout: home
description: "NodeTool — the open creative AI workspace. Every major model, your own keys, one node-based canvas. Runs on your machine or in the browser."
---

<section class="home-hero">
  <p class="eyebrow">The open creative AI workspace</p>
  <h1>Every model. Your keys. Your canvas.</h1>
  <p class="lead">
   One node-based canvas for making images, video, sound, and stories with AI. Wire up Flux, Qwen, Wan, Seedance, Sora, Veo, Kling, ElevenLabs, MusicGen, and the major LLMs side by side — bring your own keys, or run locally. Open source, AGPL-3.0.
  </p>
  <img src="{{ '/assets/home.png' | relative_url }}" alt="NodeTool canvas" class="home-screenshot">
  <div class="cta-row">
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button primary">Get started</a>
    <a href="{{ '/workflows/' | relative_url }}" class="cta-button">Examples</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

## Studio or Cloud

Both editions are open source under AGPL-3.0 and built from the same code. Workflows are portable between them.

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>NodeTool Studio — desktop</h5>
    <p>
      Runs on macOS, Windows, and Linux. Local inference via Ollama, MLX, and GGUF on your hardware. Works offline. Files, prompts, and outputs stay on disk. Bring your keys for cloud providers when you want them.
    </p>
    <p><strong>For:</strong> local inference, offline work, GPU owners, privacy.</p>
    <a href="https://nodetool.ai/studio">Download Studio →</a>
  </article>
  <article class="pattern-card">
    <h5>NodeTool Cloud — browser</h5>
    <p>
      Hosted, no install. Same canvas, same nodes. Bring your keys for every cloud provider — OpenAI, Anthropic, Gemini, Replicate, FAL, ElevenLabs, HuggingFace. Does not run local models.
    </p>
    <p><strong>For:</strong> no setup, working across devices, no GPU.</p>
    <a href="https://nodetool.ai/cloud">Open Cloud →</a>
  </article>
</div>

> **No credit markup.** Cloud is managed hosting of the code in this repo. You can self-host the same Docker images and CLI any time. You pay providers directly.

## What you can build

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>Image and video</h5>
    <p>Posters, characters, scenes. Flux, Qwen, Wan, Seedance, Sora, Veo, Kling on one canvas.</p>
    <a href="{{ '/workflows/movie-posters' | relative_url }}">Movie Posters →</a>
  </article>
  <article class="pattern-card">
    <h5>Story to video</h5>
    <p>Turn a prompt into a storyboard, narrate it, animate it, score it.</p>
    <a href="{{ '/workflows/story-to-video-generator' | relative_url }}">Story to Video →</a>
  </article>
  <article class="pattern-card">
    <h5>Sound and voice</h5>
    <p>Music, sound design, narration. ElevenLabs, MusicGen, Whisper wired into the graph.</p>
    <a href="{{ '/workflows/image-to-audio-story' | relative_url }}">Image to Audio Story →</a>
  </article>
  <article class="pattern-card">
    <h5>Agents</h5>
    <p>Multi-step agents that plan, call tools, and drive your creative pipelines.</p>
    <a href="{{ '/workflows/realtime-agent' | relative_url }}">Realtime Agent →</a>
  </article>
</div>

More patterns — pipelines, data, RAG, email — in the [Cookbook]({{ '/cookbook' | relative_url }}).

## Get started

<ol class="step-sequence">
  <li><a href="{{ '/installation' | relative_url }}">Download NodeTool</a> for macOS, Windows, or Linux.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-2--run-your-first-workflow">Open a template</a>, press Run, watch results stream.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-3--customize-and-iterate">Edit and iterate.</a></li>
</ol>

## Explore

- **New here:** [Getting Started]({{ '/getting-started' | relative_url }}) · [Key Concepts]({{ '/key-concepts' | relative_url }}) · [UI]({{ '/user-interface' | relative_url }})
- **Building:** [Global Chat & Agents]({{ '/global-chat-agents' | relative_url }}) · [Cookbook]({{ '/cookbook' | relative_url }}) · [Examples]({{ '/workflows/' | relative_url }})
- **Self-hosting:** [Deployment]({{ '/deployment' | relative_url }}) · [Configuration]({{ '/configuration' | relative_url }}) · [API]({{ '/api-reference' | relative_url }})
- **Extending:** [Developer Guide]({{ '/developer/' | relative_url }}) · [Custom Nodes]({{ '/developer/node-reference' | relative_url }}) · [CLI]({{ '/cli' | relative_url }})

<section class="home-section">
  <h2>Open source</h2>
  <p>
    AGPL-3.0. <a href="https://discord.gg/WmQTWZRcYE" target="_blank" rel="noopener">Discord</a> ·
    <a href="https://github.com/nodetool-ai/nodetool" target="_blank" rel="noopener">GitHub</a>.
  </p>
</section>
