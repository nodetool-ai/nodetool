"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useCaseEntries, type UseCaseAccent } from "../app/use-cases/useCaseEntries";

const accentMap: Record<
  UseCaseAccent,
  { chip: string; link: string; glow: string }
> = {
  sky: {
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    link: "text-sky-300",
    glow: "rgba(56,189,248,0.18)",
  },
  rose: {
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    link: "text-rose-300",
    glow: "rgba(244,63,94,0.18)",
  },
  emerald: {
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    link: "text-emerald-300",
    glow: "rgba(16,185,129,0.18)",
  },
  amber: {
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    link: "text-amber-300",
    glow: "rgba(245,158,11,0.18)",
  },
  violet: {
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    link: "text-violet-300",
    glow: "rgba(139,92,246,0.18)",
  },
};

export default function UseCasesShowcase() {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className="relative py-24 overflow-hidden"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 max-w-2xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
            <span className="h-px w-8 bg-amber-300/60" />
            Use cases
          </div>
          <motion.h2
            id="use-cases-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            From a brief to a finished asset
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 leading-relaxed"
          >
            Real workflows you can open, run, and rewire. Each one is complete,
            not a demo, and built from the same nodes you get on day one.
          </motion.p>
        </div>

        <div className="flex flex-col gap-8">
          {useCaseEntries.map((item, i) => {
            const a = accentMap[item.accent];
            const reverse = i % 2 === 1;
            return (
              <motion.a
                key={item.slug}
                href={`/use-cases/${item.slug}`}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.3 }}
                className="group relative grid items-center gap-8 rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-slate-900/60 lg:grid-cols-2 lg:gap-12 lg:p-8"
              >
                {/* Media */}
                <div
                  className={`relative ${reverse ? "lg:order-2" : ""}`}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-4 rounded-3xl opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(60% 60% at 50% 50%, ${a.glow}, transparent 70%)`,
                    }}
                  />
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-2xl">
                    {item.video ? (
                      <video
                        src={item.video}
                        poster={item.poster}
                        className="aspect-video w-full object-cover"
                        playsInline
                        preload="none"
                      />
                    ) : (
                      <Image
                        src={item.poster}
                        alt={item.title}
                        width={1280}
                        height={720}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className={reverse ? "lg:order-1" : ""}>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${a.chip}`}
                  >
                    {item.category}
                  </span>
                  <h3 className="mt-5 text-2xl md:text-3xl font-semibold tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-slate-400 leading-relaxed">
                    {item.teaser}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    {item.pipeline.map((step, s) => (
                      <React.Fragment key={step}>
                        {s > 0 && (
                          <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                        )}
                        <span className="rounded-md border border-white/10 bg-slate-950/50 px-2.5 py-1 text-xs font-medium text-slate-300">
                          {step}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>

                  <span
                    className={`mt-8 inline-flex items-center gap-1.5 text-sm font-semibold ${a.link}`}
                  >
                    View use case
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </motion.a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
