"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Play } from "lucide-react";
import { gameExamples } from "../data/gameExamples.generated";

export default function GameShowcase() {
  const [selectedSlug, setSelectedSlug] = useState<string>("kindle");
  const selected = gameExamples.find((game) => game.slug === selectedSlug);
  if (!selected) return null;
  const playerUrl = `/games/${selected.slug}/index.html`;

  return (
    <section id="example-games" aria-labelledby="example-games-title" className="scroll-mt-28">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 id="example-games-title" className="text-2xl font-semibold text-slate-100">Pick a world. Press play.</h2>
        <p className="text-sm text-slate-300">Real games made in NodeTool.</p>
      </div>
      <div role="group" aria-label="Example games" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {gameExamples.map((game) => (
          <button key={game.slug} type="button" aria-pressed={selected.slug === game.slug} aria-controls="game-preview" onClick={() => {
            setSelectedSlug(game.slug);
          }} className={`focus-ring overflow-hidden rounded-lg border text-left transition-colors motion-reduce:transition-none ${selected.slug === game.slug ? "border-cyan-300 bg-slate-800" : "border-slate-700 bg-slate-950 hover:border-slate-400"}`}>
            <Image src={`/games/${game.slug}/poster.jpg`} alt="" width={1280} height={720} sizes="(min-width: 1024px) 300px, (min-width: 640px) 25vw, 50vw" className="aspect-video w-full object-cover" />
            <span className="block px-3 py-3 text-sm font-medium text-slate-100 sm:text-lg">{game.name}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          {/* Games open full page in their own tab: an embed is too small to play and fights the page for keyboard focus. */}
          <div id="game-preview" className="relative aspect-video overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            <Image src={`/games/${selected.slug}/poster.jpg`} alt={`${selected.name} gameplay`} width={1280} height={720} sizes="(min-width: 1024px) 800px, 100vw" className="h-full w-full object-contain" priority />
            <a href={playerUrl} target="_blank" rel="noreferrer" className="focus-ring absolute bottom-6 left-6 inline-flex items-center gap-2 rounded-full border border-slate-400 bg-slate-950 px-6 py-3 font-medium text-slate-100 hover:bg-slate-800" aria-label={`Play ${selected.name} in a new tab`}>
              <Play className="h-5 w-5" aria-hidden="true" /> Play {selected.name} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-300">The game opens full screen in a new tab. {selected.startHint}</p>
        </div>
        <div aria-live="polite">
          <p className="text-sm text-cyan-200">{selected.genre}</p>
          <h3 className="mt-2 text-3xl font-semibold text-slate-100">{selected.name}</h3>
          <p className="mt-4 leading-relaxed text-slate-300">{selected.description}</p>
          <p className="mt-5 font-medium text-slate-100">{selected.controls}</p>
          <p className="mt-6 text-sm leading-relaxed text-slate-300">On a phone or tablet, touch controls appear on screen.</p>
          <div className="mt-8 border-t border-slate-700 pt-6">
            <h4 className="font-medium text-slate-100">Make this game yours</h4>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">In Studio, open Examples from the logo menu, select Games, find {selected.name}, then choose Install game to open it in the Game Editor.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
