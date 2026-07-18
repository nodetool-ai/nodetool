"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";

interface ComparisonSectionProps {
  reducedMotion?: boolean;
}

export default function ComparisonSection({
  reducedMotion = false,
}: ComparisonSectionProps) {
  return (
    <section
      id="differences"
      aria-labelledby="differences-title"
      className="relative py-24"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <header className="mb-14 max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
            <span className="h-px w-8 bg-amber-300/60" />
            Comparison
          </div>
          <motion.h2
            id="differences-title"
            initial={false}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Where NodeTool fits among your tools
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl"
          >
            You&apos;re probably using two or three of these already. Here&apos;s
            what changes when they live on one canvas.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800/60 border border-slate-800/80 rounded-2xl overflow-hidden">
          <ComparisonCard
            competitor="ComfyUI"
            sentence="ComfyUI is a node editor for image-generation models. NodeTool is the studio around it: image, video, music, and words on one canvas, every major model a click away."
            reducedMotion={reducedMotion}
            delay={0}
          />
          <ComparisonCard
            competitor="Figma Weave / closed canvases"
            sentence="Closed canvases lock you into a credit system and a hand-picked list of models. NodeTool is open source — every provider, your own keys, provider prices."
            reducedMotion={reducedMotion}
            delay={0.05}
          />
          <ComparisonCard
            competitor="A dozen browser tabs"
            sentence="Midjourney, Runway, Photoshop, ElevenLabs, Suno — each in its own tab, none of them talking to each other. NodeTool wires them into one canvas you can run, share, and re-run."
            reducedMotion={reducedMotion}
            delay={0.1}
          />
        </div>

        {/* Position panel */}
        <motion.div
          initial={false}
          whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="relative mt-10 rounded-2xl border border-slate-800/80 bg-slate-950/40 px-8 py-10 md:px-12 md:py-12"
        >
          {/* Warm corner glow — single, subtle */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "radial-gradient(50% 80% at 0% 0%, rgba(217, 119, 6, 0.10), transparent 60%)",
            }}
          />

          <div className="relative grid gap-10 md:grid-cols-[auto,1fr] md:items-start">
            <div className="flex md:block">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-amber-500/25 bg-slate-950">
                <Image
                  src="/logo_small.webp"
                  alt=""
                  width={48}
                  height={48}
                />
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
                Where NodeTool fits
              </div>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-5 tracking-tight">
                Every model. Your keys. Your canvas.
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4 text-[1.025rem]">
                Take Seedance, one of today&apos;s top video models. It&apos;s
                available on FAL, Replicate, and KIE at different price points.
                NodeTool lets you pick the cheapest. And when the next Veo or
                Kling ships, it&apos;s one node swap away.
              </p>
              <p className="text-slate-400 leading-relaxed text-[1.025rem]">
                That&apos;s what not being tied to one vendor buys you: the
                best model at the best price, every week — and nothing to lose
                if your favorite tool gets acquired.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

interface ComparisonCardProps {
  competitor: string;
  sentence: string;
  reducedMotion: boolean;
  delay: number;
}

function ComparisonCard({
  competitor,
  sentence,
  reducedMotion,
  delay,
}: ComparisonCardProps) {
  const [before, after] = sentence.split("NodeTool");

  return (
    <motion.article
      initial={false}
      whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.25, delay }}
      className="relative bg-slate-950/70 p-8 lg:p-10 flex flex-col"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-6">
        vs <span className="text-slate-300">{competitor}</span>
      </div>

      <p className="text-slate-200 leading-relaxed text-[1.025rem]">
        {before}
        <span className="font-semibold text-blue-300">NodeTool</span>
        {after}
      </p>
    </motion.article>
  );
}
