import type { Metadata } from "next";
import { Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import GameShowcase from "../../components/GameShowcase";
import JsonLd from "../../components/JsonLd";
import { SmartDownloadButton } from "../SmartDownloadButton";

const title = "Game Development with NodeTool | Play, Build, and Edit";
const description = "Play Kindle, Lumen, and Neon Drift. Build a game with an agent, then edit its art, levels, and rules in NodeTool Studio. Export a standalone browser game.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/gamedev" },
  openGraph: { title, description, url: "https://nodetool.ai/gamedev", siteName: "NodeTool", type: "website", images: [{ url: "/games/kindle/poster.jpg", width: 1280, height: 720, alt: "Kindle, a platform adventure built in NodeTool" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/games/kindle/poster.jpg"] }
};

export default function GameDevelopmentPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <section className="mb-16 grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <p className="mb-5 text-base font-medium text-cyan-200">Game development with NodeTool</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Make a world people can play.</h1>
            </div>
            <div className="max-w-lg">
              <p className="text-lg leading-relaxed text-slate-300">Build a game with an agent, then shape its art, levels, and rules in Studio. Start by playing the examples below.</p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <SmartDownloadButton icon={<Download className="h-4 w-4" aria-hidden="true" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100" />
                <a href="#example-games" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">Play the examples</a>
              </div>
            </div>
          </section>
          <GameShowcase />
          <section aria-labelledby="game-process-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="game-process-title" className="max-w-sm text-3xl font-semibold tracking-tight md:text-4xl">From first idea to the next level.</h2>
            <ol className="space-y-8">
              <li><h3 className="text-xl font-medium">Describe the game</h3><p className="mt-2 max-w-xl leading-relaxed text-slate-300">Give the agent a world, a player, and a goal. It can build scenes, wire behaviors, and prepare the assets in an editable game project.</p></li>
              <li><h3 className="text-xl font-medium">Play, change, play again</h3><p className="mt-2 max-w-xl leading-relaxed text-slate-300">Change the art, adjust a jump, move an obstacle, or ask the agent to revise the rules. Play the result in Studio as you work.</p></li>
              <li><h3 className="text-xl font-medium">Put it in someone else’s hands</h3><p className="mt-2 max-w-xl leading-relaxed text-slate-300">Export a standalone web player with the game’s assets. Share it through your own website, with keyboard and touch controls.</p></li>
            </ol>
          </section>
          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-slate-700 pt-10">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">Studio is free and open source. Your game stays editable. Connect your own model providers when you want to generate new assets.</p>
            <SmartDownloadButton classNameOverride="focus-ring inline-flex items-center rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 hover:bg-slate-200" />
          </div>
        </div>
        <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" }, { "@type": "ListItem", position: 2, name: "Game development", item: "https://nodetool.ai/gamedev" }] }} />
      </main>
      <SiteFooter />
    </>
  );
}
