import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

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
  title: "NodeTool — The open creative AI workspace",
  description:
    "NodeTool is the open-source creative AI workspace — every major model from every major provider, called with your own keys, wired into one node-based canvas you run on your machine or in the browser. Pay providers directly. No credits, no markup, no lock-in.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "creative AI workspace",
    "open source creative AI",
    "BYOK AI canvas",
    "AI workflow canvas",
    "ComfyUI alternative",
    "Weavy alternative",
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
    title: "NodeTool — The open creative AI workspace",
    description:
      "Every major model from every major provider, called with your own keys, wired into one node-based canvas. Image, video, audio, and text in one place. Open source. Your own keys. Provider prices.",
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
    title: "NodeTool — The open creative AI workspace",
    description:
      "Every model. Your keys. Your canvas. The open-source creative AI workspace — bring your own keys to every major provider and pay provider prices.",
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
              "description": "NodeTool is the open-source creative AI workspace — every major model from every major provider, called with your own keys, wired into one node-based canvas. Image, video, audio, and text on one surface, with masks, inpaint, outpaint, relight, upscale, and compositing built in. Runs as a desktop app on macOS, Windows, and Linux, or in the browser via NodeTool Cloud.",
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
                "Node-based creative canvas for image, video, audio, and text",
                "Bring your own keys to every major provider: FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace",
                "Pay providers directly at provider prices, no credits, no markup",
                "Editing tools built in: masks, inpaint, outpaint, relight, upscale, layers, compositing",
                "The latest models under their real names: Flux, Seedance, Wan, Veo, Kling, Hailuo, Whisper, ElevenLabs, Suno",
                "Run models locally via MLX, Ollama, llama.cpp, vLLM, and LM Studio",
                "Two editions on one open-source codebase: Studio (desktop) and Cloud (browser)",
                "Streaming execution with live output as nodes finish",
                "Workflows, files, and keys belong to you — runs on your machine or browser",
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
              "description": "NodeTool builds the open creative AI workspace: a node-based canvas that connects every major model from every major provider with the user's own keys, available as a desktop app and as a browser-based managed edition."
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
                    "text": "NodeTool is the open-source creative AI workspace. Every major model from every major provider — FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more — is called with your own keys and wired into one node-based canvas. Image, video, audio, and text live on the same surface, with editing tools like masks, inpaint, outpaint, relight, upscale, layers, and compositing built in. Runs as a desktop app on macOS, Windows, and Linux, or in the browser via NodeTool Cloud."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from ComfyUI?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "ComfyUI is a Stable Diffusion power tool built for engineers. NodeTool is the full creative workspace — image, video, audio, and text on one canvas, with the editing tools creatives actually use. NodeTool also supports far more models across providers and media types, called with your own keys at provider prices."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from Weavy or other closed SaaS canvases?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Closed canvases lock you into a credit system and a hand-picked list of models. NodeTool is open source. You bring your own API keys to every provider, pay providers directly at provider prices, and own your workflows and files. Cloud is just our managed hosting of the same open-source code you can run yourself."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How does pricing work?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "NodeTool Studio is free to download and use. NodeTool Cloud is a subscription for managed hosting. In both editions, you bring your own API keys to every provider and pay those providers directly at their list prices. NodeTool does not run models for you on its own servers, does not issue its own credits, and does not mark up model calls."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What models does NodeTool support?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "The latest models, including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno, called through providers like FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Models can also run on your own machine via MLX, Ollama, llama.cpp, vLLM, and LM Studio."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Who is NodeTool for?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Independent generative artists, motion designers, AI-native illustrators, technical art directors, ComfyUI power users frustrated with the UX, and small creative studios, brand teams, and post-production shops working with AI every day."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Is NodeTool open source?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Yes. Both Studio and Cloud share the same AGPL-3.0 codebase. There is no closed-source layer and no \"pro tier\" hiding the good features. You can self-host any time."
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
                "A walkthrough of NodeTool: wiring image, video, audio, and text models from every major provider into one node-based canvas, called with your own keys.",
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
