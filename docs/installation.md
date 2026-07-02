---
layout: page
title: "Install NodeTool on Windows, macOS, or Linux"
description: "Download NodeTool for Windows, macOS, or Linux — dmg, exe, or AppImage. No setup wizard: Python, Conda, and AI engines install on demand as you need them."
---

NodeTool opens on first launch with no setup wizard. Python, Conda, and inference engines install on demand the first time you need them.

---

## Quick start

1. Download from [nodetool.ai](https://nodetool.ai)
2. Run the installer
3. Launch NodeTool

The download is a `.dmg` on macOS, `.exe` on Windows, and an AppImage on Linux — see [macOS](#macos), [Windows](#windows), and [Linux](#linux) below for the exact steps and platform notes.

No local AI stack? Skip the download entirely: open **Settings → Providers** and add a key from [OpenAI](https://platform.openai.com), [Anthropic](https://www.anthropic.com), or [Google](https://ai.google.dev). See [Providers](providers.md).

---

## macOS

1. Download the `.dmg` from [nodetool.ai](https://nodetool.ai). Separate builds ship for Apple Silicon (arm64) and Intel (x64) — pick the one matching your Mac (Apple menu → About This Mac).
2. Open the DMG and drag Nodetool into Applications.
3. Launch it from Applications. Release builds are code-signed and notarized, so Gatekeeper shouldn't block the first launch.
4. Recording audio or video in a workflow prompts for microphone/camera permission the first time — approve it to use those nodes.

Apple Silicon Macs run local models through Apple's [MLX framework](models.md#mlx-framework-apple-silicon) automatically; no extra setup.

---

## Windows

1. Download the installer (`Nodetool-Setup-<version>.exe`) from [nodetool.ai](https://nodetool.ai).
2. Run it. You choose the install directory; the installer adds a desktop shortcut and launches NodeTool when it finishes.
3. Approve the firewall prompt — NodeTool runs a local server on port 7777 that the UI connects to.

The installer and app executable are code-signed. For local model acceleration, keep your NVIDIA driver current.

---

## Linux

1. Download the AppImage from [nodetool.ai](https://nodetool.ai) — it's the only Linux package NodeTool ships today.
2. Make it executable and run it:
   ```bash
   chmod +x Nodetool-*.AppImage
   ./Nodetool-*.AppImage
   ```
3. There's no install step. The AppImage runs in place — move the file wherever you want it to live.

Prefer Flatpak? The project publishes unsigned CI builds from every push to `main` — see [Flatpak CI Builds](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml) (not yet on Flathub).

---

## What installs on demand

The app itself is small. Everything else downloads the first time a workflow needs it:

- **Python and Conda** — installs when you run a workflow that uses a Python node (HuggingFace, MLX, Apple integrations). The backend's `PythonStdioBridge` spawns the Python worker only at that point; a workflow built entirely from TypeScript nodes never triggers it. One-time download, roughly 3-5 GB.
- **Local inference engines** — Ollama and llama.cpp download when you install or run a model that needs them, from the **Models** panel.
- **Model weights** — each model you install pulls its own weights, typically 4-20 GB depending on the model.

No GPU, or don't want the download? Use a cloud provider with your own API key instead (**Settings → Providers**). See [Providers](providers.md) and [Models & Providers](models-and-providers.md).

### What Different Tasks Need

Hardware maps to inference engine, not to a specific GPU model:

| Hardware | Engine | Good for |
|----------|--------|----------|
| NVIDIA GPU | Nunchaku (4-bit diffusion), llama.cpp/GGUF | Image generation, quantized LLMs |
| Apple Silicon | MLX | LLMs, vision models, Flux ported to MLX |
| CPU only | llama.cpp, Transformers | Works, slower |
| No GPU | Cloud providers (BYOK) | Every modality, no download |

See [Supported Models](models.md) for the full engine comparison.

---

## Alternative installs

Don't need the desktop app:

**CLI only** — install the standalone `nodetool` CLI without Electron:

```bash
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash
```

or through npm:

```bash
npm install -g @nodetool-ai/cli
nodetool serve
```

See the [CLI Reference](cli.md).

**Self-hosted server (Docker)** — run the backend on your own machine or a remote host:

```bash
cp .env.example .env
docker compose up -d
```

See [Self-Hosted Deployment](self-hosted-deployment.md) for auth modes, upgrades, and remote hosts, or the [Deployment Guide](deployment.md) for the full server/worker picture.

**From source** — for contributors:

```bash
nvm use
npm install
npm run build:packages
npm run dev
```

Requires Node.js 22.22.1 (`.nvmrc`) and, for Python nodes, Python 3.11+ with conda. Full setup in the [repo README](https://github.com/nodetool-ai/nodetool#development-setup).

---

## Troubleshooting Installation

Most install problems are one of these. For workflow and runtime issues once NodeTool is running, see the [Troubleshooting Guide](troubleshooting.md).

**On-demand Python/Conda setup fails** — needs internet access and about 5 GB free disk space. Restart NodeTool; partial downloads resume automatically.

**GPU not detected** — check your driver with `nvidia-smi` in a terminal (the same check NodeTool's own Help → System Information dialog runs). No dedicated GPU? NodeTool falls back to CPU, or use a cloud provider instead.

**Model download fails or stalls** — usually disk space or network. See [Model Download Troubleshooting](troubleshooting.md#issue-model-download-fails-or-stalls) for the full list: disk space, resuming, and HuggingFace rate limits.

**Can't connect to the local server** — approve the firewall prompt for NodeTool's local server (port 7777 by default). Running the self-hosted Docker image instead? See [Deployment Troubleshooting](troubleshooting.md#issue-deployment-fails-or-service-wont-start).

**Still stuck** — ask in [Discord](https://discord.gg/WmQTWZRcYE) or file a [GitHub Issue](https://github.com/nodetool-ai/nodetool/issues). Include your OS and NodeTool version (Help → About).

---

## Uninstalling

- **Windows** — Settings → Apps → Nodetool → Uninstall.
- **macOS** — drag Nodetool from Applications to the Trash.
- **Linux** — delete the AppImage file.

Settings live in `~/.config/nodetool/settings.yaml` (macOS/Linux) or `%APPDATA%\nodetool\settings.yaml` (Windows) — remove that folder too for a clean reset.

---

## Next Steps

Ready to build your first workflow? See the [Getting Started guide](getting-started.md).
