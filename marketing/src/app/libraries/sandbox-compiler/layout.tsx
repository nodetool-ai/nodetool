import type { Metadata, Viewport } from "next";
import JsonLd from "../../../components/JsonLd";

const URL_PATH = "/libraries/sandbox-compiler";

export const metadata: Metadata = {
  title: "@nodetool-ai/sandbox-compiler | Will This npm Package Run in QuickJS? | NodeTool",
  description:
    "An MIT-licensed TypeScript library that bundles an npm package with esbuild, scans it for globals a QuickJS guest lacks, and imports it in an empty QuickJS context. Named results and a content-addressed cache.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: URL_PATH,
  },
  keywords: [
    "QuickJS",
    "QuickJS npm packages",
    "JavaScript sandbox",
    "esbuild",
    "untrusted JavaScript",
    "LLM code execution sandbox",
    "acorn scope analysis",
  ],
  openGraph: {
    title: "@nodetool-ai/sandbox-compiler: will this npm package run in QuickJS?",
    description:
      "Bundle, scan, and probe an npm package for a QuickJS guest. MIT licensed.",
    url: `https://nodetool.ai${URL_PATH}`,
    siteName: "NodeTool",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "@nodetool-ai/sandbox-compiler",
    description:
      "Bundle, scan, and probe an npm package for a QuickJS guest. MIT licensed.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function SandboxCompilerLibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: "@nodetool-ai/sandbox-compiler",
          description:
            "TypeScript library that bundles an npm package with esbuild, scans the bundle for globals a QuickJS guest lacks, and probes it in a capability-free QuickJS context.",
          codeRepository:
            "https://github.com/nodetool-ai/nodetool/tree/main/packages/sandbox-compiler",
          programmingLanguage: "TypeScript",
          runtimePlatform: "Node.js",
          license: "https://opensource.org/licenses/MIT",
          url: `https://nodetool.ai${URL_PATH}`,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "@nodetool-ai/sandbox-compiler", item: `https://nodetool.ai${URL_PATH}` },
          ],
        }}
      />
      {children}
    </>
  );
}
