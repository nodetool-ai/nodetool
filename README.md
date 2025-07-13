<h1>
  <img src="https://github.com/user-attachments/assets/dc2d5495-adc1-4a2a-a1b6-343f85083bc4" alt="NodeTool Logo" style="height:64px">NodeTool - Swiss-Army Knife for AI Builders
</h1>

**Drag, drop, build—one canvas for every model.**

🔓 **100% Open Source • Privacy-First • Self-Hosted**

![Conda](https://github.com/nodetool-ai/nodetool/actions/workflows/conda.yaml/badge.svg)
![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
[![Lint and Test](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml/badge.svg)](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml)
![Docker](https://github.com/nodetool-ai/nodetool/actions/workflows/docker-publish.yaml/badge.svg)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

NodeTool is the Swiss-Army Knife for AI builders. Unlike code-first stacks, NodeTool gives you every AI tool in one visual workspace. Connect your models, streamline your workflow, and turn ideas into reality.

## 🔧 Why NodeTool?

**🔗 Snap:** Drag any AI model into your canvas. Connect with one click.  
**☁️ Scale:** Keep data local, burst to cloud GPUs when you need power.  
**🚀 Ship:** Build working demos in minutes. Turn ideas into reality.

### 🔒 Privacy-First • Hybrid Execution

Unlike cloud-only tools, NodeTool protects your privacy while giving you the power to scale. **Trust through transparency**—every line of code is open source.

**Local-First:**
- Process sensitive data locally
- Run LLMs on your hardware  
- Zero data transmission by default

**Cloud-Ready:**
- Burst to GPU cloud in seconds
- Connect OpenAI, Anthropic, Fal, Replicate, Gemini
- Control exactly what data gets shared

---

![NodeTool](screenshot.png)

---

## ⚙️ Quickstart Installation

### 1️⃣ Get Running in Minutes

- **Windows / Mac / Linux:** [Download the installer here](https://nodetool.ai)
- Launch the installer and run NodeTool.

**Note:** Requires an Nvidia GPU or Apple Silicon (M1+) and at least 20GB of free disk space for model downloads.

### 2️⃣ Create Your First AI Workflow

- Open NodeTool.
- Choose a **prebuilt template** or start with a blank canvas.
- Drag and drop AI nodes and connect them visually.
- Click **Run** and watch your local AI workflow execute!

---

## ✨ Every Node You Need

NodeTool gives you every AI tool in one visual workspace:

### **🔗 Snap Nodes Together**
Drag any model into your canvas—LLMs, diffusion, agents, or custom code. Connect with one click and watch your AI workflow come alive.

### **☁️ Scale to GPU Cloud**
Keep data local until you need power. Burst to cloud GPUs in seconds without rebuilding your workflow.

### **💬 Chat Interface**
Access and trigger AI workflows through a unified chat interface.

### **🤖 AI Agent Orchestration**
Build intelligent agents that coordinate multiple AI models. Chain reasoning, planning, and execution across complex multi-step workflows.

### **📁 Vector Storage & RAG**
Built-in ChromaDB means your AI remembers everything. Create smart assistants that know your documents.

### **🎯 Built-in Asset Manager**
Import, organize, and manage all your media assets in one place. No more hunting through folders.

**Additional Features:**
- **Multimodal Capabilities:** Process text, images, audio, and video within a single workflow
- **System Tray Integration:** Access workflows quickly via the system tray with global shortcuts
- **Ready-to-Use Templates:** Start quickly with pre-built workflow templates
- **Mini-App Builder:** Convert workflows into standalone desktop applications
- **API Access:** Integrate with external applications and services
- **Custom Python Extensions:** Extend functionality with custom Python scripts
- **Cross-Platform:** Build and run on Mac, Windows, and Linux

## 🤖 NodeTool Agent System

Design sophisticated AI agents capable of handling complex, multi-step tasks using NodeTool's agent framework.

**Core Capabilities:**

- **Strategic Task Planning:** Automatically break down complex objectives into structured, executable plans.
- **Chain of Thought Reasoning:** Enable agents to perform step-by-step problem solving with explicit reasoning paths.
- **Tool Integration:** Equip agents with tools for web browsing, file operations, API calls, and more.
- **Streaming Results:** Get live updates as agents reason and execute tasks.

### Ready-to-Use Agent Examples

NodeTool includes several pre-built agent examples:

- **Wikipedia-Style Research Agent:** Generates structured documentation via web research.
- **ChromaDB Research Agent:** Processes and indexes documents for semantic querying.
- **Social Media Analysis Agents:** Tracks and analyzes content from Twitter/X, Instagram, and Reddit.
- **Professional Research Tools:** Analyzes the LinkedIn job market and performs advanced Google searches.
- **Utility Agents:** Processes emails and integrates web search capabilities.

Find full implementations and more examples in the [examples directory](https://github.com/nodetool-ai/nodetool-core/tree/main/examples) of the `nodetool-core` repository.

## 🎯 Build Anything

From simple automations to complex multi-agent systems:

### **🧠 Build Smart Assistants**
Create AI that knows your documents, emails, and notes. Keep everything private on your machine.

### **⚡ Automate Boring Tasks**
Turn repetitive work into smart workflows. Let AI handle the routine while you focus on creating.

### **🎨 Generate Creative Content**
From text to images to music — create anything with AI. Combine models for unique results.

### **📸 Enhance Images & Video**
Upscale, enhance, and transform visual content. Professional results with consumer hardware.

### **🎵 Process Voice & Audio**
Transcribe, analyze, and generate speech. Build voice-first applications that actually work.

### **📊 Analyze Data Visually**
Turn spreadsheets into insights. Create charts, find patterns, and make decisions faster.

### **🔗 Connect Multiple Models**
Chain LLMs with diffusion models. Create workflows that no single AI can handle alone.

### **🚀 Deploy Anywhere**
From desktop shortcuts to web APIs. Your workflows run where your users are. *(Coming soon)*

### **🛠️ Extend with Code**
Add custom Python nodes when you need them. The visual canvas grows with your expertise.

### **🔍 Monitor & Debug**
See exactly what your AI is thinking. Debug workflows with clear visual feedback.

### **🤝 Share & Collaborate**
Export workflows as code or templates. Build on what others have created. *(Coming soon)*

## 💡 Join Our Community

Connect with other NodeTool users and the development team:

- 🌟 **Star us on GitHub:** [github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
- 💬 **Join the Discussion:** [Discord Community](https://discord.gg/26m5xBwe)
- 🚀 **Contribute:** Help shape the future of local-first AI. See [Contributing](#contributing-) below.

Let's build amazing AI workflows together! ✨

## 🚀 Quickstart (Release Info)

Release 0.6 is in pre-release.

## 🛠️ Development Setup

Follow these steps to set up a local development environment for the entire NodeTool platform, including the UI, backend services, and the core library (`nodetool-core`). If you are primarily interested in contributing to the core library itself, please also refer to the [nodetool-core repository](https://github.com/nodetool-ai/nodetool-core) for its specific development setup using Poetry.

### Prerequisites

- **Python 3.11:** Required for the backend.
- **Conda:** Download and install from [miniconda.org](https://docs.conda.io/en/latest/miniconda.html).
- **Node.js (Latest LTS):** Required for the frontend. Download and install from [nodejs.org](https://nodejs.org/en).

### 1. Set Up Conda Environment

```bash
# Create and activate the Conda environment
conda create -n nodetool python=3.11 -y
conda activate nodetool

# Install essential system dependencies via Conda
conda install -c conda-forge ffmpeg cairo x264 x265 aom libopus libvorbis lame pandoc uv -y
```

### 2. Install Core Python Dependencies

These are the essential packages to run NodeTool.

```bash
# Install nodetool-core and nodetool-base
# On macOS / Linux / Windows:
pip install git+https://github.com/nodetool-ai/nodetool-core
pip install git+https://github.com/nodetool-ai/nodetool-base
```

### 3. Install Optional Node Packs (As Needed)

NodeTool's functionality is extended via packs. Install only the ones you need.

```bash
# List available packs (optional)
nodetool package list -a

# Example: Install packs for specific integrations
pip install git+https://github.com/nodetool-ai/nodetool-huggingface --extra-index-url https://download.pytorch.org/whl/cu121 # For HuggingFace models (PyTorch/CUDA)
# ... install other packs like replicate, fal, elevenlabs, etc.
# ... add other relevant packs here
```

_Note:_ Some packs like `nodetool-huggingface` may require specific PyTorch versions or CUDA drivers. Use the `--extra-index-url` when necessary.

### 4. Configure Environment Variables

Create a `.env` file inside the `web` directory (you can copy `web/.env.example` as a starting point). Set the following variables to match your deployment:

```bash
VITE_API_URL=http://localhost:8000            # URL of the NodeTool API server
VITE_SUPABASE_URL=https://your-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

These variables are loaded by Vite at build time and allow you to point the UI at a different backend or Supabase project without changing the source code.

### 5. Run NodeTool Backend & Web UI

Ensure the `nodetool` Conda environment is active.

**Option A: Run Backend with Web UI (for Development)**

This command starts the backend server and serves the web UI directly with hot reloading enabled.

```bash
# On macOS / Linux / Windows:
nodetool serve
```

Access the UI in your browser at `http://localhost:3000`.

**Option B: Run with Electron App**

This provides the full desktop application experience.

**Configure Conda Path:**
Ensure your `settings.yaml` file points to your Conda environment path:

- macOS/Linux: `~/.config/nodetool/settings.yaml`
- Windows: `%APPDATA%/nodetool/settings.yaml`

```yaml
CONDA_ENV: /path/to/your/conda/envs/nodetool # e.g., /Users/me/miniconda3/envs/nodetool
```

**Build Frontends:**
You only need to do this once or when frontend code changes.

```bash
# Build the main web UI
cd web
npm install
npm run build
cd ..

# Build the apps UI (if needed)
cd apps
npm install
npm run build
cd ..

# Build the Electron UI
cd electron
npm install
npm run build
cd ..
```

**Start Electron:**

```bash
cd electron
npm start  # launches the desktop app using the previously built UI
```

The Electron app will launch, automatically starting the backend and frontend.

## 🤝 Contributing

We welcome community contributions!

1.  **Fork** the repository on GitHub.
2.  Create a **new branch** for your feature (`git checkout -b feature/your-feature-name`).
3.  Make your changes and **commit** them (`git commit -am 'Add some amazing feature'`).
4.  **Push** your branch to your fork (`git push origin feature/your-feature-name`).
5.  Open a **Pull Request** against the `main` branch of the original repository.

Please follow our contribution guidelines and code of conduct.

## 📄 License

AGPL

## 📬 Get in Touch

We'd love to hear from you! Whether you have questions, suggestions, or feedback, feel free to reach out through any of the following channels:

- **NodeTool Platform Repository:** [github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
- **NodeTool Core Library Repository:** [github.com/nodetool-ai/nodetool-core](https://github.com/nodetool-ai/nodetool-core)
- **Email:** [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Discord Community:** [Join us on Discord](https://discord.gg/26m5xBwe)
- **Community Forum:** [Visit the NodeTool Forum](https://forum.nodetool.ai)
- **GitHub Issues:** [Report issues or request features](https://github.com/nodetool-ai/nodetool/issues)
- **Project Leads:** Matthias Georgi ([matti@nodetool.ai](mailto:matti@nodetool.ai)), David Bührer ([david@nodetool.ai](mailto:david@nodetool.ai))

We're excited to collaborate and build amazing AI workflows together! 🚀✨

## 📦 NodeTool Packs Registry

Extend NodeTool's capabilities with specialized **Node Packs**. The [NodeTool Packs Registry](https://github.com/nodetool-ai/nodetool-registry) manages discovery, installation, and distribution.

### Using Packs (For Users)

Manage packs easily through the **NodeTool UI**:

- Browse available packs.
- Install, uninstall, and update packs (uses `pip` behind the scenes).
- View pack details and documentation.

Alternatively, install directly via `pip` (see [Development Setup](#3-install-optional-node-packs-as-needed)).

Refer to the [NodeTool Registry repository](https://github.com/nodetool-ai/nodetool-registry) for detailed guidelines on creating and publishing packs.

## 📚 Documentation

The documentation site is built with Jekyll on GitHub Pages. Markdown files live in the `docs/` directory and changes on `main` are deployed automatically. Start with the [Getting Started](docs/getting-started.md) guide and browse our new [Tips and Tricks](docs/tips-and-tricks.md) section for handy workflow shortcuts.
