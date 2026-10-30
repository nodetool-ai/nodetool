import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import GameShowcase from "../../components/GameShowcase";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { breadcrumbSchema } from "@/lib/jsonld";
import {
  AGENT_STEPS,
  ASSET_KINDS,
  ASSET_NOTES,
  ASSETS_LEAD,
  EDITOR_POINTS,
  ENGINE_NOTE,
  GAMEDEV_DESCRIPTION,
  GAMEDEV_FAQ,
  GAMEDEV_LEAD,
  GAMEDEV_LINKS,
  GAMEDEV_TITLE,
  LIMITS,
  LIMITS_SUMMARY,
  MCP_INSTALL_COMMAND,
  PROCESS_STEPS,
  SPEC_ROWS,
} from "@/data/gamedevPage";
import PageUpdated from "@/components/PageUpdated";

export const metadata: Metadata = {
  title: GAMEDEV_TITLE,
  description: GAMEDEV_DESCRIPTION,
  alternates: { canonical: "/gamedev" },
  openGraph: { title: GAMEDEV_TITLE, description: GAMEDEV_DESCRIPTION, url: "https://nodetool.ai/gamedev", siteName: "NodeTool", type: "website", images: [{ url: "/games/kindle/poster.jpg", width: 1280, height: 720, alt: "Kindle, a platform adventure built in NodeTool" }] },
  twitter: { card: "summary_large_image", title: GAMEDEV_TITLE, description: GAMEDEV_DESCRIPTION, images: ["/games/kindle/poster.jpg"] }
};

const sectionTitle = "max-w-sm text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";
const inlineLink = "focus-ring rounded font-medium text-cyan-200 underline underline-offset-2 hover:text-cyan-100";

