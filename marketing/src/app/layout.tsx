import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import MotionProvider from "../components/MotionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "NodeTool — The agent-first creative workspace",
  description:
    "NodeTool is the open-source, agent-first creative workspace. Every editor — canvas, sketch pad, storyboard, timeline, app builder — is exposed to agents as tools: say what you want and the agent builds the workflow and runs it across every major model, using your own keys. You pay providers directly: no credits, no markup, no lock-in.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "agent-first creative workspace",
    "creative AI workspace",
    "open source creative AI",
    "agents that build workflows",
    "MCP creative tools",
    "BYOK AI canvas",
    "AI workflow canvas",
    "ComfyUI alternative",
    "Weavy alternative",
    "Figma Weave alternative",
    "vendor-neutral AI tool",
    "node-based AI canvas",
    "Flux workflow",
    "Seedance workflow",
    "image video audio AI",
    "model-agnostic AI",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
  openGraph: {
    title: "NodeTool — The agent-first creative workspace",
    description:
      "Every editor is exposed to agents as tools: say what you want and the agent builds the workflow and runs it across every major model, using your own keys. Open source, and you pay provider prices.",
    url: "https://nodetool.ai",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool — the open creative AI workspace",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool — The agent-first creative workspace",
    description:
      "Every model. Your keys. Your agent. The open-source, agent-first creative workspace: an agent builds and runs your workflows across every major provider, at their published prices.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <head>

        {/* JSON-LD Structured Data for SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "NodeTool",
              "description": "NodeTool is the open-source, agent-first creative workspace. Every editor — the node canvas, sketch pad, storyboard, video timeline, script editor, 3D scene, and app builder — is exposed to agents as tools, around 120 in all: say what you want and the agent builds the workflow and runs it across every major model from every major provider, using your own keys. It runs as a desktop app on macOS, Windows, and Linux, or in the browser with NodeTool Cloud.",
              "applicationCategory": "MultimediaApplication",
              "applicationSubCategory": "Creative AI Workspace",
              "operatingSystem": "macOS, Windows, Linux",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "url": "https://nodetool.ai",
              "downloadUrl": "https://github.com/nodetool-ai/nodetool/releases",
              "softwareVersion": "1.0",
              "author": {
                "@type": "Organization",
                "name": "NodeTool",
                "url": "https://nodetool.ai"
              },
              "screenshot": "https://nodetool.ai/preview.png",
              "featureList": [
                "Agent-first: every editor is exposed to agents as tools, around 120 in all",
                "Agents plan, build, run, and repair workflows on the same surfaces you use",
                "The full agent toolbelt speaks MCP, so Claude Desktop and Claude Code can drive NodeTool",
                "One visual canvas for image, video, audio, and text",
                "Bring your own keys to every major provider: FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace",
                "Pay providers directly at provider prices, no credits, no markup",
                "Editing tools built in: masks, inpaint, outpaint, relight, upscale, layers, compositing",
                "The latest models under their real names: Flux, Seedance, Wan, Veo, Kling, Hailuo, Whisper, ElevenLabs, Suno",
                "Run models locally via MLX, Ollama, llama.cpp, vLLM, and LM Studio",
                "Two editions on one open-source codebase: Studio (desktop) and Cloud (browser)",
                "Results appear live as each step finishes",
                "Workflows, files, and keys belong to you, on your machine or in your browser",
                "AGPL-3.0 open source, self-host any time"
              ],
              "softwareRequirements": "Node.js 22+ (Python 3.11+ optional, for Python nodes)",
              "installUrl": "https://github.com/nodetool-ai/nodetool",
              "license": "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
              "sameAs": [
                "https://github.com/nodetool-ai/nodetool"
              ]
            })
          }}
        />

        {/* JSON-LD Structured Data for Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "NodeTool",
              "url": "https://nodetool.ai",
              "logo": "https://nodetool.ai/logo.png",
              "sameAs": [
                "https://github.com/nodetool-ai/nodetool",
                "https://discord.gg/WmQTWZRcYE"
              ],
              "description": "NodeTool builds the open, agent-first creative workspace: every editor is exposed to agents as tools, connecting every major model from every major provider using the user's own keys, available as a desktop app and as a hosted browser edition."
            })
          }}
        />

        {/* JSON-LD Structured Data for FAQPage */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "What is NodeTool?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "NodeTool is the open-source, agent-first creative workspace. Every editor is exposed to agents as tools: say what you want and the agent builds the workflow and runs it across every major model from every major provider (FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more) using your own keys. Image, video, audio, and text live side by side, with editing tools such as masks, inpaint, outpaint, relight, upscale, layers, and compositing built in. It runs as a desktop app on macOS, Windows, and Linux, or in the browser with NodeTool Cloud."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from ComfyUI?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "ComfyUI is a specialist image tool built for engineers. NodeTool is a complete creative workspace: image, video, audio, and text on one canvas, with the editing tools creatives actually use. It also covers far more models, across more providers and media types, using your own keys at provider prices."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from Figma Weave (formerly Weavy) or other closed SaaS canvases?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Closed tools tie you to a credit system and a hand-picked list of models. NodeTool is open source. You bring your own API keys to every provider, pay those providers directly at their published prices, and own your workflows and files. Cloud is simply our hosting of the same open-source code you can run yourself."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How does pricing work?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "NodeTool Studio is free to download and use. NodeTool Cloud is a subscription that covers hosting. In both, you bring your own API keys and pay each provider directly at their list prices. NodeTool does not run models on its own servers, does not issue its own credits, and does not add a markup."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What models does NodeTool support?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The latest models, including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno, reached through providers such as FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Models can also run on your own machine with MLX, Ollama, llama.cpp, vLLM, and LM Studio."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Who is NodeTool for?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Independent artists, motion designers, illustrators, and art directors, along with small creative studios, brand teams, and post-production houses that work with AI every day."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Is NodeTool open source?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Yes. Studio and Cloud are built from the same AGPL-3.0 source. Nothing is held back for a paid tier, and you can host it yourself at any time."
                  }
                }
              ]
            })
          }}
        />

        {/* JSON-LD Structured Data for the homepage demo video */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoObject",
              "name": "NodeTool — the open creative AI workspace (demo)",
              "description":
                "A walkthrough of NodeTool: connecting image, video, audio, and text models from every major provider on one visual canvas, using your own keys.",
              "thumbnailUrl": "https://nodetool.ai/preview.png",
              "contentUrl": "https://nodetool.ai/demo.mp4",
              "uploadDate": "2026-01-01",
              "publisher": {
                "@type": "Organization",
                "name": "NodeTool",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://nodetool.ai/logo.png"
                }
              }
            })
          }}
        />

        <Script
          defer
          data-domain="nodetool.ai"
          src="https://plausible.io/js/script.file-downloads.outbound-links.pageview-props.tagged-events.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-setup" strategy="afterInteractive">
          {`
            window.plausible = window.plausible || function() { 
              (window.plausible.q = window.plausible.q || []).push(arguments) 
            }
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
