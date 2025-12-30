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

### Hardware Requirements by Task

The table below shows specific hardware requirements for common AI tasks. Use this to determine if your system can run the workflows you need.

#### Image Generation

| Model | Minimum VRAM | Recommended VRAM | RAM | Notes |
|-------|-------------|------------------|-----|-------|
| **Stable Diffusion 1.5** | 4 GB | 6 GB | 8 GB | Good for basic image generation |
| **Stable Diffusion XL (SDXL)** | 8 GB | 12 GB | 16 GB | Higher quality, larger images |
| **Flux Schnell** | 8 GB | 12 GB | 16 GB | Fast generation, good quality |
| **Flux Dev** | 12 GB | 16 GB+ | 24 GB | Best quality, slower |
| **ControlNet (any base)** | +2-4 GB | +4-6 GB | +4 GB | Add to base model requirements |

#### Language Models (LLMs)

| Model Size | Minimum VRAM | Recommended VRAM | RAM (CPU-only) | Speed |
|------------|-------------|------------------|----------------|-------|
| **7B parameters** (Mistral, Llama 3.1 8B) | 6 GB | 8 GB | 16 GB | Good for most tasks |
| **13B parameters** | 10 GB | 12 GB | 24 GB | Better reasoning |
| **20B+ parameters** (GPT-OSS) | 16 GB | 24 GB | 32 GB+ | Near-GPT quality |
| **70B parameters** | 48 GB+ | 80 GB | 64 GB+ | Maximum quality, multi-GPU |

> **Quantization reduces requirements**: 4-bit quantized models (Q4) use ~50% less VRAM than full precision. NodeTool automatically uses quantized versions when available.

#### Audio Processing

| Task | Minimum | Recommended | Notes |
|------|---------|-------------|-------|
| **Whisper (transcription)** | 4 GB VRAM or 8 GB RAM | 6 GB VRAM or 16 GB RAM | CPU works but slower |
| **Text-to-Speech (TTS)** | 2 GB VRAM or 4 GB RAM | 4 GB VRAM or 8 GB RAM | Lightweight |
| **Music Generation** | 8 GB VRAM | 12 GB VRAM | Model dependent |

#### Video Processing

| Task | Minimum VRAM | Recommended VRAM | RAM | Notes |
|------|-------------|------------------|-----|-------|
| **Video-to-Video** | 12 GB | 16 GB+ | 32 GB | Processes frame-by-frame |
| **CogVideoX** | 16 GB | 24 GB | 48 GB | Text-to-video generation |

#### Apple Silicon (M1/M2/M3/M4)

Apple Silicon Macs use unified memory shared between CPU and GPU. NodeTool uses MLX for optimized performance.

| Chip | Unified Memory | Capability |
|------|---------------|------------|
| **M1/M2** (8 GB) | 8 GB | Basic LLMs (7B), limited image gen |
| **M1/M2 Pro** (16 GB) | 16 GB | Most LLMs, SDXL, Flux Schnell |
| **M1/M2 Max** (32 GB) | 32 GB | Large LLMs (20B+), all image models |
| **M1/M2 Ultra** (64 GB+) | 64 GB+ | All models including 70B LLMs |
| **M3/M4 (any)** | 8-128 GB | ~20% faster than equivalent M2 |

### Quick Compatibility Check

**"Can I run this workflow?"** — Use these quick guidelines:

- **8 GB VRAM / 16 GB RAM**: Basic image generation, 7B LLMs, audio transcription
- **12 GB VRAM / 24 GB RAM**: SDXL, Flux, 13B LLMs, most creative workflows  
- **16 GB+ VRAM / 32 GB+ RAM**: All local models, video generation, large LLMs
- **Cloud APIs only**: Any hardware — offload heavy processing to OpenAI, Anthropic, Replicate

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

## Troubleshooting Installation

### Common Installation Issues

**"Installation is taking forever"**
- Large models take time to download – check your internet connection
- Progress might appear stuck but is usually still working
- Try pausing/resuming if available, or restart the installer

