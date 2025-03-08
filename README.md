<h1 style="display: inline;">
  <img src="https://github.com/user-attachments/assets/823b1091-78cd-423f-9b41-14f33b787c7d" alt="NodeTool Logo" height="24" style="vertical-align: -30px;"/>
  NodeTool - 🚀 AI Workflows Done Right!
</h1>

![Conda](https://github.com/nodetool-ai/nodetool/actions/workflows/conda.yaml/badge.svg)
![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
![Lint](https://github.com/nodetool-ai/nodetool/actions/workflows/lint.yml/badge.svg)
![Docker](https://github.com/nodetool-ai/nodetool/actions/workflows/docker-publish.yaml/badge.svg)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

NodeTool is your open-source, privacy-first, no-code playground for rapidly building and automating powerful AI workflows. Built specifically for hackers, data scientists, AI enthusiasts, and creative minds who love experimenting with LLMs, Stable Diffusion, and other local-first AI models. It's the ultimate AI toolkit you've been waiting for.

## 🚀 Why NodeTool?

### 🔒 Privacy-First & 100% Local

- **Run powerful AI models** directly on your machine—no cloud required.
- Keep your data safe and private; **zero data leakage**.
- Fully offline-capable—perfect for privacy-conscious creators and hackers.

### 🎨 Ultimate AI Creativity

- Drag-and-drop workflow builder supporting **LLaMA, GPT variants, Stable Diffusion, ComfyUI, and more**.
- Seamlessly integrate **text, images, audio, and video** in one intuitive interface.
- Bring your ComfyUI workflows into NodeTool and push your Stable Diffusion creations even further.

### 💻 Deep System Integration

- Instantly accessible **global chat overlay** to run AI anywhere on your desktop.
- Assign global shortcuts to Nodetool workflows
- Access clipboard and screen directly
- Automate daily tasks like email summarization, social media content, or even coding.
- Control apps, files, and system tasks—all driven by custom AI workflows.

### 🌩️ Premium Cloud Scalability (Optional)

- Easily deploy heavy AI workflows to **GPU-powered cloud instances** when you need extra horsepower.
- Access cutting-edge AI models like large-scale video generation and high-end image synthesis.
- Scale seamlessly from hobby projects to enterprise-grade applications.

---

![NodeTool](screen.png)

---

## ⚙️ Quickstart Installation

### 1️⃣ Get It Running in Minutes!

- **Windows / Mac / Linux:** [Grab it here](https://nodetool.ai)
- Launch the installer, run NodeTool, and get ready to create.

### 2️⃣ Create an AI Workflow Instantly

- Open NodeTool and choose a **prebuilt template** or start fresh.
- Drag and drop AI nodes and connect them visually.
- Hit **Run** and watch your local AI in action!

---

## ✨ Cool Things You Can Do

🎯 **Personal AI Assistant**

- Privacy-first scheduling and task management
- Local LLM-powered note-taking systems
- Custom reminders and notifications
- Personal knowledge management solutions

📊 **AI-Powered Data Processing**

- Summarize and analyze large document collections
- Extract insights from reports and research papers
- Automated data visualization workflows
- Custom data extraction and processing pipelines

🔧 **Workflow Automation**

- Apps that streamline repetitive tasks with AI
- Automated testing and QA workflows
- Custom code review and documentation assistants
- Automated data validation systems

🗣️ **Voice and Chat Interfaces**

- Voice-enabled apps with Siri integration
- Multi-modal chatbots (image and audio support)
- Domain-specific conversational interfaces
- Custom voice assistants using local AI models

---

## 💡 Join Our Community

- 🌟 **Give us a Star!** → [GitHub](https://github.com/nodetool-ai)
- 💬 **Talk AI & Automation** → [Discord Community](https://discord.gg/26m5xBwe)
- 🚀 **Become a Contributor** → Help shape the future of local-first AI.

### Let's build amazing AI workflows together. ✨

## Features ✨

Key features for building AI applications:

- **Visual Workflow Editor**: Design your app's logic visually—no coding required
- **Global Chat Overlay**: Access all your AI tools and workflows from a single chat interface.
- **System Tray Integration**: Access workflows and apps quickly
- **App Templates**: Start with pre-built templates for common use cases
- **Mini-App Builder**: Package workflows as standalone desktop applications
- **Chat Interface Builder**: Create custom chatbot interfaces
- **Comprehensive Model Support**:
  - Local models via Ollama and HuggingFace
  - Cloud APIs from OpenAI, Anthropic, Replicate, and Fal.ai
- **Vector Storage & RAG**:
  - Built-in ChromaDB integration for vector storage
  - Create sophisticated RAG applications
  - Index and query documents, PDFs, and other text sources
  - Combine with any supported LLM for enhanced responses
- **Asset Management**: Import and manage media assets within your apps
- **Multimodal Support**: Build apps that handle text, images, audio, and video
- **API Access**: Integrate your apps with other tools via API
- **Custom Extensions**: Add new capabilities with Python
- **Cross-Platform**: Deploy your apps on Mac, Windows, and Linux

### System Tray Integration 🔗

NodeTool lives in your system tray, providing instant access to all your AI tools and workflows:

- Quick-launch any workflow or app from the tray menu
- Configure and trigger global shortcuts
- Access the global chat overlay
- Transform clipboard content with AI
- Monitor workflow status

This system tray integration ensures your AI tools are always just a click or keystroke away, seamlessly integrating into your daily workflow.

### Global Chat Overlay 💬

A standout feature of NodeTool is the Global Chat Overlay, which serves as a unified entry point for all your AI tools and workflows. This chat interface allows you to:

- Run powerful tools such as image generation, audio generation, and more
- Access notes, documents, and other files
- Trigger any workflow you've created
- Engage in AI chats for natural language interactions

The global chat overlay provides a seamless and intuitive way to access your custom AI solutions, making it easier than ever to integrate AI into your daily workflow.

## Quickstart 🚀

Release 0.6 is available soon! Stay tuned.

## Node Overview 🧩

- **Anthropic** 🧠: Text-based AI tasks.
- **Comfy** 🎨: Support for ComfyUI nodes for image processing.
- **Chroma** 🌈: Vector database for embeddings.
- **ElevenLabs** 🎤: Text-to-speech services.
- **Fal** 🔊: AI for audio, image, text, and video.
- **Google** 🔍: Access to Gemini Models and Gmail.
- **HuggingFace** 🤗: AI for audio, image, text, and video.
- **NodeTool Core** ⚙️: Core data and media processing functions.
- **Ollama** 🦙: Run local language models.
- **OpenAI** 🌐: AI for audio, image, and text tasks.
- **Replicate** ☁️: AI for audio, image, text, and video in the cloud.

## Development Setup 🛠️

### Requirements

- Conda, download and install from [miniconda.org](https://docs.conda.io/en/latest/miniconda.html)
- Node.js, download and install from [nodejs.org](https://nodejs.org/en)

### Conda Environment

```bash
conda create -n nodetool python=3.11
conda activate nodetool
conda install -c conda-forge ffmpeg cairo x264 x265 aom libopus libvorbis lame pandoc uv
```

### Install Python Dependencies

On macOS:

```bash
pip install git+https://github.com/nodetool-ai/nodetool-core
pip install git+https://github.com/nodetool-ai/nodetool-base
```

Discover more packs:

```
nodetool package list -a
```

Install more:

```
pip install git+https://github.com/nodetool-ai/nodetool-aime
pip install git+https://github.com/nodetool-ai/nodetool-anthropic
pip install git+https://github.com/nodetool-ai/nodetool-apple
pip install git+https://github.com/nodetool-ai/nodetool-chroma
pip install git+https://github.com/nodetool-ai/nodetool-comfy --extra-index-url https://download.pytorch.org/whl/cu121
pip install git+https://github.com/nodetool-ai/nodetool-elevenlabs
pip install git+https://github.com/nodetool-ai/nodetool-fal
pip install git+https://github.com/nodetool-ai/nodetool-google
pip install git+https://github.com/nodetool-ai/nodetool-huggingface --extra-index-url https://download.pytorch.org/whl/cu121
pip install git+https://github.com/nodetool-ai/nodetool-lib-audio
pip install git+https://github.com/nodetool-ai/nodetool-lib-data
pip install git+https://github.com/nodetool-ai/nodetool-lib-file
pip install git+https://github.com/nodetool-ai/nodetool-lib-image
pip install git+https://github.com/nodetool-ai/nodetool-lib-ml
pip install git+https://github.com/nodetool-ai/nodetool-lib-network
pip install git+https://github.com/nodetool-ai/nodetool-ollama
pip install git+https://github.com/nodetool-ai/nodetool-openai
pip install git+https://github.com/nodetool-ai/nodetool-replicate
```

### Run without Electron

Ensure you have the Conda environment activated.

On macOS and Linux:

```bash
./scripts/server --with-ui --reload
```

On windows:

```bash
.\scripts\server.bat --with-ui --reload
```

Now, open your browser and navigate to `http://localhost:3000` to access the NodeTool interface.

### Run with Electron

Ensure you have the Conda environment activated and the location is set in the settings file located at `~/.config/nodetool/settings.yaml` or `%APPDATA%/nodetool/settings.yaml` on Windows:

```yaml
CONDA_ENV: /path/to/conda/environment # e.g. /Users/matthias/miniconda3/envs/nodetool
```

Before running Electron, you need to build the frontends located in the `/web` and `/apps` directories:

```bash
cd web && npm install && npm run build && cd ..
cd apps && npm install && npm run build && cd ..
```

Once the build is complete, you can start the Electron app:

```bash
cd electron
npm install
npm start
```

The Electron app starts the frontend and backend automatically.

## Contributing 🤝

We welcome contributions from the community! To contribute to NodeTool:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -am 'Add some feature'`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a Pull Request.

Please adhere to our contribution guidelines.

## License 📄

NodeTool is licensed under the [AGPLv3 License](LICENSE.txt)

## Contact 📬

Got ideas, suggestions, or just want to say hi? We'd love to hear from you!

- **Email**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Discord**: [Nodetool Discord](https://discord.gg/26m5xBwe)
- **Forum**: [Nodetool Forum](https://forum.nodetool.ai)
- **GitHub**: [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
- **Matthias Georgi**: matti@nodetool.ai
- **David Bührer**: david@nodetool.ai
