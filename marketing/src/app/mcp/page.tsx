import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import {
  CAPABILITY_GROUPS,
  CLIENT_ROWS,
  DIRECT_TOOLS,
  MCP_DESCRIPTION,
  MCP_FAQ,
  MCP_LEAD,
  MCP_LIMITS,
  MCP_LINKS,
  MCP_TITLE,
  TRANSPORT_ROWS,
} from "@/data/mcpPage";
import PageUpdated from "@/components/PageUpdated";
import McpSessionMock from "@/components/McpSessionMock";
import McpInstallCommand from "@/components/agents/McpInstallCommand";
import { SurfaceCard, type Surface } from "@/components/agents/AgentSurfaceGrid";

export const metadata: Metadata = {
  title: MCP_TITLE,
  description: MCP_DESCRIPTION,
  alternates: { canonical: "/mcp" },
  openGraph: { title: MCP_TITLE, description: MCP_DESCRIPTION, url: "https://nodetool.ai/mcp", siteName: "NodeTool", type: "website", images: DEFAULT_OG_IMAGES },
  twitter: { card: "summary_large_image", title: MCP_TITLE, description: MCP_DESCRIPTION },
};

const sectionTitle = "max-w-sm text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";
/** Recorded product surface for each capability group, keyed by its title. */
const CAPABILITY_MEDIA: Record<string, { poster: string; clip?: string }> = {
  "Generate media": { poster: "/surface-storyboard-poster.webp", clip: "/surface-storyboard" },
  "Build video": { poster: "/surface-timeline-poster.webp", clip: "/surface-timeline" },
  "Build games": { poster: "/surface-game-poster.webp", clip: "/surface-game" },
  "Edit images": { poster: "/surface-sketch-poster.webp", clip: "/surface-sketch" },
  "Run workflows": { poster: "/surface-nodes-poster.webp", clip: "/surface-nodes" },
  "Keep the files": { poster: "/screen_assets.webp" },
};

const CAPABILITY_CARDS: Surface[] = CAPABILITY_GROUPS.map((group) => ({
  title: group.title,
  body: group.body,
  ...CAPABILITY_MEDIA[group.title],
}));

const codeBlock = "overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-100";

export default function McpPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <section className="mb-16 grid items-center gap-12 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-5 text-base font-medium text-cyan-200">Creative MCP server</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">Give your coding agent a creative studio.</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">{MCP_LEAD}</p>
              <div className="mt-8 max-w-xl">
                <McpInstallCommand placement="mcp-hero" />
              </div>
              <p className="mt-3 text-sm text-slate-400">Needs Node.js 22 or later. Restart your client, then ask it to use NodeTool.</p>
            </div>
            <div className="min-w-0">
              <McpSessionMock />
            </div>
          </section>

          <section aria-labelledby="clients-title" className="mt-16 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="clients-title" className={sectionTitle}>Works with your client</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {CLIENT_ROWS.map((row) => (
                <li key={row.client} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                  <h3 className="text-lg font-medium">{row.client}</h3>
                  <p className={`mt-1 text-sm ${bodyText}`}>{row.setup}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="can-title" className="mt-24 border-t border-slate-700 pt-12">
            <div className="mb-10 max-w-2xl">
              <h2 id="can-title" className="text-3xl font-semibold tracking-tight md:text-4xl">What your agent can do</h2>
              <p className={`mt-4 ${bodyText}`}>Everything lands in your NodeTool project, so you open the agent&apos;s work in Studio and keep editing it.</p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITY_CARDS.map((card) => (
                <SurfaceCard key={card.title} surface={card} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="tools-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="tools-title" className={sectionTitle}>Tools, resources, and prompts</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>The server registers a short list of direct tools. Two resources, nodetool://capabilities and nodetool://sandbox, describe the rest. Each skill is an MCP prompt, so Claude Code shows it as a slash command.</p>
            </div>
            <div className="min-w-0 max-w-2xl overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
              <p className="border-b border-slate-800 px-5 py-3 font-jetbrains text-xs text-slate-400">tools/list</p>
              <dl className="space-y-4 break-words p-5">
                {DIRECT_TOOLS.map((tool) => (
                  <div key={tool.name} className="grid gap-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
                    <dt className="font-jetbrains text-sm text-cyan-200">{tool.name}</dt>
                    <dd className="text-sm leading-relaxed text-slate-300">{tool.purpose}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section aria-labelledby="transport-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="transport-title" className={sectionTitle}>With or without Studio</h2>
            <div className="min-w-0 max-w-2xl">
              <dl className="space-y-5">
                {TRANSPORT_ROWS.map((row) => (
                  <div key={row.mode}>
                    <dt className="text-lg font-medium">{row.mode}</dt>
                    <dd className={`mt-1 ${bodyText}`}>{row.detail}</dd>
                  </div>
                ))}
              </dl>
              <p className={`mt-8 ${bodyText}`}>Store provider keys once:</p>
              <pre className={`mt-3 ${codeBlock}`}><code>{"nodetool secrets store FAL_API_KEY\nnodetool secrets store OPENAI_API_KEY"}</code></pre>
            </div>
          </section>

          <section aria-labelledby="limits-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="limits-title" className={sectionTitle}>Good to know</h2>
            <ul className="max-w-2xl list-disc space-y-2 pl-5 text-slate-300">
              {MCP_LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </section>

          <FaqSection items={MCP_FAQ} heading="Questions about the MCP server" className="mt-24 max-w-3xl" id="mcp-faq" />

          <nav aria-labelledby="mcp-links-title" className="mt-16 max-w-3xl">
            <h2 id="mcp-links-title" className="text-xl font-semibold">Read more</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {MCP_LINKS.map((link) => (
                <li key={link.href}><a href={link.href} className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
          <PageUpdated route="/mcp" className="text-sm text-slate-400" />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "MCP server", url: "/mcp" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
