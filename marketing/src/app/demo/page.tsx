import type { Metadata } from "next";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import JsonLd from "../../components/JsonLd";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingPageShell from "../../components/MarketingPageShell";
import NodeEditorDemo from "../../components/NodeEditorDemo";
import TimelineEditorDemo from "../../components/TimelineEditorDemo";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

const TITLE = "Try NodeTool in your browser: timeline and node editor demos";
const DESCRIPTION =
  "Open NodeTool's real timeline editor and node editor in your browser. No download, no sign-in. The node editor runs with sample results, and nothing is saved.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/demo" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/demo",
    siteName: "NodeTool",
    type: "website",
    images: DEFAULT_OG_IMAGES,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const DEMOS = [
  {
    href: "#try-the-timeline",
    name: "Timeline editor",
    body: "Open a finished film on Studio's timeline. Play it, scrub, zoom the tracks, and select a layer.",
  },
  {
    href: "#try-the-node-editor",
    name: "Node editor",
    body: "Edit a prompt, rewire an image-to-video graph, add nodes from the menu, and press Run.",
  },
] as const;

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring sm:w-auto";

export default function DemoPage() {
  return (
    <MarketingPageShell>
      <JsonLd data={breadcrumbSchema([{ name: "Demo", url: "/demo" }])} />
      <section aria-labelledby="demo-title" className="mx-auto max-w-7xl px-6 pt-12 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            Live demo
          </p>
          <h1
            id="demo-title"
            className="mt-3 text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-6xl"
          >
            Try NodeTool in your browser.
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-slate-300">
            Both editors below are the ones in the app, built to run on this
            page. No download and no sign-in. Nothing you change is saved.
          </p>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {DEMOS.map((demo) => (
            <li key={demo.href} className="list-none">
              <a
                href={demo.href}
                className="block h-full rounded-2xl border border-slate-700 bg-slate-900/60 p-5 transition-colors hover:border-slate-500 hover:bg-slate-800/60 focus-ring"
              >
                <span className="block text-base font-semibold text-slate-100">{demo.name}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-400">{demo.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <TimelineEditorDemo />
      <NodeEditorDemo />

      <MarketingClosingAction
        headingId="demo-next-title"
        title="Make your own project."
        body="The demos can't call models or keep your edits. Studio runs on your computer with local models or your own provider keys. The browser version is in alpha."
        primaryAction={
          <SmartDownloadButton
            labelPrefix="Download"
            icon={<Download className="h-5 w-5" />}
            classNameOverride={primaryButtonClass}
          />
        }
        secondaryAction={{ href: "https://app.nodetool.ai", label: "Open the browser version", external: true, event: "Try Cloud" }}
      />
    </MarketingPageShell>
  );
}
