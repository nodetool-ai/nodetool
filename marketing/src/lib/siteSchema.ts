import type { JsonLdObject } from "./jsonld";

/**
 * Structured data that is true of the whole site, emitted once from the root
 * layout: what the product is, and who publishes it.
 *
 * Page-scoped schema does not belong here. `FAQPage` in particular must sit on
 * the page whose visible text it repeats — the home page emits its own from
 * the FAQ block it renders (see `components/FaqSection.tsx`).
 */

export const softwareApplicationSchema: JsonLdObject = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "NodeTool",
  description:
    "NodeTool is an open-source creative AI workspace. Create and edit images, video, audio, and text with agents that work alongside you. Let them build and revise workflows, then inspect and edit the results yourself. Your project keeps the brief, assets, and edits together. Studio runs on macOS, Windows, and Linux. Cloud is the hosted browser edition, in alpha.",
  applicationCategory: "MultimediaApplication",
  applicationSubCategory: "Creative AI Workspace",
  operatingSystem: "macOS, Windows, Linux",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  url: "https://nodetool.ai",
  downloadUrl: "https://github.com/nodetool-ai/nodetool/releases",
  softwareVersion: "1.0",
  author: {
    "@type": "Organization",
    name: "NodeTool",
    url: "https://nodetool.ai",
  },
  screenshot: "https://nodetool.ai/preview.png",
  featureList: [
    "Agent-first: every editor is exposed to agents as tools, around 120 in all",
    "Agents plan, build, run, and repair workflows on the same surfaces you use",
    "The full agent toolbelt speaks MCP, so Claude Desktop and Claude Code can drive NodeTool",
    "One visual canvas for image, video, audio, and text",
    "Bring your own keys to every major provider: FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace",
    "Pay providers directly at provider prices, no credits, no markup",
    "Editing tools built in: masks, inpaint, outpaint, relight, upscale, layers, compositing",
    "Storyboard a film shot by shot: approve cheap stills before paying to render clips, then assemble the cut",
    "Script editor: cast a voice per speaker, audition takes, send the voiced lines to a timeline",
    "App builder: wrap a workflow in a screen of widgets and publish it as a mini app",
    "JS scripts: named, versioned JavaScript documents with ports, tests, and a sandbox",
    "The latest models under their real names: Flux, Seedance, Wan, Veo, Kling, Hailuo, Whisper, ElevenLabs, Suno",
    "Run models locally via MLX, Ollama, llama.cpp, vLLM, and LM Studio",
    "Two editions on one open-source codebase: Studio (desktop) and Cloud (browser)",
    "Results appear live as each step finishes",
    "Workflows, files, and keys belong to you, on your machine or in your browser",
    "AGPL-3.0 open source, self-host any time",
  ],
  softwareRequirements: "Node.js 22+ (Python 3.11+ optional, for Python nodes)",
  installUrl: "https://github.com/nodetool-ai/nodetool",
  license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
  sameAs: ["https://github.com/nodetool-ai/nodetool"],
};

export const organizationSchema: JsonLdObject = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "NodeTool",
  url: "https://nodetool.ai",
  logo: "https://nodetool.ai/logo.png",
  sameAs: [
    "https://github.com/nodetool-ai/nodetool",
    "https://discord.gg/WmQTWZRcYE",
  ],
  description:
    "NodeTool is an open-source creative AI workspace. Create and edit images, video, audio, and text with agents that work alongside you. Let them build and revise workflows, then inspect and edit the results yourself. Your project keeps the brief, assets, and edits together. Studio runs on macOS, Windows, and Linux. Cloud is the hosted browser edition, in alpha.",
};

/** The demo video on the home page. Emitted by the page that shows it. */
export const demoVideoSchema: JsonLdObject = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "NodeTool | Open-source creative AI workspace (demo)",
  description:
    "A trailer built end to end in NodeTool: the agent drafts the script, boards the shots, generates the footage, and cuts the timeline — on one canvas, with your own keys.",
  thumbnailUrl: "https://nodetool.ai/preview.png",
  contentUrl: "https://nodetool.ai/demo.mp4",
  uploadDate: "2026-01-01",
  publisher: {
    "@type": "Organization",
    name: "NodeTool",
    logo: {
      "@type": "ImageObject",
      url: "https://nodetool.ai/logo.png",
    },
  },
};
