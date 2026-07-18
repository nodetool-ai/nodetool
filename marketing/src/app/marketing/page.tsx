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
  Zap,
  Shield,
  TrendingUp,
  Mail,
  Youtube,
} from "lucide-react";
import CommunitySection from "../../components/CommunitySection";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { SmartDownloadButton } from "../SmartDownloadButton";

const marketingBenefits = [
  {
    title: "Output at campaign volume",
    description:
      "One workflow, run across every SKU, market, or audience segment. The cost that matters is cost-per-asset at scale, not the polish of a single hero shot.",
    icon: TrendingUp,
  },
  {
    title: "Every model, your keys",
    description:
      "Flux, Veo, Kling, Seedance, Suno, ElevenLabs, and more, called with your own provider keys at list price. No credit packs, no per-seat markup.",
    icon: Zap,
  },
  {
    title: "Brand consistency, built in",
    description:
      "Lock a palette, a voice, or a product shot into the workflow once. Every asset it produces inherits it — no manual re-briefing per output.",
    icon: Palette,
  },
];

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
      "Research a prospect list and draft personalized outreach at volume, without losing the personal read.",
    icon: Mail,
  },
  {
    title: "YouTube Thumbnail Pipeline",
    description:
      "Batch-generate and A/B-test thumbnail concepts from a video title and description.",
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
                    The open canvas for marketing production
                  </span>
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-10">
                  <span className="text-white">One brief.</span>{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-300 to-cyan-400">
                    A campaign&apos;s worth of assets.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">
                  Product videos, ad creative, social calendars, and brand
                  assets from every major model, called with your own keys,
                  on one node-based canvas. No marked-up credits, no lock-in
                  — built for output volume, not one-off polish.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <SmartDownloadButton
                    icon={<Download className="w-5 h-5" />}
                    classNameOverride="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-amber-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] hover:bg-amber-400 hover:shadow-[0_14px_40px_-10px_rgba(245,158,11,0.75)]"
                  />
                  <a
                    href="#product-video"
                    className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    See a Campaign Workflow
                  </a>
                </div>

                <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <TrendingUp className="w-4 h-4 text-amber-300" />
                    </span>
                    Built for volume
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Shield className="w-4 h-4 text-emerald-300" />
                    </span>
                    Your keys, no markup
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                      <ImageIcon className="w-4 h-4 text-cyan-300" />
                    </span>
                    Every format, one canvas
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Why marketing teams choose NodeTool */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16 max-w-3xl mx-auto"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Why marketing teams{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-emerald-400">
                  choose NodeTool
                </span>
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                Automation tools compete on integrations and speed. Creative
                tools compete on the polish of a single asset. Campaigns need
                both: a workflow that runs at volume and still looks on-brand
                every time.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {marketingBenefits.map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-8"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                    <benefit.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed text-[0.95rem]">
                    {benefit.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Video Generator — lead use case */}
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
                  cinematic 16:9 product video. Your inputs feed a prompt, an
                  agent directs the shot, and a text-to-video model renders
                  it, ready to re-run across every SKU in the line.
                </p>
                <ul className="space-y-3 mb-8">
                  {["Brief → Prompt → Agent → Text-to-Video", "Re-runnable per SKU or market", "Your own keys for every model in the workflow"].map(
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
                The Product Video Generator ships today. These are next up —
                same pattern: brief in, campaign out.
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
                Every model. Your keys. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400">
                  Campaign volume.
                </span>
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Download NodeTool, plug in the providers you already pay for,
                and build the workflow that produces your next campaign.
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
