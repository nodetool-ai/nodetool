______________________________________________________________________

## layout: default title: Getting Started

Getting Started

Welcome to **NodeTool**! This quick guide shows you how to build your first workflow and discover some handy tips along
the way.

## 1. Install NodeTool

If you haven't already, grab the latest release from [nodetool.ai](https://nodetool.ai) and run the installer. Check out
[Installing NodeTool](installation.md) for full details.

## 2. Install Models

Open NodeTool, which will start up the server and show a setup screen.

1. The screen shows download links for models. We recommend GPT - OSS to enable agentic workflows and Flux for image
   generation. Ensure 20GB+ free disk space.
1. Optional: Use cloud providers. Open Settings to add API keys (OpenAI, Anthropic, Hugging Face, Gemini), and install
   Packs like Replicate, Fal.ai, or ElevenLabs from the Packs menu.

Tip: Your data stays local unless you explicitly use cloud providers. You can also use the "Recommended Models" button
on compatible nodes to quickly pick the right model.

At any time open the Models Manager from the app header. It shows recommended, required, and downloadable models with
README access for Hugging Face models.

## 3. Create a Workflow

1. Click **New Workflow** or click on **Templates** to browse through helpful workflows.
1. Open the NodeMenu with the **Space Key** or double click the canvas. To find nodes, browse the namespaces on the left
   or use the search.

To add nodes, press Space anywhere on the canvas. This opens the Node Menu with search,
namespaces, type filters, and a draggable interface.

1. Right-click the Canvas and create a String Input node. Enter a value.
1. Now drag a connection from the output and drop it on the canvase. A menu pops up and select "Create Preview Node"
1. Hit the **Play Button in the bottom right corner** or press (<kbd>Ctrl + Enter</kbd> | <kbd>⌘ + Enter</kbd>) to run
   the workflow.

If the layout becomes cluttered, open the Layout menu in the top bar and choose “Reset Layout” to restore the default
Dockview workspace.

## 4. Explore More Features

- **Use local models** for maximum privacy or connect to cloud providers when you need extra power.
- **Index your own documents** and ask questions about them with Retrieval-Augmented Generation.
- **Run any node or workflow from the chat** and use any support LLM locally or from a cloud provider.

## 5. Next Steps

Browse the other pages in this documentation to dive deeper. Join our [Discord community](https://discord.gg/26m5xBwe)
to share tips and get help.
