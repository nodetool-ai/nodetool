---
layout: home
---

<section class="home-hero">
  <p class="eyebrow">Open-Source Visual AI Workflow Builder</p>
  <h1>Build AI Workflows Visually</h1>
  <p class="lead">
   Connect nodes to generate content, analyze data, and automate tasks. Run models locally or via cloud APIs.
  </p>
  <img src="{{ '/assets/home.jpg' | relative_url }}" alt="NodeTool visual workflow editor" class="home-screenshot">
  <div class="cta-row">
    <a href="{{ '/' | relative_url }}#start-here" class="cta-button primary">Start Here</a>
    <a href="{{ '/getting-started' | relative_url }}" class="cta-button">Getting Started</a>
    <a href="{{ '/cookbook' | relative_url }}" class="cta-button ghost">Cookbook</a>
  </div>
</section>

<a id="start-here"></a>

## Start Here

NodeTool is a visual workflow builder for AI pipelines—connect nodes for images, video, text, data, and automation. Run locally or deploy to RunPod, Cloud Run, or self-hosted servers.

### Who uses NodeTool?

<div class="persona-grid">
  <article class="persona-tile">
    <h4>Creators & Designers</h4>
    <p>Generate and transform media with AI.</p>
    <ul>
      <li>Use Flux, Qwen Image, and custom models</li>
      <li>Generate variations</li>
      <li>Build reusable workflows</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Developers & Researchers</h4>
    <p>Build agents, RAG systems, and pipelines.</p>
    <ul>
      <li>Design multi-step LLM agents</li>
      <li>Index and query documents locally</li>
      <li>Deploy workflows as APIs</li>
    </ul>
  </article>
  <article class="persona-tile">
    <h4>Data & Business Users</h4>
    <p>Process documents and automate tasks without coding.</p>
    <ul>
      <li>Process data with AI pipelines</li>
      <li>Automate document workflows</li>
      <li>Build custom tools</li>
    </ul>
  </article>
</div>

### What you can build right away

<div class="pattern-grid">
  <article class="pattern-card">
    <h5>AI Agents & Automation</h5>
    <p>Build multi-step agents that plan and execute tasks.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-2-agent-driven-generation">Agent patterns →</a>
    <a href="{{ '/workflows/realtime-agent' | relative_url }}">Realtime Agent →</a>
  </article>
  <article class="pattern-card">
    <h5>Document Intelligence & RAG</h5>
    <p>Index documents, search with AI, and answer questions from sources.</p>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-4-rag-retrieval-augmented-generation">RAG pattern →</a>
    <a href="{{ '/workflows/chat-with-docs' | relative_url }}">Chat with Docs →</a>
  </article>
  <article class="pattern-card">
    <h5>Image & Video Creation</h5>
    <p>Generate and transform media with AI models.</p>
    <a href="{{ '/workflows/movie-posters' | relative_url }}">Movie Posters →</a>
    <a href="{{ '/workflows/story-to-video-generator' | relative_url }}">Story to Video →</a>
  </article>
  <article class="pattern-card">
    <h5>Data Processing & Analysis</h5>
    <p>Transform data, extract information, and automate reports.</p>
    <a href="{{ '/workflows/data-visualization-pipeline' | relative_url }}">Data Visualization →</a>
    <a href="{{ '/cookbook/patterns' | relative_url }}#pattern-10-data-processing-pipeline">Data patterns →</a>
  </article>
</div>

### Your first 10 minutes

<ol class="step-sequence">
  <li><a href="{{ '/installation' | relative_url }}">Download NodeTool</a> — install for macOS, Windows, or Linux.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-1--install-nodetool">Choose your AI models</a> — install local models like Flux or Qwen Image, or use cloud services.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-2--run-a-beginner-workflow-end-to-end">Try a template workflow</a> — explore examples, press Run, watch results stream.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-3--save-and-re-run-it-from-global-chat">Experiment and customize</a> — change inputs, connect nodes differently, make it yours.</li>
  <li><a href="{{ '/getting-started' | relative_url }}#step-4--turn-it-into-a-mini-app">Share your workflow</a> — turn it into a simple app others can use.</li>
