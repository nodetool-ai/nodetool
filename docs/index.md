---
layout: home
---

<section class="home-hero">
  <p class="eyebrow">Open-Source Visual AI Workflow Builder</p>
  <h1>Build AI Workflows. Visually. Effortlessly.</h1>
  <p class="lead">
   Connect AI building blocks to generate content, analyze data, and automate tasks. Use models on your machine or in the cloud. Your workflows, your data—always under your control.
  </p>
  <div class="cta-row">
    <a href="{{ '/' | relative_url }}#start-here" class="cta-button primary">Start Here</a>
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button">Getting Started</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

<a id="start-here"></a>

## Start Here

NodeTool is your **visual canvas for building AI workflows**—connect nodes for images, video, text, data, and automation, then run them locally or deploy to RunPod, Cloud Run, or your own servers.

### Who uses NodeTool?

<div class="persona-grid">
  <article class="persona-tile">
    <h4>Creators & Designers</h4>
    <p>Generate art, transform media, and build unique visual pipelines with AI.</p>
    <ul>
      <li>Mix Flux, SDXL, and custom models</li>
      <li>Create unlimited variations</li>
      <li>Build signature creative workflows</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Developers & Researchers</h4>
    <p>Build AI agents, RAG systems, and automated pipelines with full transparency.</p>
    <ul>
      <li>Design multi-step LLM agents</li>
      <li>Index and query documents locally</li>
      <li>Deploy workflows as APIs</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Data & Business Users</h4>
    <p>Analyze documents, automate tasks, and extract insights without coding.</p>
    <ul>
      <li>Process data with AI pipelines</li>
      <li>Automate document workflows</li>
      <li>Build custom business tools</li>
    </ul>
  </article>
</div>

### What you can build right away

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>AI Agents & Automation</h5>
    <p>Build multi-step agents that plan, execute, and adapt. Automate complex workflows with AI reasoning.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-2-agent-driven-generation">Agent patterns →</a>
    <a href="workflows/realtime-agent.md">Realtime Agent →</a>
  </article>
  <article class="pattern-card">
    <h5>Document Intelligence & RAG</h5>
    <p>Index documents, search with AI, and answer questions grounded in your sources.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-4-rag-retrieval-augmented-generation">RAG pattern →</a>
    <a href="workflows/chat-with-docs.md">Chat with Docs →</a>
  </article>
  <article class="pattern-card">
    <h5>Image & Video Creation</h5>
    <p>Generate visuals, transform media, and build creative pipelines with AI models.</p>
    <a href="workflows/movie-posters.md">Movie Posters →</a>
    <a href="workflows/story-to-video-generator.md">Story to Video →</a>
  </article>
  <article class="pattern-card">
    <h5>Data Processing & Analysis</h5>
    <p>Transform data, extract insights, and automate reports with AI-powered workflows.</p>
    <a href="workflows/data-visualization-pipeline.md">Data Visualization →</a>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-10-data-processing-pipeline">Data patterns →</a>
  </article>
</div>

### Your first 10 minutes

<ol class="step-sequence">
  <li><a href="installation.md">Download NodeTool</a> — install for macOS, Windows, or Linux.</li>
  <li><a href="getting-started.md#step-1--install-nodetool">Choose your AI models</a> — install local models like Flux/SDXL, or use cloud services.</li>
  <li><a href="getting-started.md#step-2--run-a-beginner-workflow-end-to-end">Try a template workflow</a> — explore examples, press Run, watch results stream.</li>
  <li><a href="getting-started.md#step-3--save-and-re-run-it-from-global-chat">Experiment and customize</a> — change inputs, connect nodes differently, make it yours.</li>
  <li><a href="getting-started.md#step-4--turn-it-into-a-mini-app">Share your workflow</a> — turn it into a simple app others can use.</li>
</ol>

### Choose your path

