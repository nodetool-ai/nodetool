<h1 style="">
  <img src="https://github.com/user-attachments/assets/dc2d5495-adc1-4a2a-a1b6-343f85083bc4" alt="NodeTool Logo" height="48" style="vertical-align: middle; margin-right: 8px;">NodeTool - AI Prototyping Platform
</h1>

Design and develop AI agent systems

![Conda](https://github.com/nodetool-ai/nodetool/actions/workflows/conda.yaml/badge.svg)
![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
![Lint](https://github.com/nodetool-ai/nodetool/actions/workflows/lint.yml/badge.svg)
![Docker](https://github.com/nodetool-ai/nodetool/actions/workflows/docker-publish.yaml/badge.svg)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

NodeTool is an open-source, privacy-first, no-code platform for rapidly building and automating local AI workflows.

## 🚀 Why NodeTool?

### 🔒 Privacy-First & Fully Local

- **Run all AI models locally** - LLMs, audio & video processing
- **Complete privacy with zero data transmission**
- **Process sensitive data locally**

### 🤖 Advanced Agent Design

- **Build multi-agent systems with visual workflows**
- **Strategic planning and reasoning capabilities**
- **Integrate tools like web browsing and file operations**

### 🎨 Fast AI Prototyping

- **Fastest way to prototype AI workflows**
- **Visual workflow editor, no coding required**
- **Drag-and-drop LLMs, Diffusion Models, & more**

### 💻 Comprehensive System Integration

- **Control apps, clipboard & browser with AI**
- **Custom shortcuts to trigger AI workflows**
- **Access your knowledge base and local files**

### 🌩️ Optional Cloud Providers

- **Scale with GPU-powered cloud providers**
- **Connect to OpenAI, Anthropic, Replicate & Fal.AI when needed**
- **Create hybrid workflows, control what data is shared**

---

![NodeTool](screen.png)

---

## ⚙️ Quickstart Installation

### 1️⃣ Get It Running in Minutes!

- **Windows / Mac / Linux:** [Grab it here](https://nodetool.ai)
- Launch the installer, run NodeTool, and get ready to create.

**Note:** Requires Nvidia GPU or Apple Silicon M1+ and at least 20GB of free space for model downloads.

### 2️⃣ Create an AI Workflow Instantly

- Open NodeTool and choose a **prebuilt template** or start fresh.
- Drag and drop AI nodes and connect them visually.
- Hit **Run** and watch your local AI in action!

---

## Features ✨

NodeTool offers powerful, intuitive features to help you build, automate, and deploy AI workflows quickly and effortlessly:

- **Visual Workflow Editor**: Design complex AI workflows visually with drag-and-drop simplicity—no coding required. Easily create, understand, and modify AI workflows with our intuitive interface.

- **Local AI Models**: Run powerful open-source models from Hugging Face and Ollama directly on your hardware, ensuring complete privacy and offline capability.

- **System Tray Integration**: Quickly launch workflows, assign global shortcuts, manage clipboard content, and monitor AI tasks seamlessly from your system tray.

- **ComfyUI Integration**: Directly import and execute your existing ComfyUI workflows, enhancing your creative AI projects.

- **Asset Management**: Effortlessly import, organize, and manage your images, audio, video, and other media assets within your AI workflows.

- **Ready-to-Use App Templates**: Jumpstart your projects using pre-built workflow templates tailored for popular AI use cases.

- **Mini-App Builder**: Turn workflows into standalone desktop applications with just a few clicks.

- **Chat Interface Builder**: Create personalized chatbot interfaces tailored specifically to your needs.

- **Comprehensive AI Model Support**:

  - Run local models via Ollama and HuggingFace
  - Integrate cloud APIs including OpenAI, Anthropic, Replicate, and Fal.ai

- **Advanced Vector Storage & RAG**:

  - Built-in ChromaDB integration for storing and querying embeddings
  - Effortlessly create Retrieval-Augmented Generation (RAG) workflows
  - Index and query PDFs, documents, and other text sources
  - Combine vector storage with any supported LLM for enhanced responses

- **Multimodal AI Capabilities**: Seamlessly process text, images, audio, and video within a single workflow.

- **API Access**: Extend your workflows by integrating NodeTool with external applications and services via APIs.

- **Custom Python Extensions**: Expand functionality with custom scripts and integrations using Python.

- **Cross-Platform Compatibility**: Build and deploy your workflows seamlessly across Mac, Windows, and Linux.

### System Tray Integration 🔗

NodeTool's system tray integration keeps your AI tools at your fingertips:

- Quickly trigger workflows directly from your tray
- Set up and use global keyboard shortcuts
- Instantly access the global chat overlay
- Transform clipboard content using AI workflows
- Monitor the real-time status of workflows

Integrate NodeTool effortlessly into your daily routine, ensuring your AI workflows are always just one click away.

## Cool Things You Can Do ✨

Explore these practical examples to see how NodeTool can enhance your daily productivity:

- **Daily Digest using Deepseek R1 📧📰**: Automatically searches your Gmail inbox for emails with '[AINews]' in the subject line from the past week and summarizes them using the Deepseek R1 7B model. This workflow extracts key details such as sender information, main topics, action items, and deadlines, combining them into a concise, categorized summary—ideal for efficiently staying updated on important AI news without sifting through multiple emails.

- **Pokemon Maker 🐉✨**: Create unique and imaginative Pokemon with detailed descriptions and visually stunning images using AI. Input animal inspirations and get custom Pokemon complete with types, abilities, and personalities.

- **Simple RAG 🔍📚**: A retrieval-augmented generation (RAG) workflow that searches a document collection based on user queries. The system retrieves relevant information from a ChromaDB collection, formats the results into a prompt, and uses the Deepseek-R1 7B model to generate concise, informative answers based on the retrieved content.

- **Style Transfer 🎨🖼️**: Instantly transform your images into stunning artwork by applying styles from reference images. This workflow uses IP-Adapter to blend artistic elements while ControlNet maintains the original structure, making it perfect for generating creative variations of portraits, landscapes, and more.

---

## 💡 Join Our Community

- 🌟 **Give us a Star!** → [GitHub](https://github.com/nodetool-ai)
- 💬 **Talk AI & Automation** → [Discord Community](https://discord.gg/26m5xBwe)
- 🚀 **Become a Contributor** → Help shape the future of local-first AI.

### Let's build amazing AI workflows together. ✨

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
