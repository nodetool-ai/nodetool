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
  closed: string;
}

/**
 * Two categories, not two brands: the open studio against the hosted platform.
 * The homepage names no competitor (NARRATIVE.md § The argument we do not
 * make) — the head-to-head pages under /alternatives do, because a reader who
 * lands there is already searching for one. Every cell is a claim that holds
 * for hosted platforms generally; a claim true of only one belongs on its
 * own page.
 */
const comparisonRows: ComparisonRow[] = [
  {
    label: "Models",
    nodetool: "Every major provider, switched in one click",
    closed: "The list they picked",
  },
  {
    label: "When a better model ships",
    nodetool: "Add it the day it ships",
    closed: "Wait for them to add it",
  },
  {
    label: "What you pay",
    nodetool: "Provider list prices, on your own keys",
    closed: "Their credits",
  },
  {
    label: "What you keep",
    nodetool: "The board, the takes, and the multi-track cut as an editable project",
    closed: "An exported video. The project stays in their app.",
  },
  {
    label: "Source",
    nodetool: "Open, AGPL-3.0",
    closed: "Closed",
  },
  {
    label: "Where it runs",
    nodetool: "Desktop app and browser, self-host any time",
    closed: "Their servers only",
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
        <header className="scroll-fade mb-10 max-w-3xl">
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
            What changes when the studio is open.
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl"
          >
            A hosted platform will make the film, and it keeps the model list,
            the billing, and the project. Here is the same table with the
            studio open.
          </motion.p>
        </header>

        {/* Head-to-head table — the shape answer engines quote. */}
        <div className="scroll-fade">
          <h3
            id="comparison-table-title"
            className="text-xl md:text-2xl font-semibold tracking-tight text-white"
          >
            An open studio and a hosted platform, row by row
          </h3>
          <div
            className="mt-6 overflow-x-auto rounded-2xl border border-slate-800/80"
            role="region"
            aria-labelledby="comparison-table-title"
            tabIndex={0}
          >
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">
                NodeTool, an open studio, compared with a hosted AI video
                platform
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
                    Hosted platforms
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
                    <td className="px-5 py-4 text-sm text-slate-400">{row.closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Comparing against a specific product? See{" "}
            <a
              href="/alternatives/comfyui"
              className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
            >
              NodeTool and ComfyUI
            </a>{" "}
            and{" "}
            <a
              href="/alternatives/figma-weave"
              className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
            >
              NodeTool and Figma Weave
            </a>
            .
          </p>
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
                Pick the model. Pick the price.
              </h3>
              <p className="text-slate-300 leading-relaxed mb-4 text-[1.025rem]">
                Take Seedance, one of today&apos;s best video models. It is sold
                by FAL, Replicate, and KIE at different prices, and NodeTool
                lets you pick the cheapest of the three. When the next Veo or
                Kling arrives, you switch to it in one click.
              </p>
              <p className="text-slate-400 leading-relaxed text-[1.025rem]">
                That is what holding the keys buys you: the best model at the
                best price each week, and nothing to lose if your favorite tool
                gets bought, repriced, or shut down.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
