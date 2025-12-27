---
layout: home
---

<section class="home-hero">
  <p class="eyebrow">Open-Source Local-First AI Workflow Builder</p>
  <h1>Build AI Workflows. Visually. Locally.</h1>
  <p class="lead">
   Drag, drop, and connect powerful AI models. Run them locally on your machine or use your own API keys with any provider. Your workflows, your data—always under your control.
  </p>
  <div class="cta-row">
    <a href="{{ '/' | relative_url }}#start-here" class="cta-button primary">Start Here</a>
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button">Getting Started</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

<a id="start-here"></a>

## Start Here

NodeTool is the **local-first canvas for building AI workflows**—connect text, audio, video, and automation nodes visually, then run them locally or deploy the exact same graph to RunPod, Cloud Run, or your own servers.

### Who uses NodeTool?

<div class="persona-grid">
  <article class="persona-tile">
    <h4>Agent Builders</h4>
    <p>Design multi-step LLM agents that reason, call tools, and stream progress.</p>
    <ul>
      <li>Planning + execution in one workflow</li>
      <li>Preview nodes to debug intermediate steps</li>
      <li>Trigger runs from Global Chat or CLI</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Knowledge & RAG Teams</h4>
    <p>Index private corpora, run hybrid search, and ground every answer in sources.</p>
    <ul>
      <li>Document ingestion + retrieval on one canvas</li>
      <li>Built-in ChromaDB collections</li>
      <li>Automations via Mini-Apps or APIs</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Multimodal Makers</h4>
    <p>Prototype creative pipelines mixing audio, vision, video, and structured tools.</p>
    <ul>
      <li>Mix local diffusion with hosted APIs</li>
      <li>Scriptable data prep & charting nodes</li>
      <li>Deployable without rewriting code</li>
    </ul>
  </article>
</div>

### What you can build right away

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>LLM Agents with Tool Access</h5>
    <p>Plan, call tools, and summarize results with streaming progress updates.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-2-agent-driven-generation">Agent pattern →</a>
    <a href="workflows/realtime-agent.md">Realtime Agent example →</a>
  </article>
  <article class="pattern-card">
    <h5>Retrieval-Augmented Generation</h5>
    <p>Ingest PDFs, chunk text, and answer questions grounded in citations.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-4-rag-retrieval-augmented-generation">RAG pattern →</a>
    <a href="workflows/chat-with-docs.md">Chat with Docs example →</a>
  </article>
  <article class="pattern-card">
    <h5>Audio + Video Pipelines</h5>
    <p>Transcribe meetings, remove silence, add subtitles, or narrate generated imagery.</p>
    <a href="workflows/transcribe-audio.md">Transcribe Audio example →</a>
    <a href="workflows/story-to-video-generator.md">Story to Video example →</a>
  </article>
  <article class="pattern-card">
    <h5>Data Automation & Visualization</h5>
    <p>Fetch data, transform it with AI nodes, and publish dashboards or reports.</p>
    <a href="workflows/data-visualization-pipeline.md">Data Viz pipeline →</a>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-10-data-processing-pipeline">Data processing pattern →</a>
  </article>
</div>

### Your first 10 minutes

<ol class="step-sequence">
  <li><a href="installation.md">Download NodeTool</a> — install the desktop app for macOS, Windows, or Linux.</li>
  <li><a href="getting-started.md#step-1--install-nodetool">Launch and pick models</a> — install GPT-OSS + Flux in Model Manager for fast local runs.</li>
  <li><a href="getting-started.md#step-2--run-a-beginner-workflow-end-to-end">Open the Creative Story Ideas template</a> — inspect nodes, press Run, and watch Preview stream results.</li>
  <li><a href="getting-started.md#step-3--save-and-re-run-it-from-global-chat">Save & run from Global Chat</a> — trigger the workflow directly from a chat thread.</li>
  <li><a href="getting-started.md#step-4--turn-it-into-a-mini-app">Publish as a Mini-App</a> — hand teammates a form UI powered by the same workflow.</li>
</ol>

### Choose your path

