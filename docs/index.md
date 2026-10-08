---
layout: home
description: "Open-source agent-first creative workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together."
---

<section class="home-hero">
  <p class="eyebrow">NodeTool documentation</p>
  <h1>Open-source agent-first creative workspace</h1>
  <p class="lead">
    Create and edit images, video, audio, and text with agents that work alongside
    you. Let them build and revise workflows, then inspect and edit the results
    yourself. Your project keeps the brief, assets, and edits together.
  </p>
  <figure class="hero-reel">
    <div class="media-frame">
      <video class="inview-video" muted loop playsinline preload="metadata"
        poster="https://nodetool.ai/hero-flow-poster.webp"
        aria-label="One sentence becomes a beat sheet, entities, a storyboard of stills and clips, and a finished cut">
        <source src="https://nodetool.ai/hero-flow.webm" type="video/webm">
        <source src="https://nodetool.ai/hero-flow.mp4" type="video/mp4">
      </video>
    </div>
    <figcaption>One sentence to a finished short: beat sheet, entities, storyboard, clips, and the cut.</figcaption>
  </figure>
  <div class="cta-row">
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button primary">Get started</a>
    <a href="{{ '/workflows/' | relative_url }}" class="cta-button">Examples</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

<section class="home-block">
  <p class="section-kicker">Agents</p>
  <h2 id="start-by-asking">Describe it. The agent builds the project.</h2>
  <p class="section-lead">
    Give the agent a brief. It drafts the script, boards the shots, renders the
    takes, and cuts them on a timeline. What comes back is a project you can
    open, not a finished file.
  </p>
  <figure class="media-frame agent-media">
    <video class="inview-video" muted loop playsinline preload="none"
      poster="https://nodetool.ai/agent-redo-poster.webp"
      aria-label="The agent renders a six-shot storyboard. A one-line note sends shot 3 back for night, only that shot renders again, and the timeline cut picks up the new take.">
      <source src="https://nodetool.ai/agent-redo.webm" type="video/webm">
      <source src="https://nodetool.ai/agent-redo.mp4" type="video/mp4">
    </video>
  </figure>
  <ol class="agent-steps">
    <li>
      <strong>Write the brief</strong>
      <span>"Turn this story idea into a storyboard and a short trailer."</span>
    </li>
    <li>
      <strong>Watch it work</strong>
      <span>The plan, every tool call, and every render appear as they run. A permission mode decides what needs your approval.</span>
    </li>
    <li>
      <strong>Take over, or send a note</strong>
      <span>Change any part yourself, or ask the agent to redo the one shot you want different.</span>
    </li>
  </ol>
  <p class="agent-links">
    <a href="{{ '/global-chat-agents' | relative_url }}">Chat &amp; Agents →</a>
    <a href="{{ '/global-chat' | relative_url }}#agent-mode">The agent loop →</a>
  </p>
</section>

<section class="home-block">
  <p class="section-kicker">Editors</p>
  <h2 id="seven-editors">Seven editors. One project.</h2>
  <p class="section-lead">
    Everything the agent makes opens in an editor. The agent works each editor
    with the same tools you click.
  </p>
  <div class="surface-grid">
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-storyboard-poster.webp" aria-label="Storyboard editor">
          <source src="https://nodetool.ai/surface-storyboard.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-storyboard.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Storyboard</h3>
        <p>Board the film shot by shot. Generate cheap stills to lock the look, then animate only the shots you approved.</p>
        <a href="{{ '/ai-video-production' | relative_url }}#storyboard-direct-each-shot-before-animation">Storyboards →</a>
      </div>
    </article>
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-timeline-poster.webp" aria-label="Timeline editor">
          <source src="https://nodetool.ai/surface-timeline.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-timeline.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Timeline</h3>
        <p>Arrange, trim, and layer generated video and audio across tracks. The agent edits the same document when you ask it to tighten the opening.</p>
        <a href="{{ '/video-editor' | relative_url }}">Video Editor →</a>
      </div>
    </article>
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-script-poster.webp" aria-label="Script editor">
          <source src="https://nodetool.ai/surface-script.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-script.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Script &amp; voice</h3>
        <p>Draft the dialogue and cast a voice per character. Change the words and the take flags itself stale.</p>
        <a href="{{ '/ai-video-production' | relative_url }}#script-write-and-cast-the-words-first">Scripts →</a>
      </div>
    </article>
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-sketch-poster.webp" aria-label="Sketch editor">
          <source src="https://nodetool.ai/surface-sketch.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-sketch.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Sketch</h3>
        <p>Paint and blend hand-drawn elements with generated layers. Bind a layer to a prompt and regenerate that layer alone.</p>
        <a href="{{ '/sketch-editor' | relative_url }}">Sketch Editor →</a>
      </div>
    </article>
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-3d-poster.webp" aria-label="3D editor">
          <source src="https://nodetool.ai/surface-3d.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-3d.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>3D</h3>
        <p>Block out a set with simple shapes and lights, by hand or by asking the agent. Render it from any angle as a shot reference.</p>
        <a href="{{ '/3d-editor' | relative_url }}">3D Editor →</a>
      </div>
    </article>
    <article class="surface-card wide">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-game-poster.webp" aria-label="Game editor">
          <source src="https://nodetool.ai/surface-game.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-game.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Game</h3>
        <p>Build a 2D or 3D game and play it in the editor. Ask the agent for a new level, then export a web player.</p>
        <a href="{{ '/game-editor' | relative_url }}">Game Editor →</a>
      </div>
    </article>
    <article class="surface-card full">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/surface-nodes-poster.webp" aria-label="Node editor">
          <source src="https://nodetool.ai/surface-nodes.webm" type="video/webm">
          <source src="https://nodetool.ai/surface-nodes.mp4" type="video/mp4">
        </video>
      </div>
      <div class="surface-body">
        <h3>Nodes</h3>
        <p>Every editor above sits on a graph you can open. Wire typed ports, press Run, and read the output at every step.</p>
        <a href="{{ '/workflow-editor' | relative_url }}">Workflow Editor →</a>
      </div>
    </article>
  </div>
