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
    "NodeTool is an open-source agent-first creative workspace. Create and edit images, video, audio, and text with agents that work alongside you. Describe what you want, let the agent build it, then take over whenever you like. You get an editable project, not just a finished file: your workflows, assets, and edits stay together. Studio runs on macOS, Windows, and Linux. Cloud is the hosted browser edition, in alpha.",
  applicationCategory: "MultimediaApplication",
  applicationSubCategory: "Agent-First Creative Workspace",
  operatingSystem: "macOS, Windows, Linux",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  url: "https://nodetool.ai",
  downloadUrl: "https://github.com/nodetool-ai/nodetool/releases",
  author: {
    "@type": "Organization",
    name: "NodeTool",
    url: "https://nodetool.ai",
  },
  screenshot: "https://nodetool.ai/preview.png",
  featureList: [
    "Agent-first: every editor is exposed to agents as tools",
    "Agents plan, build, run, and repair workflows on the same surfaces you use",
    "MCP server for Claude Code, Codex, OpenCode, and Cursor: one install command, the same tools the built-in agent uses",
    "Built-in 2D and 3D game engine: agents create, edit, playtest, and export games that stay editable in the Game Editor",
    "Multi-track video timeline with clips, transitions, captions, keyframes, takes, and MP4, WebM, or PNG-sequence export",
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
  softwareRequirements:
    "Studio: macOS, Windows, or Linux. A GPU is needed only to run models locally. The MCP server and CLI need Node.js 22 or later.",
  installUrl: "https://github.com/nodetool-ai/nodetool",
  license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE.txt",
  sameAs: [
    "https://github.com/nodetool-ai/nodetool",
    "https://docs.nodetool.ai",
    "https://www.npmjs.com/package/@nodetool-ai/cli",
  ],
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
    "NodeTool is an open-source agent-first creative workspace. Create and edit images, video, audio, and text with agents that work alongside you. Describe what you want, let the agent build it, then take over whenever you like. You get an editable project, not just a finished file: your workflows, assets, and edits stay together. Studio runs on macOS, Windows, and Linux. Cloud is the hosted browser edition, in alpha.",
};

/** Names the site itself, so the publisher and the product resolve to one entity. */
export const webSiteSchema: JsonLdObject = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "NodeTool",
  url: "https://nodetool.ai",
  description:
    "Website of NodeTool, the open-source agent-first creative workspace for images, video, storyboards, timelines, and games.",
  publisher: { "@type": "Organization", name: "NodeTool", url: "https://nodetool.ai" },
};

/** The demo video on the home page. Emitted by the page that shows it. */
export const demoVideoSchema: JsonLdObject = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "NodeTool | Open-source agent-first creative workspace (demo)",
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
