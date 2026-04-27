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
  title: "NodeTool: Node-Based Visual Builder for AI Workflows and LLM Agents",
  description:
    "NodeTool is an open-source visual programming tool for building AI workflows. Run locally on macOS, Windows, or Linux. Connect LLMs, create RAG systems, build AI agents, and process multimodal content through a drag-and-drop node interface. Alternative to ComfyUI for general AI and n8n for AI-specific automation.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "AI workflow builder",
    "node-based AI tool",
    "visual programming AI",
    "LLM agent builder",
    "local AI development",
    "RAG pipeline tool",
    "multimodal AI",
    "ComfyUI alternative",
    "n8n for AI",
    "open source AI tool",
    "local-first AI",
    "AI orchestration",
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
    title: "NodeTool: Visual Builder for AI Workflows and LLM Agents",
    description:
      "Open-source node-based tool for building AI workflows. Runs locally on macOS, Windows, Linux. Create LLM agents, RAG systems, and multimodal pipelines with drag-and-drop nodes.",
    url: "https://nodetool.ai",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool - Visual AI Workflow Builder",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool: Visual AI Workflow Builder",
    description:
      "Open-source node-based tool for AI development. Build LLM agents, RAG systems, and multimodal workflows locally on your machine.",
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
              "description": "NodeTool is a node-based visual programming tool for building AI workflows and applications. It allows developers to create LLM agents, RAG systems, and multimodal content pipelines by connecting nodes in a drag-and-drop interface. Runs locally on user's machine with support for cloud APIs.",
              "applicationCategory": "DeveloperApplication",
              "applicationSubCategory": "AI Development Tool",
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
                "Node-based visual interface for AI workflow orchestration",
                "Local execution engine running on macOS, Windows, and Linux",
                "Support for local LLMs via Ollama, MLX, and GGML/GGUF formats",
                "Integration with OpenAI, Anthropic, Replicate, and Hugging Face APIs",
                "Multimodal processing: text, images, video, and audio",
                "RAG (Retrieval-Augmented Generation) pipeline builder",
                "Vector database integration for semantic search",
                "AI agent framework with tool use and web browsing",
                "Type-safe node connections",
                "Real-time workflow execution with live output preview",
                "Python-based backend with extensibility via custom nodes",
                "Open source with TypeScript frontend"
              ],
              "softwareRequirements": "Python 3.10 or higher",
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
              "description": "NodeTool is an open-source visual programming tool for AI development. It provides a node-based interface for building LLM agents, RAG systems, and multimodal AI workflows that run locally on user machines."
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
                    "text": "NodeTool is a node-based visual programming tool for building AI workflows and applications. It runs locally on macOS, Windows, and Linux, allowing developers to create LLM agents, RAG systems, and multimodal content pipelines by connecting nodes in a drag-and-drop interface."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from ComfyUI?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "ComfyUI focuses on image generation workflows with Stable Diffusion. NodeTool extends this node-based concept to general AI workflows including LLM agents, text processing, RAG systems, audio, and video generation."
                  }
                },
                {
                  "@type": "Question",
                  "name": "How is NodeTool different from n8n?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "n8n is a general workflow automation tool for business processes and API integrations. NodeTool is specialized for AI workloads with native support for model management, local LLMs, multimodal AI operations, and RAG pipelines."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Does NodeTool require cloud services?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "No. NodeTool runs entirely on your local machine and can work with local LLMs via Ollama, MLX, or GGML/GGUF formats. Cloud APIs (OpenAI, Anthropic, etc.) are optional and can be used when needed."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What AI models does NodeTool support?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "NodeTool supports local LLMs via Ollama, MLX (Apple Silicon), and GGML/GGUF formats. It also integrates with cloud APIs including OpenAI, Anthropic Claude, Replicate, Hugging Face, and custom API endpoints."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Who should use NodeTool?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "NodeTool is for AI developers building LLM applications, creative professionals working with generative AI, data engineers creating RAG pipelines, researchers prototyping multimodal AI systems, and teams requiring local-first AI for privacy or compliance."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Is NodeTool open source?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Yes. NodeTool is open source with a Python backend and TypeScript frontend. The source code is available on GitHub and the tool is extensible via custom Python nodes."
                  }
                }
              ]
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