</section>

<section class="home-block">
  <p class="section-kicker">Examples</p>
  <h2 id="featured-use-cases">Start from an example</h2>
  <p class="section-lead">
    Every video below is a NodeTool timeline. Open one, swap in your own
    product, copy, and footage, and render your version.
  </p>
  <h3 id="ad-recipes" class="example-heading">Ad recipes</h3>
  <p class="example-lead">
    Sound-off vertical ad formats with a beat sheet, an asset list, and a
    rendered sample cut.
  </p>
  <div class="recipe-grid ads">
    <a class="recipe-card" href="https://nodetool.ai/ad-library/kinetic-offer-wall">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/ad-library/videos/kinetic-offer-wall.webp" aria-label="Kinetic offer wall sample ad">
          <source src="https://nodetool.ai/ad-library/videos/kinetic-offer-wall.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Offer</span>
        <h3>Kinetic offer wall</h3>
        <p>One offer stays readable while the product range moves behind it.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/ad-library/product-cutout-shuffle">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/ad-library/videos/product-cutout-shuffle.webp" aria-label="Product cutout shuffle sample ad">
          <source src="https://nodetool.ai/ad-library/videos/product-cutout-shuffle.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Range</span>
        <h3>Product cutout shuffle</h3>
        <p>Product cutouts swap on a fixed baseline to show every flavour.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/ad-library/editorial-image-panels">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/ad-library/videos/editorial-image-panels.webp" aria-label="Editorial image panels sample ad">
          <source src="https://nodetool.ai/ad-library/videos/editorial-image-panels.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Premium</span>
        <h3>Editorial image panels</h3>
        <p>Three photos and short copy make a calm, sound-off brand ad.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/ad-library/integration-puzzle-that-snaps-together">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/ad-library/videos/integration-puzzle-that-snaps-together.webp" aria-label="Integration puzzle sample ad">
          <source src="https://nodetool.ai/ad-library/videos/integration-puzzle-that-snaps-together.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Software</span>
        <h3>Integration puzzle</h3>
        <p>App tiles snap into one grid to show a connected product.</p>
      </div>
    </a>
  </div>
  <h3 id="timeline-examples" class="example-heading">Timeline examples</h3>
  <p class="example-lead">
    Finished films that ship with NodeTool. Open one in the timeline editor and
    change the scenes, text, and motion.
  </p>
  <div class="recipe-grid films">
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/serein/poster.webp" aria-label="Serein example film">
          <source src="https://nodetool.ai/timelines/serein/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Software launch film</span>
        <h3>Serein</h3>
        <p>An inbox becomes a product story through animated scenes, type, and interface details.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/kite/poster.webp" aria-label="Kite example film">
          <source src="https://nodetool.ai/timelines/kite/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">App motion graphics</span>
        <h3>Kite</h3>
        <p>A savings app with kinetic type, a growing chart, and an animated goal ring.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/tidewater/poster.webp" aria-label="Tidewater example film">
          <source src="https://nodetool.ai/timelines/tidewater/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Animated event poster</span>
        <h3>Tidewater</h3>
        <p>A jazz festival poster in motion, with layered inks, cut-paper shapes, and a swing score.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/cadence/poster.webp" aria-label="Cadence example film">
          <source src="https://nodetool.ai/timelines/cadence/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Vertical data story</span>
        <h3>Cadence</h3>
        <p>A bike-share year in review, with a route that rides itself, counting stats, and animated charts.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/prism/poster.webp" aria-label="Prism example film">
          <source src="https://nodetool.ai/timelines/prism/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Running-shoe campaign</span>
        <h3>Prism</h3>
        <p>A shoe launch built from product stills, colour trails, and orbiting type.</p>
      </div>
    </a>
    <a class="recipe-card" href="https://nodetool.ai/#example-timelines">
      <div class="media-frame">
        <video class="inview-video" muted loop playsinline preload="none"
          poster="https://nodetool.ai/timelines/voltra/poster.webp" aria-label="Voltra example film">
          <source src="https://nodetool.ai/timelines/voltra/film.mp4" type="video/mp4">
        </video>
      </div>
      <div class="recipe-body">
        <span class="usecase-tag">Motorcycle launch ad</span>
        <h3>Voltra</h3>
        <p>An electric motorcycle campaign with parallax, animated gauges, and a cut timed to the beat.</p>
      </div>
    </a>
  </div>
  <p class="section-note">
    <a href="https://nodetool.ai/ad-library">All ad recipes →</a> ·
    <a href="{{ '/video-editor' | relative_url }}">Video Editor →</a> ·
    <a href="{{ '/use-cases' | relative_url }}">Use-case walkthroughs →</a> ·
    <a href="{{ '/cookbook' | relative_url }}">Cookbook →</a>
  </p>
