"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Sparkles, Play, ArrowRight, Check, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { adRecipes } from "../../data/adLibrary";
import PageUpdated from "@/components/PageUpdated";
import { CAMPAIGN_CASE, MARKETING_LEAD, MORE_FOR_AD_TEAMS } from "@/data/marketingPage";

/*
 * One campaign, end to end (site-editorial.spec.md § Page ownership). The
 * images are the accepted run 2026-09-14-directed-campaign-kit-gpt25; the
 * revision note is the recorded prompt in its asset-manifest.json. The ad
 * library, storyboards, recipes, and other workflows sit behind links.
 */
export default function MarketingSegmentPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[24%] -left-40 h-[520px] w-[520px] rounded-full bg-amber-600/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[24%] -right-40 h-[480px] w-[480px] rounded-full bg-emerald-500/15 blur-[140px]"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: "120px 120px",
          }}
        />
      </div>

      <SiteHeader />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-16 pb-24 lg:pt-24 lg:pb-32 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-5xl text-center">
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="relative inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] via-emerald-500/[0.05] to-cyan-500/[0.08] mb-10 shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-white tracking-wide">
                    Advertising and marketing
                  </span>
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-10">
                  <span className="text-white">AI for</span>{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-300 to-cyan-400">
                    advertising.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">
                  {MARKETING_LEAD}
                </p>

                {/* Two countable credibility chips beside the CTA
                    (NARRATIVE.md § Vertical pages). */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-12 text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {adRecipes.length} example ads you can open and edit
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    Flux, Veo, Kling, and Seedance on your keys
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <SmartDownloadButton
                    icon={<Download className="w-5 h-5" />}
                    classNameOverride="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-amber-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] hover:bg-amber-400 hover:shadow-[0_14px_40px_-10px_rgba(245,158,11,0.75)]"
                  />
                  <a
                    href="#campaign"
                    className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-xs text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    See the campaign
                  </a>
                </div>

              </motion.div>
            </div>
          </div>
        </section>

        <section
          id="campaign"
          aria-labelledby="campaign-title"
          className="relative scroll-mt-28 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <header className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                One campaign, end to end
              </p>
              <h2
                id="campaign-title"
                className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-white"
              >
                One brief. Four deliverables.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                {CAMPAIGN_CASE.intro}
              </p>
            </header>

            <ol className="mt-12 grid gap-4 lg:grid-cols-12">
              {/* 1. The hero, from the brief */}
              <li className="m-0 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a14] lg:col-span-7">
                <Image
                  src="/marketing-why/campaign-16x9.webp"
                  alt="The campaign hero in 16:9: the olive travel cup on a cobalt platform above water at sunrise"
                  width={1280}
                  height={720}
                  sizes="(min-width: 1024px) 760px, 100vw"
                  className="h-auto w-full"
                />
                <div className="p-6">
                  <p className="font-jetbrains text-xs uppercase tracking-[0.14em] text-amber-300">
                    1 · Hero, 16:9
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {CAMPAIGN_CASE.hero}
                  </p>
                </div>
              </li>

              {/* 2 and 3. The same world, recomposed */}
              <li className="m-0 grid grid-cols-[1fr_0.5625fr] gap-2 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a14] p-2 lg:col-span-5">
                <Image
                  src="/marketing-why/campaign-1x1.webp"
                  alt="The same campaign recomposed as a square social post"
                  width={800}
                  height={800}
                  sizes="(min-width: 1024px) 300px, 60vw"
                  className="h-auto w-full self-start rounded-2xl"
                />
                <Image
                  src="/marketing-why/campaign-9x16.webp"
                  alt="The same campaign recomposed as a vertical story, with the upper third clear for copy"
                  width={560}
                  height={996}
                  sizes="(min-width: 1024px) 170px, 34vw"
                  className="h-auto w-full rounded-2xl"
                />
                <div className="col-span-2 px-4 pb-4 pt-2">
                  <p className="font-jetbrains text-xs uppercase tracking-[0.14em] text-amber-300">
                    2 · Social, 1:1 · 3 · Story, 9:16
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {CAMPAIGN_CASE.formats}
                  </p>
                </div>
              </li>

              {/* 4. One note sent back, everything else kept */}
              <li className="m-0 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a14] lg:col-span-12">
                <div className="grid gap-2 p-2 sm:grid-cols-2">
                  <figure className="relative m-0">
                    <Image
                      src="/marketing-why/campaign-16x9.webp"
                      alt="Before the revision: a large splash on the left of the platform"
                      width={1280}
                      height={720}
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="h-auto w-full rounded-2xl"
                    />
                    <figcaption className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
                      Before
                    </figcaption>
                  </figure>
                  <figure className="relative m-0">
                    <Image
                      src="/marketing-why/campaign-revision.webp"
                      alt="After the revision: about half the splash, and wider dark-blue space on the left for copy"
                      width={1280}
                      height={720}
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="h-auto w-full rounded-2xl"
                    />
                    <figcaption className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
                      After
                    </figcaption>
                  </figure>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-12">
                  <p className="font-jetbrains text-xs uppercase tracking-[0.14em] text-amber-300 md:col-span-3">
                    4 · Revision
                  </p>
                  <div className="md:col-span-9">
                    <blockquote className="border-l-2 border-amber-400/60 pl-4 text-base leading-relaxed text-white">
                      {CAMPAIGN_CASE.revisionNote}
                    </blockquote>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                      {CAMPAIGN_CASE.revision}
                    </p>
                  </div>
                </div>
              </li>
            </ol>

            <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
                {CAMPAIGN_CASE.limitation}
              </p>
              <a
                href="/recipes/directed-campaign-kit"
                className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-amber-300 transition-colors hover:text-amber-200 focus-ring"
              >
                Follow the recipe step by step
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section aria-labelledby="more-title" className="relative py-16">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <h2
              id="more-title"
              className="text-2xl font-bold tracking-tight text-white md:text-3xl"
            >
              More for ad teams
            </h2>
            <ul className="mt-6 grid border-t border-white/10 md:grid-cols-2">
              {MORE_FOR_AD_TEAMS.map((item) => (
                <li key={item.href} className="border-b border-white/10 md:odd:pr-6 md:even:pl-6">
                  <a
                    href={item.href}
                    className="group flex items-start justify-between gap-4 py-5 focus-ring"
                  >
                    <span>
                      <span className="block font-semibold text-white group-hover:text-amber-200">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-slate-400">
                        {item.body}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500 group-hover:text-amber-200" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-24 relative">
          <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Run the kit on your next product.
            </h2>
            <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
              Download the free, open-source studio for macOS, Windows, and
              Linux, and open the Directed Campaign Kit.
            </p>
            <SmartDownloadButton
              icon={<Download className="w-5 h-5" />}
              classNameOverride="inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-amber-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] hover:bg-amber-400"
            />
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
        <PageUpdated route="/marketing" className="text-sm text-slate-400" />
      </div>

      <SiteFooter />
    </main>
  );
}
