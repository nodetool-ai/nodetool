---
layout: page
title: "Installing NodeTool"
description: "Step-by-step installation guide for Windows, macOS, and Linux."
---

NodeTool launches immediately after installation — no setup wizard required. Python, Conda, and AI engine dependencies are installed on demand through the app when you first need them.

---

## Quick Start

1. Download NodeTool from [nodetool.ai](https://nodetool.ai)
2. Run the installer
3. Launch NodeTool — the app opens right away
4. Start building workflows!

---

## System Requirements

### Basics

| Component | Need |
|-----------|------|
| **OS** | Windows 10+, macOS 11+, Linux (Ubuntu 20.04+) |
| **RAM** | 8 GB minimum, 16 GB recommended |
| **Storage** | 20 GB free (SSD recommended) |
| **Internet** | For setup and cloud AI |

### For Local AI

Running models locally gives you privacy and offline use, but needs more resources:

| Hardware | Can Do |
|----------|--------|
| **NVIDIA GPU** (8+ GB VRAM) | All local AI including image generation |
| **Apple Silicon** (M1/M2/M3) | Excellent performance via MLX |
| **CPU only** | Works, slower |

> **No GPU?** Use cloud providers (OpenAI, Anthropic) instead. Add API key in Settings.

### What Different Tasks Need

| GPU Tier | Recommended Setup | Best Local Experience (Optimized) |
| --- | --- | --- |
| **Entry (8 GB)** | RTX 4060 / 5060 | **Flux.1 Schnell (Nunchaku)**, Qwen-Image-Lightning, 8B LLMs (Llama 3/4). |
| **Mid (12–16 GB)** | RTX 4070 Ti / 5070 | **Qwen-Image-Edit (4-bit)**, Flux.1 Dev (Nunchaku), 32B Reasoning LLMs (DeepSeek R1 Distill). |
| **Pro (24–32 GB)** | RTX 3090 / 4090 / 5090 | **Full Qwen-Image 2512**, Wan2.1 Video (720p), 70B LLMs (Llama 3.3/4 Q4). |
| **Ultra (48 GB+)** | Dual 5090s / Mac Ultra | **DeepSeek-V3 (Full Local)**, 4K Video Gen (LTX-2), LoRA training in minutes. |

Apple Silicon's Unified Memory lets Macs use much of system RAM for AI models. With MLX, Macs are competitive with NVIDIA for compute-heavy tasks like Flux and Qwen-Image. Rule of thumb: **model size (GB) + 4 GB system overhead < total RAM**.

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

NodeTool uses an on-demand installation approach — the app itself is lightweight and launches immediately. Additional components are downloaded automatically when you first use a feature that needs them.

### Core Components (installed with the app)

- **Node.js Runtime** -- Self-contained Node.js installation (does not affect your system Node.js)
- **NodeTool application** -- The visual editor, dashboard, and all core functionality

### On-Demand Components (installed automatically when needed)

- **Python / Conda** -- Installed through the app UI when you first run a workflow that requires Python-based AI models
- **AI Engines** -- Downloaded when you install or use specific model types:
  - **Ollama** -- For language models
  - **llama.cpp** -- Optimized inference (GPU-accelerated where available)
- **Model-specific dependencies** -- Each model or node pack installs its own requirements

### Disk Space

NodeTool itself is small, but AI models can be large:

| Component | Typical Size |
|-----------|--------------|
| NodeTool + Node.js runtime | 2-4 GB |
| Python/Conda environment | ~3-5 GB (installed on demand) |
| GPT-OSS (recommended LLM) | ~4 GB |
| Flux (image generation) | ~12 GB |
| **Total with recommended models** | ~25 GB |

You can install fewer models to save space, or use cloud providers instead.

> **Tip**: Use an SSD for faster AI model loading and workflow execution.

---

## After Installation

### First Launch

1. **Firewall prompts**: Approve any requests – NodeTool runs a local server that needs network access
2. **Explore the Dashboard**: Browse ready-to-use workflow templates
3. **Set up AI access**: Either add cloud API keys in **Settings → Providers**, or install local models from the **Models** panel

> **On-demand setup**: The first time you run a workflow that needs local AI, NodeTool will prompt you to install the required Python environment. This is a one-time download (~3-5 GB) and happens automatically through the app UI.

### Sign In (Optional)

- **Sign in with Supabase**: Sync workflows across devices
- **Localhost Mode**: Keep everything local and private

### Install AI Models

To run workflows with local AI models:

1. Open **Models** from the header bar
2. Browse or search for models (e.g., **Flux** for images, **Llama** for text)
3. Click to install — NodeTool handles all dependencies automatically
4. Or skip local models and use cloud providers with your API keys

---

## Troubleshooting Installation

### Common Installation Issues

**On-demand Python/Conda setup fails**
- Check internet connection — the environment download requires ~3-5 GB
- Restart NodeTool and try again — partial downloads resume automatically
- Check disk space — you need at least 5 GB free for the Python environment
- On macOS, ensure you've approved any permission prompts

**Not enough disk space**
- Free up space or choose a different installation location
- Use cloud providers instead of local models to skip Python environment setup entirely

**GPU not detected**
- Update GPU drivers
- On Windows, ensure CUDA is installed for NVIDIA GPUs
- See [CUDA Troubleshooting](#cuda-and-nvidia-driver-issues)

**Can't connect to server**
- Approve firewall prompts
- Restart NodeTool
- Check if antivirus is blocking the connection

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

**GPU acceleration unavailable**
- NodeTool delegates GPU workloads to external engines (Ollama, llama.cpp, ComfyUI). Ensure those engines have CUDA/Metal support enabled.
- Verify your GPU driver version with `nvidia-smi`.

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
- Some AV software blocks Node.js processes -- whitelist `node.exe` in NodeTool's folder

#### Firewall Configuration

NodeTool runs a local server (default port 7777). Allow it through your firewall:

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
sudo ufw allow 7777/tcp
```

---

### Runtime Environment Issues

NodeTool includes its own Node.js runtime, but system-level conflicts can occasionally occur.

#### "Module not found" or startup errors

- NodeTool uses a bundled runtime -- this error usually means installation is incomplete
- Try reinstalling NodeTool, ensuring the installer completes fully
- Check that you are launching NodeTool from the correct location

#### Development Setup (for contributors)

If running NodeTool from source:
```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start the development server
npm run dev
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

Ready to build your first workflow? See the [Getting Started guide](getting-started.md).