- **I'm new to NodeTool:** [Getting Started](getting-started.md), [Workflow Editor](workflow-editor.md), [Tips & Tricks](tips-and-tricks.md), [Example Gallery](/workflows/).
- **I want to explore:** [Example Workflows](/workflows/), [Workflow Patterns](cookbook.md), [Community](https://discord.gg/WmQTWZRcYE).
- **I need AI models:** [Models & Providers](models-and-providers.md), [HuggingFace Integration](huggingface.md), [Local vs Cloud](models.md).
- **I'm ready to deploy:** [Deployment Guide](deployment.md), [Self-Hosted Setup](self_hosted.md), [API Access](workflow-api.md).
- **Reference & Help:** [Node Library](node-packs.md), [Glossary](glossary.md), [Troubleshooting](troubleshooting.md), [Asset Management](asset-management.md).

### Local-first or cloud-augmented

<div class="mode-split">
  <article class="mode-card">
    <h4>Local-only mode</h4>
    <p>All workflows, assets, and models run on your machine for maximum privacy and control.</p>
    <ul>
      <li>Use MLX, llama.cpp, Whisper, and Flux locally</li>
      <li>Store assets on disk or your own storage</li>
      <li>Work offline once models are downloaded</li>
    </ul>
    <a href="storage.md">Storage options →</a>
  </article>
  <article class="mode-card">
    <h4>Cloud-augmented mode</h4>
    <p>Mix local AI with cloud services for flexibility. Use the best tool for each task.</p>
    <ul>
      <li>Add API keys for OpenAI, Anthropic, Replicate</li>
      <li>Access cutting-edge models on demand</li>
      <li>Deploy workflows to cloud infrastructure</li>
    </ul>
    <a href="models-and-providers.md">Models & Providers →</a>
  </article>
</div>

<section class="home-section">
  <h2 id="personal-ai-stack">📱 Your Personal AI Stack</h2>
  <p class="lead">
    <strong>The future of AI isn't in the cloud—it's in your pocket, connected to your own infrastructure.</strong>
  </p>
  <p>
    NodeTool's mobile app transforms your phone into a portal to your personal AI universe. Run AI workflows from anywhere in the world, accessing models and data hosted on hardware you control. Your AI assistant, your creative tools, your knowledge base—always available, always private.
  </p>

  <div class="architecture-diagram">
    {% mermaid %}
    flowchart TB
      Mobile["📱 NodeTool Mobile"] --> |Secure Connection| VPN
      VPN["🔒 VPN / Tailscale / WireGuard"] --> |Encrypted Tunnel| Server
      Server["🖥️ NodeTool Server<br/>(Your Hardware)"]

      subgraph Stack["Your AI Stack"]
        direction TB
        LLMs["🧠 Local LLMs<br/>Llama, Mistral, Qwen, Phi"]
        Data["📁 Your Data<br/>Documents, Photos, Notes"]
        Creative["🎨 Creative AI<br/>Flux, Whisper, Music, Video"]
        Integrations["🔌 Integrations<br/>APIs, Tools, Home Automation"]
      end

      Server --> Stack
    {% endmermaid %}
  </div>

  <h3>Choose Your Architecture</h3>
  <div class="pattern-grid">
    <article class="pattern-card">
      <h5>🏠 Fully Local Stack</h5>
      <p><strong>Maximum privacy.</strong> Your mobile device connects through VPN to your home server. All AI processing happens on your hardware. Your documents, photos, and conversations never leave your network.</p>
      <p><code>[Mobile] → [VPN] → [Home Server] → [Local LLMs + Your Data]</code></p>
      <p><em>Perfect for: Privacy advocates, sensitive work, air-gapped environments</em></p>
    </article>
    <article class="pattern-card">
      <h5>☁️ NodeTool Cloud</h5>
      <p><strong>Zero configuration.</strong> Connect to NodeTool's managed infrastructure. Get started in minutes with no hardware to manage. Your workflows sync across devices automatically.</p>
      <p><code>[Mobile] → [NodeTool Cloud] → [Managed LLMs + Encrypted Storage]</code></p>
      <p><em>Perfect for: Quick start, teams, users without dedicated hardware</em></p>
    </article>
    <article class="pattern-card">
      <h5>🏢 Private Cloud</h5>
      <p><strong>Enterprise control.</strong> Deploy NodeTool to your organization's cloud VPC. Meet compliance requirements while enabling mobile access for your entire team.</p>
      <p><code>[Mobile] → [VPN] → [Your VPC] → [Self-Hosted NodeTool + Private Data]</code></p>
      <p><em>Perfect for: Enterprises, regulated industries, multi-user deployments</em></p>
    </article>
    <article class="pattern-card">
      <h5>🌐 Hybrid Stack</h5>
      <p><strong>Best of both worlds.</strong> Run sensitive workflows locally while tapping into cloud APIs for cutting-edge models. You control which data stays local and which goes to the cloud.</p>
      <p><code>[Mobile] → [Local Server] → [Local LLMs + Cloud APIs when needed]</code></p>
      <p><em>Perfect for: Power users who want flexibility and the latest models</em></p>
    </article>
  </div>

  <h3>What This Enables</h3>
  <ul>
    <li><strong>Your Personal AI Assistant</strong> — Chat with an AI that has access to your documents, notes, and knowledge base. Unlike cloud assistants, this one runs on your hardware and keeps your data private.</li>
    <li><strong>Mobile Creative Studio</strong> — Generate images, music, and video from your phone using Flux, Whisper, and other models running on your home GPU. No subscriptions, no rate limits.</li>
    <li><strong>Private Knowledge Base</strong> — Index your PDFs, notes, and research papers. Query them with RAG from anywhere. Your intellectual property never touches third-party servers.</li>
    <li><strong>Home Automation AI</strong> — Connect NodeTool to your smart home. Voice-controlled workflows that understand context and execute across your devices.</li>
    <li><strong>Secure Team Collaboration</strong> — Share workflows with your team while keeping data in your private cloud. Everyone gets AI superpowers without compromising security.</li>
  </ul>

  <div class="cta-row">
    <a href="getting-started.md" class="cta-button primary">Get Started →</a>
    <a href="self_hosted.md" class="cta-button">Self-Hosted Setup →</a>
    <a href="deployment.md" class="cta-button ghost">Deployment Guide →</a>
  </div>
</section>

<section class="home-section">
  <h2>Why teams choose NodeTool</h2>
  <div class="feature-grid">
    <article class="feature-card">
      <h3>🎯 Visual & Accessible</h3>
      <p>Build AI workflows without coding. Drag-and-drop interface makes complex AI pipelines approachable for everyone—from developers to business users to creators. See your entire workflow on one canvas.</p>
    </article>
    <article class="feature-card">
      <h3>👁️ Transparent & Debuggable</h3>
      <p>See every step of your AI pipeline in real-time. Inspect intermediate outputs, understand what's happening, and debug with confidence. No black-box mystery—streaming execution shows progress as it happens.</p>
    </article>
    <article class="feature-card">
      <h3>🔒 Privacy-first by design</h3>
      <p>Run LLMs, Whisper, and diffusion models entirely on your infrastructure. Keep sensitive data private with local execution. Opt into cloud APIs only when you choose—never by default.</p>
    </article>
  </div>
</section>

<section class="home-section">
  <h2>Popular destinations</h2>
  <ul class="link-grid">
    <li><a href="{{ '/' | relative_url }}#start-here">Orientation →</a></li>
    <li><a href="{{ '/getting-started' | relative_url }}">Install & first workflow →</a></li>
    <li><a href="{{ '/' | relative_url }}#personal-ai-stack">📱 Personal AI Stack →</a></li>
    <li><a href="{{ '/key-concepts' | relative_url }}">Core concepts →</a></li>
    <li><a href="{{ '/user-interface' | relative_url }}">UI overview →</a></li>
    <li><a href="{{ '/workflows/' | relative_url }}">Example gallery →</a></li>
    <li><a href="{{ '/cookbook' | relative_url }}">Workflow cookbook →</a></li>
    <li><a href="{{ '/models-and-providers' | relative_url }}">Models & providers →</a></li>
    <li><a href="{{ '/huggingface' | relative_url }}">HuggingFace integration →</a></li>
    <li><a href="{{ '/global-chat-agents' | relative_url }}">Global Chat & agents →</a></li>
    <li><a href="{{ '/deployment' | relative_url }}">Deploy to RunPod / Cloud Run →</a></li>
    <li><a href="{{ '/developer/' | relative_url }}">Developer guide →</a></li>
  </ul>
</section>

<section class="home-section">
  <h2>Build with the community</h2>
  <p>
    NodeTool is open-source under AGPL-3.0. Join the <a href="https://discord.gg/WmQTWZRcYE" target="_blank" rel="noopener">Discord</a>,
    explore the <a href="https://github.com/nodetool-ai/nodetool" target="_blank" rel="noopener">GitHub repo</a>,
    and share workflows with other builders.
  </p>
</section>
