"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Shield, Cpu, Globe, Lock } from "lucide-react";

const features = [
  {
    title: "BYOK, every provider",
    body: "Bring your own keys to FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more. Keys stay on your disk in Studio, encrypted in Cloud. We never mark up model calls.",
    icon: Lock,
  },
  {
    title: "Provider prices, no credits",
    body: "No proprietary tokens. No minimum top-up. You pay providers what they charge. The same Seedance call that costs $0.18 on KIE costs $0.18 in NodeTool.",
    icon: Shield,
  },
  {
    title: "Open source, always",
    body: "Both editions — Studio (desktop) and Cloud (hosted) — share the same AGPL-3.0 codebase. No closed-source layer, no “pro tier” hiding the good features. Self-host any time.",
    icon: Globe,
  },
  {
    title: "Local inference when you want it",
    body: "MLX, Ollama, llama.cpp, vLLM, LM Studio — fully supported. Runs offline once models are downloaded. Local is a feature, not a religion.",
    icon: Cpu,
  },
];

interface OwnershipSectionProps {
  reducedMotion?: boolean;
}

export default function OwnershipSection({
  reducedMotion: _reducedMotion = false,
}: OwnershipSectionProps) {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-neutral-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Your keys. Your files. <br />
            <span className="text-neutral-300">Your roadmap.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-neutral-400 leading-relaxed"
          >
            Every closed AI tool ends the same way: a price hike, a worse
            roster, or an acquisition that quietly rewrites the roadmap.
            NodeTool calls whatever models you choose, charges you what the
            providers charge, and ships under a license that outlives whoever
            built it.
          </motion.p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {features.map((item) => (
            <motion.div
              key={item.title}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="h-full"
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col p-8 bg-neutral-950 transition-colors duration-300 hover:bg-neutral-900/60">
                  <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-neutral-300 transition-colors duration-300 group-hover:text-white group-hover:border-white/20">
                    <item.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>

                  <h3 className="mb-3 text-base font-semibold tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-400">
                    {item.body}
                  </p>

                  <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
