"use client";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Sparkles,
  Play,
  Video,
  Image as ImageIcon,
  Calendar,
  Palette,
  ArrowRight,
  Check,
  Download,
  Shield,
  TrendingUp,
  Mail,
  Youtube,
} from "lucide-react";
import CommunitySection from "../../components/CommunitySection";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import AdLibraryOverview from "../../components/AdLibraryOverview";
import RecipeShowcase from "../../components/RecipeShowcase";
import TimelineShowcase from "../../components/TimelineShowcase";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { adRecipes } from "../../data/adLibrary";

const campaignFormats = [
  {
    src: "/marketing-why/campaign-16x9.webp",
    width: 1280,
    height: 720,
    label: "16:9",
    alt: "The campaign hero in 16:9: the tumbler on a blue plinth in water at sunset",
    ratio: 16 / 9,
  },
  {
    src: "/marketing-why/campaign-1x1.webp",
    width: 800,
    height: 800,
    label: "1:1",
    alt: "The same campaign as a square social post",
    ratio: 1,
  },
  {
    src: "/marketing-why/campaign-9x16.webp",
    width: 560,
    height: 996,
    label: "9:16",
    alt: "The same campaign as a vertical story",
    ratio: 9 / 16,
  },
];

const campaignModels = ["Flux", "Veo", "Kling", "Seedance", "Suno", "ElevenLabs"];

const upcomingWorkflows = [
  {
    title: "Social Media Calendar Filler",
    description:
      "Turn a content theme into a week of on-brand social posts, images and copy included.",
    icon: Calendar,
  },
  {
    title: "Brand Asset Generator",
    description:
      "Generate a consistent set of logos, color variants, and marketing assets from one brand brief.",
    icon: Palette,
  },
  {
    title: "Cold Outreach Co-Pilot",
    description:
      "Research a list of prospects and draft personalized outreach at volume, while it still reads as though a person wrote it.",
    icon: Mail,
  },
  {
    title: "Hook & Thumbnail Factory",
    description:
      "Generate video hooks and thumbnail ideas in batches from a title and description, then test them against each other.",
    icon: Youtube,
  },
];