- **I'm new to NodeTool:** [Getting Started](getting-started.md), [Workflow Editor](workflow-editor.md), [Tips & Tricks](tips-and-tricks.md), [Example gallery](/workflows/).
- **I'm evaluating NodeTool:** [Value Proposition Review](value-proposition-review.md), [How NodeTool Compares](comparisons.md), [Cost Analysis](cost-analysis.md).
- **I deploy NodeTool:** [Deployment Guide](deployment.md), [Self-Hosted Deployment](self_hosted.md), [Proxy Reference](proxy.md), [Security Hardening](security-hardening.md), [Terminal WebSocket](terminal-websocket.md), [Storage](storage.md).
- **I build or integrate:** [Developer Guide](developer/index.md), [Workflow API](workflow-api.md), [Chat Module](chat.md) + [Chat API](chat-api.md), [CLI Reference](cli.md), [Architecture](architecture.md).
- **Reference shortcuts:** [Cookbook Patterns]({{ '/cookbook/patterns' | relative_url }}), [Glossary](glossary.md), [Indexing](indexing.md), [Asset Management](asset-management.md), [Node Packs](node-packs.md), [Troubleshooting](troubleshooting.md).

### Local-first or cloud-augmented

<div class="mode-split">
  <article class="mode-card">
    <h4>Local-only mode</h4>
    <p>All workflows, assets, and models execute on your machine for maximum privacy.</p>
    <ul>
      <li>Use MLX, llama.cpp, Whisper, and Flux locally</li>
      <li>Store assets on disk or Supabase buckets you control</li>
      <li>Disable outbound traffic entirely if needed</li>
    </ul>
    <a href="storage.md">Storage guide →</a>
  </article>
  <article class="mode-card">
    <h4>Cloud-augmented mode</h4>
    <p>Mix local nodes with OpenAI, Anthropic, or RunPod workers when you need extra capacity.</p>
    <ul>
      <li>Configure API keys in <em>Settings → Providers</em></li>
      <li>Deploy the same workflow to RunPod or Cloud Run</li>
      <li>Automate runs through the Workflow API or chat APIs</li>
    </ul>
    <a href="models-and-providers.md">Models & Providers overview →</a>
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
    <pre>
┌──────────────────────────────────────────────────────────────────────────┐
│                        YOUR PERSONAL AI STACK                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   📱 NodeTool Mobile                                                     │
│       │                                                                  │
│       │ (Secure Connection)                                              │
│       ▼                                                                  │
│   🔒 VPN / Tailscale / WireGuard                                        │
│       │                                                                  │
│       │ (Encrypted Tunnel to Your Network)                               │
│       ▼                                                                  │
│   🖥️  NodeTool Server (Your Hardware)                                    │
│       │                                                                  │
│       ├─────────────────┬────────────────┬─────────────────┐            │
│       ▼                 ▼                ▼                 ▼            │
│   🧠 Local LLMs     📁 Your Data     🎨 Creative AI    🔌 Integrations │
│   Llama, Mistral    Documents         Flux, Whisper    APIs, Tools     │
│   Qwen, Phi         Photos, Notes     Music, Video     Home Automation │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
    </pre>
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
      <h3>🔒 Privacy-first by design</h3>
      <p>Run LLMs, Whisper, and diffusion models entirely on your infrastructure without sending data to third parties. Meet GDPR, HIPAA, or SOC 2 requirements with local execution. Opt into cloud APIs only when you choose—never by default.</p>
    </article>
    <article class="feature-card">
      <h3>🎯 Build once, run everywhere</h3>
      <p>Design workflows in the visual editor, then run them from Global Chat, Mini-Apps, CLI, or REST API—all backed by the same JSON graph. Deploy from your laptop to RunPod or Cloud Run with a single command. No code changes. No vendor lock-in.</p>
    </article>
    <article class="feature-card">
      <h3>👁️ Transparent & debuggable</h3>
      <p>See every step of your AI pipeline in real-time. Inspect intermediate outputs with Preview nodes. Understand exactly what each node does—no black-box mystery. Streaming execution shows progress as it happens, not after it's done.</p>
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
