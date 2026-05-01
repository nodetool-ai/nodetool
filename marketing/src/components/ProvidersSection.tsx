"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Tilt3D from "./Tilt3D";
import { DownloadButtons } from "../app/DownloadButtons";
import { Link2, Layers, ShieldCheck, Zap } from "lucide-react";

interface ProvidersSectionProps {
  reducedMotion?: boolean;
}

export default function ProvidersSection({
  reducedMotion = false,
}: ProvidersSectionProps) {
  return (
    <section
      aria-labelledby="providers-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 shadow-lg shadow-blue-500/10"
          >
            <Link2 className="w-8 h-8 text-blue-400" />
          </motion.div>

          <motion.h2
            id="providers-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Use any provider <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              you want
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Bring your own API keys—no markup, no middleman. OpenAI, Anthropic, Gemini, Fal AI,
            Replicate, HuggingFace, OpenRouter, MiniMax, and Kie.ai supported.
          </motion.p>
        </div>

        {/* Screenshot with Tilt */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative mx-auto max-w-5xl mb-20"
        >
          <Tilt3D>
            <div className="relative rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-purple-500/5 pointer-events-none" />
              <Image
                src="/screen_llms.png"
                alt="List of available LLM providers"
                width={1400}
                height={900}
                className="w-full h-auto opacity-90 transition-opacity group-hover:opacity-100"
                loading="lazy"
              />
            </div>
          </Tilt3D>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-16"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {[
            {
              title: "Supported Providers",
              description: "OpenAI, Anthropic, Gemini, Fal AI, Replicate, OpenRouter, MiniMax, Kie.ai, and more.",
              icon: Layers,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              border: "border-blue-500/20",
            },
            {
              title: "Mix and Match",
              description: "Use different providers within a single workflow. Switch models with one click.",
              icon: Zap,
              color: "text-purple-400",
              bg: "bg-purple-500/10",
              border: "border-purple-500/20",
            },
            {
              title: "No Middleman",
              description: "Direct API calls from your machine. No markup, no tracking.",
              icon: ShieldCheck,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              border: "border-emerald-500/20",
            },
          ].map((feature) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-8 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${feature.bg} ${feature.border} border`}>
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  
                  <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-blue-200 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>

        <div className="text-center">
          <DownloadButtons />
        </div>
      </div>
    </section>
  );
}



