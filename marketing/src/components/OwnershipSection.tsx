"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Shield, FolderOpen, Globe, Lock } from "lucide-react";

const features = [
  {
    title: "Bring your own keys",
    body: "Connect directly to OpenAI, Anthropic, Gemini, FAL, KIE, Replicate, and the specialized video models. Your keys stay on your disk in Studio, encrypted in Cloud.",
    icon: Lock,
  },
  {
    title: "No markups",
    body: "No credit packs, no subscription traps. If an image costs $0.03 at the provider, you pay $0.03 to the provider. NodeTool takes no cut.",
    icon: Shield,
  },
  {
    title: "Open source, end to end",
    body: "Studio and Cloud are built from the same AGPL-3.0 source, with no paywalled features. Read it, fork it, or host it yourself at any time.",
    icon: Globe,
  },
  {
    title: "A project file that opens anywhere",
    body: "The board, the script with its takes, and the multi-track cut are ordinary files on your disk. Export a .nodetool bundle and open it on another machine, or in a fork.",
    icon: FolderOpen,
  },
];

interface OwnershipSectionProps {
  reducedMotion?: boolean;
}

export default function OwnershipSection({
  reducedMotion: _reducedMotion = false,
}: OwnershipSectionProps) {
  return (
    <section className="relative py-24 overflow-clip-safe">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-slate-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Local. Open. Yours. <br />
            <span className="text-slate-300">No middlemen, no markups.</span>
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            No locked project formats, no markups, no subscription tiers.
            Bring your own keys and switch providers with one click. You own
            the project file, the workflow, and the final cut.
          </motion.p>
        </div>

        <motion.div
          className="scroll-fade grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            show: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {features.map((item) => (
            <motion.div
              key={item.title}
              variants={{
                hidden: { opacity: 1, y: 0 },
                show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
              }}
              className="h-full"
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col p-8 bg-slate-950 transition-colors duration-300 hover:bg-slate-900/60">
                  <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-colors duration-300 group-hover:text-white group-hover:border-white/20">
                    <item.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>

                  <h3 className="mb-3 text-base font-semibold tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {item.body}
                  </p>

                  <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>

        <p className="mt-10 text-center text-sm text-slate-400">
          What that comes to in a month, model by model, is on the{" "}
          <a
            href="/pricing#byok-calculator"
            className="text-blue-300 underline underline-offset-2 hover:text-blue-200 focus-ring"
          >
            pricing page
          </a>
          .
        </p>
      </div>
    </section>
  );
}
