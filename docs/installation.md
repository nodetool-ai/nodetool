---
layout: page
title: "Installing NodeTool"
---

NodeTool includes a small setup process the first time you run it. Follow these steps to get started.

## Download the installer

1. Visit [nodetool.ai](https://nodetool.ai) and download the build for Windows, macOS, or Linux.
2. Run the downloaded file to start NodeTool.

## How the Installer Works

When you first launch NodeTool, the installer automatically sets up a Python environment that powers all workflow execution. Here's what happens behind the scenes:

**Python Environment Setup:**
- NodeTool takes care of setting up the Python environment for you—no tech skills needed.
- You'll simply choose where you want it installed (or go with the suggested spot).

**What Gets Installed:**
- **Python runtime** with all required dependencies
- **Ollama** - for running local language models
- **llama.cpp** - optimized inference engine (CUDA-enabled on Windows/Linux, CPU-only on macOS)
- **Python packages** - all NodeTool dependencies are installed via pip

## Choose where to install

When NodeTool starts it asks where to keep its Python environment. You can:

- **Use the default location** – recommended for most users.
- **Pick a custom folder** – choose any folder with enough free space (about 20 GB is a good idea).

Select your preferred option to continue.

The Python environment may reach 15–25 GB depending on which models you install. Use a fast disk (SSD recommended).

## Select extra packages

Next you can choose optional features such as cloud AI services, document tools, and audio or image processing. Tick the boxes you need now. You can add more later.

## Let NodeTool download the files

After you click **Install**, NodeTool downloads and unpacks everything it needs. This may take a few minutes depending on your connection. Progress is shown onscreen.

Once the download completes, NodeTool opens automatically and you can start building workflows.

On first run, the Web UI opens in your browser or desktop app. If macOS or Windows asks for firewall permission, approve it so the local backend can run.