</section>

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
  <li><a href="{{ '/getting-started' | relative_url }}#1-install-and-connect">Connect a language, image, and video model.</a></li>
  <li><a href="{{ '/getting-started' | relative_url }}#2-say-what-you-want">Ask the agent for a storyboard, render it, and export the film.</a></li>
</ol>

## Find what you need

<div class="card-grid">
  <a class="doc-card" href="{{ '/getting-started' | relative_url }}"><strong>Get started</strong><span>Install NodeTool, connect a model, and make a first short film with the agent.</span></a>
  <a class="doc-card" href="{{ '/key-concepts' | relative_url }}"><strong>Core concepts</strong><span>Agents, nodes, workflows, assets, and how they fit together.</span></a>
  <a class="doc-card" href="{{ '/workflow-editor' | relative_url }}"><strong>Workflow editor</strong><span>Build, run, and debug node graphs on the canvas.</span></a>
  <a class="doc-card" href="{{ '/creative-agent' | relative_url }}"><strong>Creative editors</strong><span>Storyboards, timelines, sketches, 3D, games, and audio.</span></a>
  <a class="doc-card" href="{{ '/global-chat-agents' | relative_url }}"><strong>Chat and agents</strong><span>Chat, skills, memory, and the MCP server.</span></a>
  <a class="doc-card" href="{{ '/models-and-providers' | relative_url }}"><strong>Models and providers</strong><span>Local and cloud models, API keys, and costs.</span></a>
  <a class="doc-card" href="{{ '/nodes/' | relative_url }}"><strong>Node reference</strong><span>Every node, grouped by what it works with.</span></a>
  <a class="doc-card" href="{{ '/cookbook' | relative_url }}"><strong>Cookbook</strong><span>Worked patterns you can copy into your own projects.</span></a>
  <a class="doc-card" href="{{ '/mini-apps' | relative_url }}"><strong>Mini apps</strong><span>Turn a workflow into a small app other people can run.</span></a>
  <a class="doc-card" href="{{ '/deployment' | relative_url }}"><strong>Self-hosting</strong><span>Run NodeTool on your own server with Docker.</span></a>
  <a class="doc-card" href="{{ '/developer/' | relative_url }}"><strong>Developers</strong><span>Custom nodes, the TypeScript DSL, and the APIs.</span></a>
  <a class="doc-card" href="{{ '/troubleshooting' | relative_url }}"><strong>Help</strong><span>Error messages, fixes, FAQ, and keyboard shortcuts.</span></a>
</div>

<section class="home-section">
  <h2>Open source</h2>
  <p>
    AGPL-3.0. <a href="https://discord.gg/WmQTWZRcYE" target="_blank" rel="noopener">Discord</a> ·
    <a href="https://github.com/nodetool-ai/nodetool" target="_blank" rel="noopener">GitHub</a>.
  </p>
</section>
