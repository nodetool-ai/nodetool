"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Shield, Cpu, Globe, Lock } from "lucide-react";

const features = [
  {
    title: "Local-First",
    body: "All workflows, assets, and models can run on your machine for maximum privacy and control. Work offline once models are downloaded.",
    icon: Cpu,
  },
  {
    title: "Open Source",
    body: "NodeTool is open-source under AGPL-3.0. Inspect, modify, and self-host the entire stack.",
    icon: Globe,
  },
  {
    title: "Privacy by Design",
    body: "Your data stays yours—process locally or use your API keys. No collection, no telemetry, opt-in cloud only.",
    icon: Shield,
  },
  {
    title: "Cloud-Augmented",
    body: "Mix local AI with cloud services. Add API keys for OpenAI, Anthropic, Replicate—use the best tool for each task.",
    icon: Lock,
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-slate-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Local-first or <br />
            <span className="text-slate-300">cloud-augmented.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Your tools, your data—always under your control. Run everything locally for maximum privacy, or mix in cloud services for flexibility.
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
      </div>
    </section>
  );
}
