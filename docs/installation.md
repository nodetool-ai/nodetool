---
layout: page
title: "Install NodeTool on Windows, macOS, or Linux"
description: "Download NodeTool for Windows, macOS, or Linux — dmg, exe, or AppImage. No setup wizard: the extra pieces download only when a workflow needs them."
---

Download, install, open. There is no setup wizard and nothing to configure
first. The larger pieces some workflows need, such as AI models, download later
and only when you actually use them.

---

## The short version

1. Download NodeTool from [nodetool.ai](https://nodetool.ai)
2. Run the installer
3. Open NodeTool

The file you get is a `.dmg` on macOS, an `.exe` on Windows, and an AppImage on
Linux. Exact steps for each are below: [macOS](#macos), [Windows](#windows),
[Linux](#linux).

You don't need a fast computer. If you'd rather have an online AI service do the
heavy work, skip every download on this page: open **Settings → Providers**
and paste an API key from [OpenAI](https://platform.openai.com),
[Anthropic](https://www.anthropic.com), or [Google](https://ai.google.dev). An
**API key** is a password-like string from that company's website that lets
NodeTool use your account there. See [Providers](providers.md).

---

## macOS

1. Download the `.dmg` from [nodetool.ai](https://nodetool.ai). There are two
   builds: one for Apple Silicon (arm64) and one for Intel (x64). To see which
   Mac you have, open the Apple menu → About This Mac.
2. Open the downloaded file and drag Nodetool into your Applications folder.
3. Open it from Applications. Released builds are signed and approved by Apple,
   so macOS should not warn you or block the first launch.
4. If a workflow records audio or video, macOS asks once for microphone or
   camera permission. Approve it or those nodes won't work.

On Apple Silicon Macs, AI models that run on your own machine use Apple's
[MLX framework](models.md#mlx-framework-apple-silicon) automatically. Nothing to
set up.

---

## Windows

1. Download the installer (`Nodetool-Setup-<version>.exe`) from
   [nodetool.ai](https://nodetool.ai).
2. Run it. You choose where it installs. It then adds a desktop shortcut and
   opens NodeTool when it finishes.
3. Approve the Windows firewall prompt. NodeTool runs a small server on your own
   machine (on port 7777) that the app window talks to. Nothing is exposed to
   the internet.

Both the installer and the app are code-signed. If you want AI models to run on
your own graphics card, keep your NVIDIA driver up to date.

---

## Linux

1. Download the AppImage from [nodetool.ai](https://nodetool.ai). It is the only
   Linux package NodeTool ships today.
2. Mark it executable and run it:
   ```bash
   chmod +x Nodetool-*.AppImage
   ./Nodetool-*.AppImage
   ```
3. There is no install step. An AppImage is a single self-contained file that
   runs wherever you put it.

Prefer Flatpak? Unsigned builds are produced from every change to the project.
See [Flatpak CI Builds](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml).
They are not on Flathub yet.

---

## What downloads later

The app itself is small. These pieces arrive the first time a workflow needs
them:

- **Python and Conda** (about 3-5 GB, once) — some nodes are written in Python
  rather than JavaScript, and they need this to run. It downloads the first time
  you run a workflow containing one, such as a HuggingFace, MLX, or Apple
  integration node. A workflow with no Python nodes never triggers it.
- **Model runners** — Ollama and llama.cpp are the programs that run AI models
  on your own machine. They download when you install or run a model that needs
  one, from the **Models** panel.
- **The models themselves** — usually 4-20 GB each, depending on the model.

No graphics card, or no room for the downloads? Use an online AI service with
your own API key instead (**Settings → Providers**). See
[Providers](providers.md) and [Models & Providers](models-and-providers.md).

### What different tasks need

What matters is the kind of hardware you have, not the exact model of graphics
card:

| Your hardware | What runs the model | Good for |
|----------|--------|----------|
| NVIDIA graphics card | Nunchaku, llama.cpp/GGUF | Making images, running compressed language models |
| Apple Silicon Mac | MLX | Language models, image understanding, Flux |
| No graphics card, CPU only | llama.cpp, Transformers | Works, but slowly |
| Anything, using an online service | The provider's servers | Every kind of task, nothing to download |

[Supported Models](models.md) compares all of them.

---

## Other ways to install

If you don't want the desktop app:

**Command line only** — install just the `nodetool` command, without the desktop
app:

```bash
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash
```

or with npm:

```bash
npm install -g @nodetool-ai/cli
nodetool serve
```

See the [CLI Reference](cli.md).

**On your own server (Docker)** — run NodeTool's backend on your machine or a
remote host:

```bash
cp .env.example .env
docker compose up -d
```

See [Self-Hosted Deployment](self-hosted-deployment.md) for logins, upgrades,
and remote hosts, or the [Deployment Guide](deployment.md) for the full picture.

**From source code** — for people who want to change NodeTool itself:

```bash
nvm use
npm install
npm run build:packages
npm run dev
```

Needs Node.js 22.22.1 (see `.nvmrc`) and, for Python nodes, Python 3.11+ with
conda. Full setup in the
[repo README](https://github.com/nodetool-ai/nodetool#development-setup).

---

## If installing goes wrong

Most install problems are one of these four. For problems that show up once
NodeTool is running, see [Troubleshooting](troubleshooting.md).

**The Python download fails** — it needs an internet connection and about 5 GB
of free disk space. Restart NodeTool; a partial download picks up where it left
off.

**NodeTool doesn't see my graphics card** — open a terminal and run
`nvidia-smi`. That is the same check NodeTool runs in Help → System Information.
If you have no dedicated graphics card, NodeTool falls back to the CPU, or you
can use an online service instead.

**A model download stalls or fails** — usually disk space or network.
[Model Download Troubleshooting](troubleshooting.md#issue-model-download-fails-or-stalls)
covers disk space, resuming, and HuggingFace download limits.

**The app can't reach its own server** — approve the firewall prompt for
NodeTool's local server on port 7777. Running the Docker version instead? See
[Deployment Troubleshooting](troubleshooting.md#issue-deployment-fails-or-service-wont-start).

**Still stuck** — ask on [Discord](https://discord.gg/WmQTWZRcYE) or open a
[GitHub Issue](https://github.com/nodetool-ai/nodetool/issues). Include your
operating system and your NodeTool version (Help → About).

---

## Uninstalling

- **Windows** — Settings → Apps → Nodetool → Uninstall.
- **macOS** — drag Nodetool from Applications to the Trash.
- **Linux** — delete the AppImage file.

Your settings live in `~/.config/nodetool/settings.yaml` (macOS and Linux) or
`%APPDATA%\nodetool\settings.yaml` (Windows). Delete that folder too if you want
to start completely fresh.

---

## Next

You're installed. [Quick Start](getting-started.md) walks you through running
your first workflow.
