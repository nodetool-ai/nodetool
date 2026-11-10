---
title: "NodeTool Studio"
description: "The local-first, agent-first NodeTool desktop application."
canonical: https://nodetool.ai/studio
markdown: https://nodetool.ai/studio.md
product: NodeTool
---
# NodeTool Studio

NodeTool Studio is the free desktop edition of NodeTool for macOS, Windows, and Linux.

## Your projects stay on your computer

Studio keeps the project on your computer. It only goes online when you use an online AI provider or service.

- **Project files**: Studio stores the workspace, workflows, and media on your machine. You choose where those files live and when to move them.
- **Supported local models**: Use supported language and image models through Ollama, MLX, llama.cpp, vLLM, or LM Studio. Which models you can run locally depends on your computer’s hardware.
- **Online AI providers**: Connect your own provider accounts when a hosted model fits the job. Those requests need a network connection and are handled under the provider's terms.
- **Offline work**: Studio can work without a network when the project uses local files and supported local models. Remote providers, downloads, and online services still need a connection.

## Start with the setup you have

You do not need a powerful computer. Running AI models on your own machine is optional.

- **Desktop platforms**: Studio is available for macOS, Windows, and Linux.
- **Graphics hardware**: A dedicated GPU is optional when you use hosted providers. It matters when you choose to run larger models locally.
- **Model downloads**: Use Studio with your provider accounts, or download supported models to run locally.

## Questions

### Studio or Cloud — which should I use?

Choose **Studio** for ongoing work: it saves projects on your computer and supports online providers and local models on macOS, Windows and Linux. Choose **Cloud** to try NodeTool in your browser without installing it. Cloud is in alpha, and project transfer between editions is not yet complete. Check that the files and features you need transfer correctly.

### Is NodeTool local-first and private?

NodeTool Studio stores the workspace, workflows, files, and configured credentials on your machine. Supported open-weight models can run locally through MLX, Ollama, llama.cpp, vLLM, and LM Studio. When you call a hosted model, the request leaves your machine for that provider. Cloud uses hosted project storage; review the current [privacy policy](/privacy) and [terms](/terms) before using sensitive material.

### Do I need a GPU to run NodeTool?

No. Studio can use hosted providers, where the model runs on the provider's hardware. A GPU matters only when you choose to run supported open-weight models on your computer. The requirement then depends on the model and runtime; smaller models may run on CPU at lower speed.

### Does Studio work without an internet connection?

Studio can keep working without a network when the project uses local files and supported local models already installed on the machine. Remote providers, model downloads, online documentation, and other hosted services still require a connection.

See the [installation guide](https://docs.nodetool.ai/installation.md) for supported platforms and setup.