export default function MarketingSegmentPage() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.stargazers_count === "number") {
          setStars(j.stargazers_count);
        }
      })
      .catch(() => {});
  }, []);

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
                  Take a product brief from the first concept to delivered
                  ads in every format. Describe the campaign, and the agent
                  builds a workflow you rerun for every SKU, market, and
                  aspect ratio.
                </p>

                {/* Two countable credibility chips beside the CTA
                    (NARRATIVE.md § Vertical pages). */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-12 text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {adRecipes.length} ad formats, rendered and editable
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    Flux, Veo, Kling, and Seedance on your keys
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <SmartDownloadButton
                    icon={<Download className="w-5 h-5" />}
                    classNameOverride="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-amber-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] hover:bg-amber-400 hover:shadow-[0_14px_40px_-10px_rgba(245,158,11,0.75)]"
                  />
                  <a
                    href="#example-timelines"
                    className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    Watch examples
                  </a>
                </div>

                <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <TrendingUp className="w-4 h-4 text-amber-300" />
                    </span>
                    One brief, every SKU and market
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Shield className="w-4 h-4 text-emerald-300" />
                    </span>
                    Provider list prices
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                      <ImageIcon className="w-4 h-4 text-cyan-300" />
                    </span>
                    16:9, 1:1, and 9:16 from one run
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Short social ads first: the format an ad team runs most. */}
        <AdLibraryOverview compact />

        <TimelineShowcase />

        {/* Why marketing teams choose NodeTool: one campaign, shown rather
            than described. The images are one run of the directed campaign
            kit recipe and one run of the SKU visual factory. */}
        <section aria-labelledby="why-marketing-title" className="relative py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <h2
                id="why-marketing-title"
                className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
              >
                Built for campaigns, not one-off shots.
              </h2>
              <p className="max-w-sm text-lg leading-relaxed text-slate-400">
                One workflow. Every format and market. Always on brand.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              {/* One brief, every format */}
              {/* Each format keeps its real aspect ratio. Flex-grow in
                  proportion to the ratio gives each row one height. On
                  phones 16:9 takes its own row. */}
              <figure className="m-0 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a14] lg:col-span-12">
                <div className="flex flex-wrap gap-2 p-2 sm:flex-nowrap">
                  {campaignFormats.map((format, index) => (
                    <div
                      key={format.label}
                      className={`relative min-w-0 overflow-hidden rounded-2xl ${
                        index === 0 ? "basis-full sm:basis-0" : "basis-0"
                      }`}
                      style={{ flexGrow: format.ratio, aspectRatio: format.ratio }}
                    >
                      <Image
                        src={format.src}
                        alt={format.alt}
                        width={format.width}
                        height={format.height}
                        sizes="(min-width: 1280px) 640px, 50vw"
                        className="no-desaturate absolute inset-0 h-full w-full object-cover"
                      />
                      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-jetbrains text-[11px] font-medium text-white backdrop-blur">
                        {format.label}
                      </span>
                    </div>
                  ))}
                </div>
                <figcaption className="flex items-center gap-4 border-t border-white/5 px-6 py-5">
                  <Image
                    src="/marketing-why/campaign-reference.webp"
                    alt="The product photo the campaign started from"
                    width={400}
                    height={600}
                    className="no-desaturate h-14 w-auto rounded-lg border border-white/10 bg-white"
                  />
                  <div>
                    <p className="text-lg font-semibold text-white">
                      One product photo. Every format.
                    </p>
                    <p className="text-sm text-slate-400">
                      Rerun it for the next product or market.
                    </p>
                  </div>
                </figcaption>
              </figure>

              <div className="grid gap-4 md:grid-cols-2 lg:col-span-12">
                {/* Any model, your keys */}
                <div className="flex flex-col justify-between gap-8 rounded-3xl border border-white/10 bg-[#0a0a14] p-7">
                  <ul
                    className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-3xl font-semibold tracking-tight text-slate-300 md:text-4xl xl:text-5xl"
                    aria-label="Models"
                  >
                    {campaignModels.map((model) => (
                      <li key={model}>{model}</li>
                    ))}
                    <li className="text-base font-medium tracking-normal text-slate-500">
                      and more
                    </li>
                  </ul>
                  <div>
                    <p className="text-lg font-semibold text-white">
                      Any model. Your keys.
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      List price. No credits, no seat markup.
                    </p>
                  </div>
                </div>

                {/* On brand, every run */}
                <figure className="m-0 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a14]">
                  <Image
                    src="/marketing-why/looks.webp"
                    alt="One cup shot three ways: studio white, warm spotlight, and a dark green set"
                    width={1200}
                    height={394}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="no-desaturate h-auto w-full"
                  />
                  <figcaption className="p-7">
                    <p className="text-lg font-semibold text-white">
                      On brand, every run.
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Your palette, tone, and product locked into the workflow.
                    </p>
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        <RecipeShowcase />

        {/* Product Video Generator: the workflow available today, next to the
            ones on the way */}
        <section id="product-video" className="relative scroll-mt-28 py-20">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="flex flex-col lg:flex-row items-center gap-12"
            >
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300 mb-6">
                  Lead workflow
                  <span className="text-amber-500/60">·</span>
                  Marketing
                </div>
                <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                  <Video className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Product Video Generator
                </h3>
                <p className="text-lg text-slate-400 leading-relaxed mb-6">
                  Turn a campaign brief and a single product photo into a
                  cinematic 16:9 product video. Your inputs shape the prompt, an
                  agent directs the shot, and a video model renders it, ready to
                  run again for every product in the line.
                </p>
                <ul className="space-y-3 mb-8">
                  {["Brief, prompt, agent, then video", "Run it again per product or market", "Your own keys for every model in the workflow"].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3 text-slate-300">
                        <Check className="w-5 h-5 text-emerald-400" />
                        {item}
                      </li>
                    )
                  )}
                </ul>
                <a
                  href="/use-cases/product-video"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors"
                >
                  View the full workflow
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div className="flex-1 w-full">
                <div className="relative rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                    <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                    <span className="ml-4 text-xs text-slate-400 font-medium">
                      Product Video Generator
                    </span>
                  </div>
                  <video
                    src="/product_video_example.mp4"
                    poster="/smartwatch.png"
                    className="w-full"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* More marketing workflows on the way */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12 max-w-2xl mx-auto"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                More marketing workflows on the way
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                The Product Video Generator is available today. These are next,
                and they follow the same pattern: a brief goes in, a campaign
                comes out.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcomingWorkflows.map((wf, index) => (
                <motion.div
                  key={wf.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="flex items-start gap-4 rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-6"
                >
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <wf.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1.5">
                      {wf.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {wf.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Community */}
        <CommunitySection id="community" variant="marketing" stars={stars} />

        {/* CTA */}
        <section className="py-24 relative">
          <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Ready to ship <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400">
                  at campaign volume?
                </span>
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Download the open-source studio for macOS, Windows, and Linux.
                Connect the providers you already pay for, and build the
                workflow that produces your next campaign.
              </p>
              <SmartDownloadButton
                icon={<Download className="w-6 h-6" />}
                classNameOverride="group inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-600 text-white text-lg font-semibold hover:from-amber-400 hover:to-emerald-500 transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
              />
            </motion.div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
