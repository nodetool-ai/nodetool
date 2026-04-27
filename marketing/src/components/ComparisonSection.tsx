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
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <span className="h-px w-8 bg-amber-300/60" />
            Comparison
          </div>
          <motion.h2
            id="differences-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 16 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            How NodeTool differs
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 16 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl"
          >
            We borrow ideas from a few categories of tools and specialize them for AI work.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800/60 border border-slate-800/80 rounded-2xl overflow-hidden">
          <ComparisonCard
            competitor="ComfyUI"
            sentence="ComfyUI focuses on Stable Diffusion image generation. NodeTool covers the rest of the AI stack: LLMs, RAG, audio, and video."
            reducedMotion={reducedMotion}
            delay={0}
          />
          <ComparisonCard
            competitor="n8n"
            sentence="n8n automates business processes and APIs. NodeTool is built for AI work, with model management and local LLMs included."
            reducedMotion={reducedMotion}
            delay={0.05}
          />
          <ComparisonCard
            competitor="LangChain"
            sentence="LangChain is a Python framework for LLM apps. NodeTool is a visual, TypeScript-first platform with an async Node.js runtime and custom nodes in TS."
            reducedMotion={reducedMotion}
            delay={0.1}
          />
        </div>

        {/* Position panel */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
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
                  src="/logo_small.png"
                  alt=""
                  width={48}
                  height={48}
                />
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                Where NodeTool fits
              </div>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-5 tracking-tight">
                Prompt your workflows. Watch them render.
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4 text-[1.025rem]">
                Agents are first-class, not bolted on. Describe what you want and your
                coding agent builds the graph. Run it autonomously, or as a fixed API.
              </p>
              <p className="text-slate-400 leading-relaxed text-[1.025rem]">
                Image, video, audio, and text all live on one canvas. Results stream in
                as nodes finish. Extend with custom nodes in TypeScript or Python. Local
                by default.
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
      initial={reducedMotion ? {} : { opacity: 0, y: 16 }}
      whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="relative bg-slate-950/70 p-8 lg:p-10 flex flex-col"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-6">
        vs <span className="text-slate-300">{competitor}</span>
      </div>

      <p className="text-slate-200 leading-relaxed text-[1.025rem]">
        {before}
        <span className="font-semibold text-amber-300">NodeTool</span>
        {after}
      </p>
    </motion.article>
  );
}
