"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";

interface ComparisonSectionProps {
  reducedMotion?: boolean;
}

interface ComparisonRow {
  label: string;
  nodetool: string;
  comfyui: string;
  weave: string;
}

/** Cells match the per-competitor tables on the /alternatives/* pages. */
const comparisonRows: ComparisonRow[] = [
  {
    label: "Media on one canvas",
    nodetool: "Image, video, audio, text",
    comfyui: "Diffusion images",
    weave: "Hosted creative canvas",
  },
  {
    label: "Models",
    nodetool: "Every major provider and media type",
    comfyui: "Stable Diffusion and other diffusion models",
    weave: "Hand-picked list",
  },
  {
    label: "What you pay",
    nodetool: "Provider list prices, on your own keys",
    comfyui: "Your own compute and provider accounts",
    weave: "Figma Weave AI credits",
  },
  {
    label: "Source",
    nodetool: "Open source (AGPL-3.0)",
    comfyui: "Open source",
    weave: "Closed",
  },
  {
    label: "Where it runs",
    nodetool: "Desktop app and browser, self-host any time",
    comfyui: "Your own machine",
    weave: "Browser only",
  },
];

export default function ComparisonSection({
  reducedMotion = false,
}: ComparisonSectionProps) {
  return (
    <section
      id="differences"
      aria-labelledby="differences-title"
      className="relative py-24 scroll-mt-24"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <header className="scroll-fade mb-14 max-w-3xl">
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
            Bring all your creative tools under one roof.
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl"
          >
            You&apos;re probably using two or three of these already. Here&apos;s
            what changes when they all live on one canvas.
          </motion.p>
        </header>

        <div className="scroll-fade grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800/60 border border-slate-800/80 rounded-2xl overflow-hidden">
          <ComparisonCard
            competitor="Image-only node tools (like ComfyUI)"
            sentence="Specialized node tools only create pictures. NodeTool provides a complete studio that connects images, video, audio, text, and editing on one canvas."
            reducedMotion={reducedMotion}
            delay={0}
          />
          <ComparisonCard
            competitor="Closed platforms"
            sentence="Other platforms force you into monthly credit bundles and restricted feature lists. NodeTool is open source: you use your direct provider accounts and pay raw rates with no middleman markup."
            reducedMotion={reducedMotion}
            delay={0.05}
          />
          <ComparisonCard
            competitor="A dozen separate web apps"
            sentence="Instead of copying files between disconnected websites, NodeTool connects your favorite AI tools into a single, repeatable workflow."
            reducedMotion={reducedMotion}
            delay={0.1}
          />
        </div>

        {/* Head-to-head table — the shape answer engines quote. */}
        <div className="scroll-fade mt-10">
          <h3
            id="comparison-table-title"
            className="text-xl md:text-2xl font-semibold tracking-tight text-white"
          >
            How does NodeTool compare with ComfyUI and Figma Weave?
          </h3>
          <p className="mt-3 max-w-2xl text-slate-400 leading-relaxed">
            ComfyUI goes deep on diffusion images and runs locally. Figma Weave
            is a hosted canvas with a curated model list, billed in its own AI
            credits. NodeTool is open source, covers image, video, audio, and
            text, and calls every provider on your own keys.
          </p>
          <div
            className="mt-6 overflow-x-auto rounded-2xl border border-slate-800/80"
            role="region"
            aria-labelledby="comparison-table-title"
            tabIndex={0}
          >
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">
                NodeTool compared with ComfyUI and Figma Weave
              </caption>
              <thead>
                <tr className="bg-slate-900/60 text-sm">
                  <th scope="col" className="px-5 py-4 font-medium text-slate-400">
                    &nbsp;
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold text-white">
                    NodeTool
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold text-slate-200">
                    ComfyUI
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold text-slate-200">
                    Figma Weave
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}
                  >
                    <th
                      scope="row"
                      className="px-5 py-4 text-sm font-medium text-slate-300"
                    >
                      {row.label}
                    </th>
                    <td className="px-5 py-4 text-sm text-white">{row.nodetool}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{row.comfyui}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{row.weave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Position panel */}
        <motion.div
          initial={false}
          whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="scroll-fade relative mt-10 rounded-2xl border border-slate-800/80 bg-slate-950/40 px-8 py-10 md:px-12 md:py-12"
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
                Model freedom. No platform lock-in.
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4 text-[1.025rem]">
                Take Seedance, one of today&apos;s best video models. It is sold
                by FAL, Replicate, and KIE at different prices, and NodeTool
                lets you pick the cheapest of the three. When the next Veo or
                Kling arrives, you switch to it in one click.
              </p>
              <p className="text-slate-400 leading-relaxed text-[1.025rem]">
                That is what sovereignty buys you: the best model at the best
                price each week, and nothing to lose if your favorite tool gets
                bought, repriced, or shut down.
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
