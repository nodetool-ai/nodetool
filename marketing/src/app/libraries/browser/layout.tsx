import type { Metadata, Viewport } from "next";
import JsonLd from "../../../components/JsonLd";

const URL_PATH = "/libraries/browser";

export const metadata: Metadata = {
  title: "@nodetool-ai/browser | Drive Your Signed-In Chrome over CDP | NodeTool",
  description:
    "An MIT-licensed TypeScript library that drives one Chrome page over the DevTools Protocol, either headless or in the tab you are already signed in to through a Chrome extension relay. Numbered elements, Zod schemas, plain data.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: URL_PATH,
  },
  keywords: [
    "Chrome DevTools Protocol",
    "CDP library",
    "browser automation TypeScript",
    "AI agent browser",
    "Chrome extension native messaging",
    "headless Chrome alternative",
    "browser use",
  ],
  openGraph: {
    title: "@nodetool-ai/browser: drive the Chrome you are already signed in to",
    description:
      "One CDP action loop for a headless Chrome or your own signed-in tab. MIT licensed.",
    url: `https://nodetool.ai${URL_PATH}`,
    siteName: "NodeTool",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "@nodetool-ai/browser",
    description:
      "Drive one Chrome page over CDP, headless or in your own signed-in tab. MIT licensed.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function BrowserLibraryLayout({
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
          name: "@nodetool-ai/browser",
          description:
            "TypeScript library that drives one Chrome page over the Chrome DevTools Protocol, headless or through a Chrome extension relay into the user's signed-in browser.",
          codeRepository:
            "https://github.com/nodetool-ai/nodetool/tree/main/packages/browser",
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
            { "@type": "ListItem", position: 2, name: "@nodetool-ai/browser", item: `https://nodetool.ai${URL_PATH}` },
          ],
        }}
      />
      {children}
    </>
  );
}