**"Not enough disk space"**
- Free up space or choose a different installation location
- Consider using cloud AI providers instead of local models
- See [Hardware Requirements](#hardware-requirements-by-task) to estimate space needs

**"GPU not detected"**
- Update your GPU drivers to the latest version
- On Windows, ensure CUDA is properly installed for NVIDIA GPUs
- See [CUDA Troubleshooting](#cuda-and-nvidia-driver-issues) below

**"Can't connect to server"**
- Approve any firewall prompts
- Try restarting NodeTool
- Check if antivirus is blocking the connection
- See [Antivirus and Firewall](#antivirus-and-firewall-issues) below

---

### CUDA and NVIDIA Driver Issues

NodeTool uses CUDA for GPU acceleration on NVIDIA cards. If you're having GPU issues:

#### Check Your CUDA Version

Open a terminal/command prompt and run:
```bash
nvidia-smi
```

You should see your GPU model and driver version. NodeTool requires:
- **CUDA 11.8** or **CUDA 12.x** (12.1+ recommended)
- **Driver version 525.60+** for CUDA 12.x

#### Common CUDA Problems

**"CUDA out of memory"**
- Close other GPU-intensive applications (browsers, games, other AI tools)
- Use smaller/quantized models (see [Hardware Requirements](#hardware-requirements-by-task))
- Reduce batch sizes in workflow settings
- Check if another process is using GPU: `nvidia-smi` shows GPU memory usage

**"No CUDA-capable device detected"**
1. Verify your GPU is NVIDIA and supports CUDA (GTX 900 series or newer)
2. Update NVIDIA drivers from [nvidia.com/drivers](https://www.nvidia.com/drivers)
3. Reinstall CUDA Toolkit if needed: [developer.nvidia.com/cuda-downloads](https://developer.nvidia.com/cuda-downloads)

**"CUDA version mismatch" or "cuDNN errors"**
- Multiple CUDA versions can conflict. Check installed versions:
  ```bash
  # Windows
  nvcc --version
  where nvcc
  
  # Linux/macOS
  nvcc --version
  which nvcc
  ```
- If multiple versions exist, ensure your PATH points to the correct one
- NodeTool's bundled environment usually handles this, but system conflicts can occur

**"torch.cuda.is_available() returns False"**
- Your PyTorch installation may not have CUDA support
- NodeTool includes its own PyTorch; if using custom Python, install the CUDA version:
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/cu121
  ```

#### Windows-Specific CUDA Issues

- **Visual C++ Redistributable**: Install from [Microsoft](https://aka.ms/vs/17/release/vc_redist.x64.exe)
- **Windows Defender**: May quarantine CUDA files. Add NodeTool folder to exclusions
- **Path length**: Install NodeTool in a short path (e.g., `C:\NodeTool`) to avoid Windows path limits

---

### Antivirus and Firewall Issues

Security software can interfere with NodeTool's local server and AI model execution.

#### Symptoms

- NodeTool installs but won't start
- "Connection refused" errors
- Models download but won't load
- Slow performance despite adequate hardware

#### Solutions by Antivirus

**Windows Defender**
1. Open Windows Security → Virus & threat protection
2. Click "Manage settings" under Virus & threat protection settings
3. Scroll to "Exclusions" and click "Add or remove exclusions"
4. Add these folders:
   - NodeTool installation directory
   - `%USERPROFILE%\.nodetool`
   - `%USERPROFILE%\.cache\huggingface`

**Norton, McAfee, Bitdefender, etc.**
- Add NodeTool to your antivirus's trusted/excluded programs list
- Temporarily disable real-time scanning during installation
- Some AV software blocks Python processes – whitelist `python.exe` in NodeTool's folder

#### Firewall Configuration

NodeTool runs a local server (default port 8000). Allow it through your firewall:

**Windows Firewall**
1. Open Windows Firewall → "Allow an app through firewall"
2. Click "Change settings" then "Allow another app"
3. Browse to NodeTool's executable and add it
4. Ensure both Private and Public are checked

**macOS Firewall**
1. System Preferences → Security & Privacy → Firewall
2. Click "Firewall Options"
3. Add NodeTool and set to "Allow incoming connections"

**Linux (ufw)**
```bash
sudo ufw allow 8000/tcp
```

---

### Python Environment Issues

NodeTool includes its own Python environment, but system Python can sometimes conflict.

#### "Python not found" or "Module not found"

- NodeTool uses a bundled Python – this error usually means installation incomplete
- Try reinstalling NodeTool, ensuring the installer completes fully
- Check that you're launching NodeTool from the correct location

#### Conflicting Python Environments

If you have Anaconda, Miniconda, or other Python distributions:

- **Don't activate conda** before running NodeTool – it uses its own Python
- If issues persist, temporarily rename or move your conda installation to test
- Check your PATH doesn't override NodeTool's Python

#### Virtual Environment Issues (for developers)

If running NodeTool from source:
```bash
# Create fresh environment
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -e .
```

---

### Platform-Specific Troubleshooting

#### Windows

**"Missing DLL" errors**
- Install Visual C++ Redistributable (x64): [Download](https://aka.ms/vs/17/release/vc_redist.x64.exe)
- Restart after installation

**"Access denied" during installation**
- Run installer as Administrator
- Install to a user-writable location (not `C:\Program Files`)
- Disable controlled folder access temporarily

**Long path errors**
- Enable long paths in Windows (requires admin):
  ```powershell
  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  ```
- Or install NodeTool in a short path like `C:\NT`

#### macOS

**"App is damaged" or "unidentified developer"**
1. Right-click the app and select "Open" (bypasses Gatekeeper once)
2. Or: System Preferences → Security & Privacy → "Open Anyway"
3. If still blocked: `xattr -cr /Applications/NodeTool.app`

**Rosetta 2 (Intel apps on Apple Silicon)**
- NodeTool is native Apple Silicon – no Rosetta needed
- If you installed the wrong version, delete and reinstall the ARM version

**Permissions**
- Grant Full Disk Access if accessing files outside standard locations
- Grant accessibility permissions if prompted

#### Linux

**AppImage won't run**
```bash
chmod +x NodeTool-*.AppImage
./NodeTool-*.AppImage
```

**Missing libraries**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libfuse2 libgl1 libglib2.0-0

# Fedora
sudo dnf install fuse-libs mesa-libGL glib2
```

**GPU not detected (NVIDIA)**
```bash
# Check driver installation
nvidia-smi

# Install NVIDIA drivers if needed (Ubuntu)
sudo ubuntu-drivers autoinstall

# Install CUDA toolkit
sudo apt install nvidia-cuda-toolkit
```

---

### Resetting NodeTool

If all else fails, try a clean reinstall:

1. **Uninstall NodeTool** (see [Uninstalling](#uninstalling) below)
2. **Delete configuration folders**:
   - Windows: `%USERPROFILE%\.nodetool`
   - macOS: `~/.nodetool` and `~/Library/Application Support/NodeTool`
   - Linux: `~/.nodetool` and `~/.config/nodetool`
3. **Delete model caches** (optional, saves redownloading):
   - `~/.cache/huggingface`
   - `~/.ollama`
4. **Reinstall** from [nodetool.ai](https://nodetool.ai)

### Getting Help

If you're still stuck:

- **[Discord Community](https://discord.gg/WmQTWZRcYE)** – Ask questions and get help from users
- **[GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)** – Report bugs with system details
- **[Troubleshooting Guide](troubleshooting.md)** – For workflow and runtime issues (not installation)

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