export default function GameDevelopmentPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <section className="mb-16 grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <p className="mb-5 text-base font-medium text-cyan-200">Open-source AI game engine</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Build a game with an agent. Keep editing it yourself.</h1>
            </div>
            <div className="max-w-lg">
              <p className="text-lg leading-relaxed text-slate-300">{GAMEDEV_LEAD}</p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <SmartDownloadButton icon={<Download className="h-4 w-4" aria-hidden="true" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100" />
                <a href="#example-games" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">Play the examples</a>
              </div>
            </div>
          </section>

          <GameShowcase />

          <section aria-labelledby="agent-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="agent-title" className={sectionTitle}>What the agent can do</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>The built-in agent and external agents use the same game tools. Each one changes or checks the same game you open in the editor.</p>
            </div>
            <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {AGENT_STEPS.map((step) => (
                <li key={step.tool}>
                  <h3 className="text-xl font-medium">{step.title}</h3>
                  <p className="mt-1 font-mono text-sm text-cyan-200">{step.tool}</p>
                  <p className={`mt-2 ${bodyText}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="assets-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="assets-title" className={sectionTitle}>Game assets, installed in the game</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>{ASSETS_LEAD}</p>
            </div>
            <div>
              <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {ASSET_KINDS.map((kind) => (
                  <li key={kind.title}>
                    <h3 className="text-xl font-medium">{kind.title}</h3>
                    <p className={`mt-2 ${bodyText}`}>{kind.body}</p>
                  </li>
                ))}
              </ul>
              <ul className="mt-10 max-w-2xl list-disc space-y-3 pl-5 text-slate-300">
                {ASSET_NOTES.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          </section>

          <section aria-labelledby="game-editor-title" className="mt-24 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="game-editor-title" className={sectionTitle}>Edit the level where you play it.</h2>
              <p className={`mt-4 max-w-md ${bodyText}`}>The Game Editor opens each game in its own tab. The same editor builds 2D and 3D games.</p>
              <ul className="mt-5 max-w-md list-disc space-y-2 pl-5 text-slate-300">
                {EDITOR_POINTS.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <a href="https://docs.nodetool.ai/game-editor" className="focus-ring mt-6 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100">Read the Game Editor guide<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/surface-game-poster.webp" alt="The NodeTool Game Editor with Kindle open: the scene tree, the level, and the inspector" width={1920} height={1080} loading="lazy" decoding="async" className="hidden h-auto w-full motion-reduce:block" />
              <video autoPlay muted loop playsInline preload="metadata" poster="/surface-game-poster.webp" aria-label="The Game Editor: the hero is selected in Kindle, then the level is played in the editor" className="block h-auto w-full motion-reduce:hidden">
                <source src="/surface-game.webm" type='video/webm; codecs="vp9"' />
                <source src="/surface-game.mp4" type="video/mp4" />
              </video>
            </div>
          </section>

          <section aria-labelledby="mcp-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="mcp-title" className={sectionTitle}>Build it from Claude Code or Codex.</h2>
            <div className="min-w-0 max-w-2xl break-words">
              <p className={bodyText}>One command registers NodeTool as an MCP server in Claude Code, Codex, and OpenCode. For Cursor or another MCP client, <code className="font-mono text-cyan-200">nodetool-mcp config</code> prints the block to paste. The desktop app is optional.</p>
              <pre className="mt-5 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-100"><code>{MCP_INSTALL_COMMAND}</code></pre>
              <p className={`mt-5 ${bodyText}`}>Your agent calls the game tools inside <code className="font-mono text-cyan-200">execute_code</code>, NodeTool&apos;s sandboxed action tool, and looks at captured frames with <code className="font-mono text-cyan-200">view_image</code>. The engine&apos;s skills, such as <code className="font-mono text-cyan-200">native-game</code> and <code className="font-mono text-cyan-200">game-direction</code>, appear in Claude Code as slash commands, so the agent can load the engine&apos;s rules before its first edit. The game it builds opens in the Game Editor like any other.</p>
              <p className={`mt-5 ${bodyText}`}>See the <a href="/developers" className={inlineLink}>developer page</a> for images, video, and workflows over the same connection, and the <a href="https://docs.nodetool.ai/mcp-server" className={inlineLink}>MCP server guide</a> for every option.</p>
            </div>
          </section>

          <section aria-labelledby="engine-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="engine-title" className={sectionTitle}>What is in the engine</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>{ENGINE_NOTE}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">NodeTool game engine features for 2D and 3D games</caption>
                <thead>
                  <tr className="border-b border-slate-700 text-slate-100">
                    <th scope="col" className="py-3 pr-4 font-medium">Feature</th>
                    <th scope="col" className="py-3 pr-4 font-medium">2D games</th>
                    <th scope="col" className="py-3 font-medium">3D games</th>
                  </tr>
                </thead>
                <tbody>
                  {SPEC_ROWS.map((row) => (
                    <tr key={row.feature} className="border-b border-slate-800 align-top">
                      <th scope="row" className="py-3 pr-4 font-medium text-slate-100">{row.feature}</th>
                      <td className="py-3 pr-4 text-slate-300">{row.twoD}</td>
                      <td className="py-3 text-slate-300">{row.threeD}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="limits-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="limits-title" className={sectionTitle}>What it does not do yet</h2>
            <div className="max-w-2xl">
              <ul className="list-disc space-y-2 pl-5 text-slate-300">
                {LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
              </ul>
              <p className={`mt-5 ${bodyText}`}>{LIMITS_SUMMARY} <a href="/gamedev/ai-game-engines" className={inlineLink}>Compare AI game engines</a>.</p>
            </div>
          </section>

          <section aria-labelledby="game-process-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="game-process-title" className={sectionTitle}>From first idea to the next level.</h2>
            <ol className="space-y-8">
              {PROCESS_STEPS.map((step) => (
                <li key={step.title}><h3 className="text-xl font-medium">{step.title}</h3><p className={`mt-2 max-w-xl ${bodyText}`}>{step.body}</p></li>
              ))}
            </ol>
          </section>

          <FaqSection items={GAMEDEV_FAQ} heading="Questions about building games with AI" className="mt-24 max-w-3xl" id="gamedev-faq" />

          <nav aria-labelledby="gamedev-links-title" className="mt-16 max-w-3xl">
            <h2 id="gamedev-links-title" className="text-xl font-semibold">Read more</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {GAMEDEV_LINKS.map((link) => (
                <li key={link.href}><a href={link.href} className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </nav>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-slate-700 pt-10">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">Studio is free and open source. Your game stays editable. Connect your own model providers when you want to generate new assets.</p>
            <SmartDownloadButton classNameOverride="focus-ring inline-flex items-center rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 hover:bg-slate-200" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
          <PageUpdated route="/gamedev" className="text-sm text-slate-400" />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "Game development", url: "/gamedev" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
