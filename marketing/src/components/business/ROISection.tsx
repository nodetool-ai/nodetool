"use client";
import React from "react";
import { motion } from "framer-motion";
import { TrendingDown, Clock, Shield, Zap } from "lucide-react";

interface ROISectionProps {
  reducedMotion?: boolean;
}

const benefits = [
  {
    icon: TrendingDown,
    title: "Provider prices, no markup",
    description: "Same FAL, Replicate, OpenAI, and Anthropic calls — billed to your account, not ours.",
    metric: "0% markup",
    label: "On model calls",
  },
  {
    icon: Clock,
    title: "Pick the best model, day one",
    description: "Seedance is the cheapest on FAL right now. When Veo 4 ships, swap one node and you're on it.",
    metric: "1 node",
    label: "To switch providers",
  },
  {
    icon: Shield,
    title: "Your files, your machines",
    description: "Workflows, prompts, and outputs stay where you put them — on a workstation or in your cloud account.",
    metric: "Self-host",
    label: "On your infrastructure",
  },
  {
    icon: Zap,
    title: "One canvas, fewer tabs",
    description: "Brand work that lives across Midjourney, Runway, and Photoshop collapses into one node-based workspace.",
    metric: "1 workspace",
    label: "Instead of a dozen tabs",
  },
];

export default function ROISection({ reducedMotion }: ROISectionProps) {
  return (
    <section id="roi" className="rhythm-section relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            What <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">vendor neutrality</span> buys you
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            The best model for the job changes every month. Your tool shouldn&apos;t slow that down — and your finance team shouldn&apos;t pay markup for the privilege.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
              className="group"
            >
              <div className="relative h-full rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-900/30 backdrop-blur-sm p-8 transition-all duration-300 hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10">
                <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <benefit.icon className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">{benefit.description}</p>
                <div className="pt-6 border-t border-white/10">
                  <div className="text-2xl font-bold text-emerald-400 mb-1">{benefit.metric}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">{benefit.label}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-16 text-center"
        >
          <div className="inline-block rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 backdrop-blur-xl p-8 md:p-12">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Run the math on your own stack
            </h3>
            <p className="text-slate-300 mb-6 max-w-2xl">
              Compare what your team is paying through resold credits today
              with what FAL, Replicate, OpenAI, and Anthropic charge directly.
              The gap is usually the markup.
            </p>
            <a
              href="https://github.com/nodetool-ai/nodetool/releases"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-semibold hover:from-emerald-400 hover:to-blue-500 transition-all shadow-lg shadow-emerald-500/25"
            >
              Download for your team
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
