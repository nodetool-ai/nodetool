---
title: "NodeTool Studio"
description: "The local-first, agent-first NodeTool desktop application."
canonical: https://nodetool.ai/studio
markdown: https://nodetool.ai/studio.md
product: NodeTool
---
# NodeTool Studio

NodeTool Studio is the free desktop edition of NodeTool for macOS, Windows, and Linux.

## A brief becomes a project you can reopen

The agent can draft the storyboard and edit the clips into a video. The result is a NodeTool project, so you can make the next change yourself in an editor or ask the agent to make it.

## Your files. Your models. Your keys.

Studio keeps the project on your computer. It only goes online when you use an online AI provider or service.

- **Project files**: Studio stores the workspace, workflows, and media on your machine. You choose where those files live and when to move them.
- **Supported local models**: Use supported language and image models through Ollama, MLX, llama.cpp, vLLM, or LM Studio. Local capability depends on the model and your hardware.
- **Online AI providers**: Connect your own provider accounts when a hosted model fits the job. Those requests need a network connection and are handled under the provider's terms.
- **Offline work**: Studio can work without a network when the project uses local files and supported local models. Remote providers, downloads, and online services still need a connection.

## Start with the setup you have

You do not need a powerful computer. Running AI models on your own machine is optional.

- **Desktop platforms**: Studio is available for macOS, Windows, and Linux.
- **Graphics hardware**: A dedicated GPU is optional when you use hosted providers. It matters when you choose to run larger models locally.
- **Model downloads**: The desktop app does not require a local model collection. Download only the supported models you plan to run on your machine.

## Questions

### What does "bring your own keys" mean for me?

It means you connect your own provider accounts and pay each provider directly at its published price. NodeTool does not add a credit system or a provider-price markup. The provider still receives the requests you send to its models. You will sometimes see this written as **BYOK**.

### Can I use my ChatGPT, Claude, or Gemini subscription?

Yes, in Studio. Sign in with ChatGPT or Claude, and the agent runs on that subscription instead of an API key. With the [NodeTool Chrome extension](https://docs.nodetool.ai/chrome-extension), NodeTool also uses the ChatGPT or Gemini tab you are signed in to: ChatGPT generates images, and Gemini runs chat, images, and video. Those runs count against your plan's limits, so you get no pay-per-call bill for them. Every run shows up in your ChatGPT or Gemini history.

### Studio or Cloud — which should I use?

Use Studio for real projects. It is the desktop app for macOS, Windows, and Linux. It works with online AI providers without a graphics card, and it can run supported AI models on your own computer if the hardware is strong enough. Cloud runs in your web browser and is in alpha, an early test version, so use it to try NodeTool. Moving projects between Cloud and Studio may not cover everything during the alpha, so check that the move you need works before you rely on it.

### Is NodeTool local-first and private?

NodeTool Studio stores the workspace, workflows, files, and configured credentials on your machine. Supported open-weight models can run locally through MLX, Ollama, llama.cpp, vLLM, and LM Studio. When you call a hosted model, the request leaves your machine for that provider. Cloud uses hosted project storage; review the current [privacy policy](/privacy) and [terms](/terms) before using sensitive material.

### Do I need a GPU to run NodeTool?

No. Studio can use hosted providers, where the model runs on the provider's hardware. A GPU matters only when you choose to run supported open-weight models on your computer. The requirement then depends on the model and runtime; smaller models may run on CPU at lower speed.

### Does Studio work without an internet connection?

Studio can keep working without a network when the project uses local files and supported local models already installed on the machine. Remote providers, model downloads, online documentation, and other hosted services still require a connection.

See the [installation guide](https://docs.nodetool.ai/installation.md) for supported platforms and setup.