</ol>

### Choose your path

- **I'm new to NodeTool:** [Getting Started]({{ '/getting-started' | relative_url }}), [Workflow Editor]({{ '/workflow-editor' | relative_url }}), [Hardware Requirements]({{ '/installation#hardware-requirements-by-task' | relative_url }}), [Example Gallery]({{ '/workflows/' | relative_url }}).
- **I want to explore:** [Example Workflows]({{ '/workflows/' | relative_url }}), [Workflow Patterns]({{ '/cookbook' | relative_url }}), [Community](https://discord.gg/WmQTWZRcYE).
- **I need AI models:** [Models & Providers]({{ '/models-and-providers' | relative_url }}), [HuggingFace Integration]({{ '/huggingface' | relative_url }}), [Local vs Cloud]({{ '/models' | relative_url }}).
- **I'm coming from another tool:** [How NodeTool Compares]({{ '/comparisons' | relative_url }}), [ComfyUI Migration]({{ '/comparisons#from-comfyui-to-nodetool' | relative_url }}), [n8n Migration]({{ '/comparisons#from-n8n-to-nodetool' | relative_url }}).
- **I'm ready to deploy:** [Deployment Guide]({{ '/deployment' | relative_url }}), [Self-Hosted Setup]({{ '/self_hosted' | relative_url }}), [API Access]({{ '/api-reference#headless-mode-running-workflows-via-cliapi' | relative_url }}), [Configuration]({{ '/configuration' | relative_url }}).
- **I'm a developer:** [Developer Guide]({{ '/developer/' | relative_url }}), [Custom Nodes]({{ '/developer/node-reference' | relative_url }}), [CLI Reference]({{ '/cli' | relative_url }}), [API Reference]({{ '/api-reference' | relative_url }}).
- **Reference & Help:** [Workflow Debugging]({{ '/workflow-debugging' | relative_url }}), [Troubleshooting]({{ '/troubleshooting' | relative_url }}), [Glossary]({{ '/glossary' | relative_url }}), [Node Library]({{ '/node-packs' | relative_url }}).

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
    <a href="{{ '/storage' | relative_url }}">Storage options →</a>
  </article>
  <article class="mode-card">
    <h4>Cloud-augmented mode</h4>
    <p>Mix local AI with cloud services for flexibility. Use the best tool for each task.</p>
    <ul>
      <li>Add API keys for OpenAI, Anthropic, Replicate</li>
      <li>Access the latest cloud models on demand</li>
      <li>Deploy workflows to cloud infrastructure</li>
    </ul>
    <a href="{{ '/models-and-providers' | relative_url }}">Models & Providers →</a>
  </article>
</div>

<section class="home-section">
  <h2>Key Features</h2>
  <div class="feature-grid">
    <article class="feature-card">
      <h3>🎯 Visual Editor</h3>
      <p>Build workflows by connecting nodes. No coding required. View the entire pipeline on one canvas.</p>
    </article>
    <article class="feature-card">
      <h3>👁️ Real-time Debugging</h3>
      <p>See every step execute in real-time. Inspect intermediate outputs. Streaming execution shows progress as it happens.</p>
    </article>
    <article class="feature-card">
      <h3>🔒 Local Execution</h3>
      <p>Run LLMs, Whisper, and diffusion models on your infrastructure. Cloud APIs are opt-in.</p>
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
    <li><a href="{{ '/cli' | relative_url }}">CLI reference →</a></li>
    <li><a href="{{ '/api-reference' | relative_url }}">API reference →</a></li>
    <li><a href="{{ '/configuration' | relative_url }}">Configuration →</a></li>
    <li><a href="{{ '/deployment' | relative_url }}">Deploy to RunPod / Cloud Run →</a></li>
    <li><a href="{{ '/architecture' | relative_url }}">Architecture →</a></li>
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
