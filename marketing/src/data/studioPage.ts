import type { MarketingFact } from "@/components/MarketingFacts";

/** Copy for /studio, shared by the page and its Markdown mirror (scripts/generate-llms-txt.mjs). */

export const STUDIO_PROJECT =
  "The agent can draft the storyboard and edit the clips into a video. The result is a NodeTool project, so you can make the next change yourself in an editor or ask the agent to make it.";

export const OWNERSHIP_FACTS: MarketingFact[] = [
  {
    term: "Project files",
    description:
      "Studio stores the workspace, workflows, and media on your machine. You choose where those files live and when to move them.",
  },
  {
    term: "Supported local models",
    description:
      "Use supported language and image models through Ollama, MLX, llama.cpp, vLLM, or LM Studio. Local capability depends on the model and your hardware.",
  },
  {
    term: "Online AI providers",
    description:
      "Connect your own provider accounts when a hosted model fits the job. Those requests need a network connection and are handled under the provider's terms.",
  },
  {
    term: "Offline work",
    description:
      "Studio can work without a network when the project uses local files and supported local models. Remote providers, downloads, and online services still need a connection.",
  },
];

export const SETUP_FACTS: MarketingFact[] = [
  {
    term: "Desktop platforms",
    description: "Studio is available for macOS, Windows, and Linux.",
  },
  {
    term: "Graphics hardware",
    description:
      "A dedicated GPU is optional when you use hosted providers. It matters when you choose to run larger models locally.",
  },
  {
    term: "Model downloads",
    description:
      "The desktop app does not require a local model collection. Download only the supported models you plan to run on your machine.",
  },
];

