---
layout: page
title: "Advanced and Self-Hosted Installs"
description: "Install NodeTool without the desktop app: the npm CLI, Docker, a source checkout, Python nodes in your own environment, GPU and driver requirements for PyTorch, and stored secrets from the terminal."
---

The desktop app sets up everything on this page by itself. Read on if you run NodeTool from the command line, in Docker, or from source, or if Python nodes do not use your graphics card. The desktop install is in [Installation](installation.md).

> **Runs:** locally or on a server you control. **Needs:** Node.js 22 or newer for the CLI, the version in `.nvmrc` for a source checkout, Docker for the container, Python 3.11 or newer for Python nodes.
{: .callout-note}

## Other ways to install

**Command line only.** Install the `nodetool` command with npm (Node.js 22 or newer):

```bash
npm install -g @nodetool-ai/cli
nodetool serve   # API on 127.0.0.1:7777; use --host and --port to change
```

This runs every TypeScript node. For Python nodes, see [Python nodes without the desktop app](#python-nodes-without-the-desktop-app) and the [CLI Reference](cli.md).

**Docker.** Run the backend on your machine or a remote host:

```bash
cp .env.example .env
docker compose up -d
```

See [Self-Hosted Deployment](self-hosted-deployment.md) and the [Deployment Guide](deployment.md).

**From source.**

```bash
nvm use
npm install
npm run build:packages
npm run dev
```

Needs the Node.js version in `.nvmrc`. Python nodes need the environment described next.

## Python nodes without the desktop app

With the npm CLI or a source checkout you create the Python environment yourself. The server runs `python -m nodetool.worker --stdio`, so `nodetool-core` and every pack you want must be installed in the interpreter it picks.

On Linux and macOS, [install.sh](https://github.com/nodetool-ai/nodetool/blob/main/install.sh) does steps 1 to 3 below. It creates a Python 3.11 environment with ffmpeg in `~/.local/share/nodetool/conda_env` and installs `nodetool-core` plus the packs you name with `--pack` (`huggingface` or `mlx`):

```bash
curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh | bash -s -- -y --pack huggingface
```

It prints the `nodetool serve` command to run. On Linux the server finds that environment by itself. On macOS it does not search there, so start the server with `NODETOOL_PYTHON` set as the script shows.

To set up the environment by hand:

1. Create an environment named `nodetool` with Python 3.11 or newer:

   ```bash
   conda create -n nodetool python=3.11 ffmpeg -c conda-forge
   conda activate nodetool
   ```

   A plain `python -m venv` works too. Install `ffmpeg` separately then.
2. Install PyTorch for your hardware before any pack that needs it. On Linux
   and macOS, `pip install torch` gets the CUDA 13.0 build or the Apple
   Silicon build. On Windows, or for a ROCm or other CUDA build, use the
   command from [pytorch.org/get-started](https://pytorch.org/get-started/locally/)
   for PyTorch 2.14. Check [GPU requirements](#gpu-requirements) first.
3. Install `nodetool-core` and the packs from PyPI in one command, so pip
   resolves their shared dependencies together:

   ```bash
   pip install nodetool-core nodetool-huggingface   # add nodetool-mlx on Apple Silicon
   ```

   The MLX video nodes also need the LTX engine, which is not on PyPI. The
   Package Manager installs it with `nodetool-mlx`. By hand, install the two
   `ltx-*-mlx` requirements listed for the MLX entry in
   [`packages/protocol/src/python-packs.ts`](../packages/protocol/src/python-packs.ts).

4. Start the server so it finds that interpreter:

   ```bash
   NODETOOL_PYTHON="$CONDA_PREFIX/bin/python" nodetool serve
   ```

   On Windows, `NODETOOL_PYTHON` is `%CONDA_PREFIX%\python.exe`. In a venv,
   use `NODETOOL_PYTHON="$VIRTUAL_ENV/bin/python"`, or
   `%VIRTUAL_ENV%\Scripts\python.exe` on Windows. With the conda environment
   named `nodetool` active, the server finds it without the variable.

The server tries `NODETOOL_PYTHON` first. Without it, it uses the active conda
environment when that environment is named `nodetool` or `conda_env`, then the
desktop app's environment and `nodetool` environments under `miniconda3` or
`anaconda3`. The full order is in [Configuration](server-configuration.md#python-nodes).
To check the environment, run `python -c "import nodetool.worker"` in it. With
no match, the server log says `Python not found — Python nodes will not be
available`. When the worker fails to start, the error names the interpreter it
tried.

## GPU requirements

Python nodes run on PyTorch 2.14. Which PyTorch build you get, and so which
cards and drivers work, depends on how you installed Python nodes. Rows marked
*inferred* follow from PyTorch's published platform support and have not been
tested on every card.

**Desktop app.** Before it installs the HuggingFace or MLX pack, the app
detects your GPU and picks the matching PyTorch build:

| Hardware | Build the app installs |
|---|---|
| NVIDIA Turing (RTX 20xx, GTX 16xx) or newer | CUDA 12.8, which needs driver 570 or newer |
| NVIDIA Maxwell, Pascal (GTX 10xx) or Volta | CUDA 12.6 (*inferred*) |
| NVIDIA Kepler and older | CPU. The app logs that the card is too old |
| AMD on Linux, RDNA 2 or newer (RX 6000 and later) | ROCm 7.2 (*inferred*) |
| AMD on Linux, older cards (Polaris, Vega, RDNA 1) | CPU, with a warning |
| AMD on Windows | CPU, with a warning. PyTorch reaches these cards only through DirectML, which has no 2.14 build. llama.cpp still uses the card through Vulkan |
| Intel Arc and Intel integrated graphics (Windows, Linux) | Intel XPU (*inferred*) |
| Apple Silicon, macOS 14 or newer | The PyPI build, which uses Metal (MPS) |
| Intel Mac, or a Mac on macOS 13 or older | None. The HuggingFace and MLX packs are hidden, because PyTorch 2.14 and MLX publish no build for them |

If PyTorch publishes no 2.14 build for the chosen GPU index, the app installs
the CPU build instead and logs a warning. Python nodes then run on the CPU.
After a driver update, install the pack again to retry the GPU build.
Detection runs on every install.

**install.sh.** On Linux, [install.sh](#python-nodes-without-the-desktop-app)
lets uv pick the CUDA, ROCm or Intel XPU build from the installed driver
(`--torch-backend auto`). On macOS it installs the PyPI build, which needs
Apple Silicon and macOS 14 or newer.

**Manual `pip install torch`.** The PyPI build on Linux uses CUDA 13.0, which
needs driver 580 or newer and a Turing or newer card. On a GTX 10xx or with an
older driver, Python nodes fail with a CUDA error. Install a CUDA 12.6 or 12.8
build from [pytorch.org](https://pytorch.org/get-started/locally/) instead, or
set `NODETOOL_TORCH_DEVICE` to `cpu`. PyPI ships only a CPU build for Windows,
so a GPU build on Windows always comes from pytorch.org.

**Docker worker image.** The worker image installs PyPI's CUDA 13.0 build, so
the GPU host needs NVIDIA driver 580 or newer. See
[Worker deployment](worker-deployment.md#worker-images).

llama.cpp and Ollama do not use PyTorch, so these limits do not apply to them.
On a card PyTorch cannot use, they still run on the GPU.

To check what NodeTool sees on NVIDIA, run `nvidia-smi`, the same check behind
**Help → System Information**, and compare the driver version with the table.

### Choose the device

To pick which GPU Python nodes use, set **NODETOOL_TORCH_DEVICE** in Settings
to `cuda`, `cuda:1` (a second card), `mps`, or `cpu`. An unavailable device
logs a warning and falls back to automatic selection. See
[Configuration](server-configuration.md#python-nodes).

## Stored secrets

API keys you paste in **Settings → Models & Providers** are stored encrypted
(AES-256-GCM) in the local database. The encryption key lives in the operating
system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret
Service). The `SECRETS_MASTER_KEY` environment variable overrides it, which is
how a server or container without a keychain stores keys.

From the terminal, the `nodetool` command reads the value from standard input.
Without a server token it writes to the local store, which needs
`SECRETS_MASTER_KEY` set. With `--token` or `NODETOOL_API_TOKEN` it writes to
the server instead.

```bash
printf %s "$OPENAI_API_KEY" | nodetool secrets set OPENAI_API_KEY
nodetool secrets list   # names only, never values
```

See [Settings](configuration.md) and the [CLI Reference](cli.md).
