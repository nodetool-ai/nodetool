---
layout: page
title: "Installing NodeTool"
description: "Step-by-step installation guide for Windows, macOS, and Linux – with requirements and troubleshooting tips."
---

NodeTool includes a guided setup process that handles everything automatically. **No programming knowledge required** – the installer sets up all the technical components for you.

---

## Quick Start

1. Download NodeTool from [nodetool.ai](https://nodetool.ai)
2. Run the installer
3. Choose where to install (default is fine)
4. Wait for setup to complete (~5-10 minutes)
5. Start building workflows!

---

## System Requirements

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| **Operating System** | Windows 10+, macOS 11+, or Linux (Ubuntu 20.04+) |
| **RAM** | 8 GB (16 GB recommended) |
| **Storage** | 20 GB free space (SSD recommended) |
| **Internet** | Required for initial setup and cloud AI features |

### For Local AI Models (Recommended)

Running AI models locally provides privacy and works offline, but requires more resources:

| Hardware | Capability |
|----------|------------|
| **NVIDIA GPU** (8+ GB VRAM) | Full local AI capabilities including image generation |
| **Apple Silicon** (M1/M2/M3) | Excellent local performance via MLX optimization |
| **CPU only** | Works, but slower for AI tasks |

> **Don't have a powerful computer?** No problem! You can use cloud AI providers (OpenAI, Anthropic, etc.) instead of local models. Add your API key in Settings after installation.

---

## Platform-Specific Instructions

### Windows

1. **Download** the `.exe` installer from [nodetool.ai](https://nodetool.ai)
2. **Run** the installer – Windows Defender may ask for permission (click "Run anyway")
3. **Approve** any firewall prompts so NodeTool can run its local server
4. **NVIDIA users**: Ensure you have recent GPU drivers installed for best performance

### macOS

1. **Download** the `.dmg` file from [nodetool.ai](https://nodetool.ai)
2. **Open** the DMG and drag NodeTool to Applications
3. **First launch**: Right-click and choose "Open" (required for unsigned apps)
4. **Apple Silicon**: NodeTool automatically uses MLX for optimized local AI

### Linux

1. **Download** the AppImage or `.deb` package from [nodetool.ai](https://nodetool.ai)
2. **AppImage**: Make executable with `chmod +x` and run directly
3. **Debian/Ubuntu**: Install with `sudo dpkg -i nodetool.deb`
4. **NVIDIA users**: Ensure CUDA drivers are installed for GPU acceleration

---

## What Gets Installed

NodeTool automatically sets up everything it needs to run. Here's what happens behind the scenes:

### Core Components

- **Python Environment** – Self-contained Python installation (doesn't affect your system Python)
- **AI Engines** – Tools for running AI models locally:
  - **Ollama** – For language models
  - **llama.cpp** – Optimized inference (GPU-accelerated where available)
- **Dependencies** – All required libraries and packages

### Why 20 GB?

NodeTool itself is small, but AI models can be large:

| Component | Typical Size |
|-----------|--------------|
| NodeTool + Python environment | 2-4 GB |
| GPT-OSS (recommended LLM) | ~4 GB |
| Flux (image generation) | ~12 GB |
| **Total with recommended models** | ~20 GB |

You can install fewer models to save space, or use cloud providers instead.

---

## Step-by-Step Installation

### 1. Download NodeTool

Visit [nodetool.ai](https://nodetool.ai) and click the download button for your operating system.

### 2. Run the Installer

Launch the downloaded file. NodeTool's setup wizard will guide you through the process.

### 3. Choose Installation Location

You'll be asked where to install NodeTool's environment:

- **Default location** – Recommended for most users
- **Custom folder** – Choose any location with enough free space

> **Tip**: Use an SSD for faster AI model loading and workflow execution.

### 4. Select Optional Packages

Choose which extra features to install:

- **Cloud AI Services** – Integrations with OpenAI, Anthropic, Google
- **Document Processing** – PDF extraction, OCR capabilities
- **Audio/Video Tools** – Media processing nodes

You can add more packages later from Settings → Packages.

### 5. Wait for Download

NodeTool will download and set up all components. This typically takes 5-10 minutes depending on your internet connection. Progress is shown on screen.

### 6. Launch NodeTool

Once installation completes, NodeTool opens automatically. You're ready to start building!

---

## After Installation

### First Launch

1. **Firewall prompts**: Approve any requests – NodeTool runs a local server that needs network access
2. **Model Manager**: Open **Models → Model Manager** to download AI models
3. **Templates**: Check the Dashboard for ready-to-use workflow templates

### Sign In (Optional)

- **Sign in with Supabase**: Sync workflows across devices
- **Localhost Mode**: Keep everything local and private

### Install AI Models

To run workflows locally, install some AI models:

1. Go to **Models → Model Manager**
2. Install **GPT-OSS** for text generation
3. Install **Flux** for image generation
4. Or skip and use cloud providers with your API keys

---

## Troubleshooting

### Common Issues

**"Installation is taking forever"**
- Large models take time to download – check your internet connection
- Progress might appear stuck but is usually still working

**"Not enough disk space"**
- Free up space or choose a different installation location
- Consider using cloud AI providers instead of local models

**"GPU not detected"**
- Update your GPU drivers to the latest version
- On Windows, ensure CUDA is properly installed for NVIDIA GPUs

**"Can't connect to server"**
- Approve any firewall prompts
- Try restarting NodeTool
- Check if antivirus is blocking the connection

### Getting Help

- **[Discord Community](https://discord.gg/26m5xBwe)** – Ask questions and get help from users
- **[GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)** – Report bugs

---

## Uninstalling

### Windows
Use **Add/Remove Programs** in Windows Settings

### macOS
Drag NodeTool from Applications to Trash, then remove `~/Library/Application Support/NodeTool`

### Linux
Remove the AppImage or use `sudo dpkg -r nodetool` for Debian packages

---

## Next Steps

Ready to build your first workflow? Head to the [Getting Started guide](getting-started.md) to run your first AI workflow in 10 minutes!
