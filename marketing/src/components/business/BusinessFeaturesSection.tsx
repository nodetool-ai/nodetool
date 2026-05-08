"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Lock,
  Boxes,
  TrendingUp,
  Users,
  FileCode,
  Cloud,
  Gauge,
} from "lucide-react";

interface BusinessFeaturesSectionProps {
  reducedMotion?: boolean;
}

const features = [
  {
    title: "No credit markup",
    description: "Bring your own keys to FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more. Pay providers directly at provider prices — no resold tokens, no minimum top-up.",
    icon: DollarSign,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    title: "Your keys, your data",
    description: "Workflows, files, and provider keys belong to you. Run Studio on your machine, run Cloud in the browser, or self-host the same open-source code.",
    icon: Lock,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    title: "One canvas, every modality",
    description: "Image, video, audio, and text on the same surface. Masks, inpaint, outpaint, relight, upscale, layers, and compositing built in — no exporting between tools.",
    icon: Boxes,
    color: "text-amber-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20",
  },
  {
    title: "Scale on your terms",
    description: "Start with one creative on a laptop. Add team members on Cloud, or run the same workflows on your own GPUs — same nodes either way.",
    icon: TrendingUp,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    title: "Built to share",
    description: "Hand off workflows between team members. Version them in git. Re-run them six months later when you need that look again.",
    icon: Users,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },
  {
    title: "Extensible by design",
    description: "Open source under AGPL-3.0. Add your own nodes, wire in proprietary models, and drive the canvas from CLI or SDK when you need to.",
    icon: FileCode,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    title: "Run it anywhere",
    description: "Studio on macOS, Windows, and Linux. Cloud in any browser. Self-host the runtime on your own boxes — same open-source codebase across all three.",
    icon: Cloud,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
  },
  {
    title: "Use the best model for the job",
    description: "Seedance, Flux, Veo, Kling, Hailuo, Whisper, ElevenLabs, Suno — switch the moment a better model ships, without rebuilding your workflow.",
    icon: Gauge,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20",
  },
];

export default function BusinessFeaturesSection({ reducedMotion }: BusinessFeaturesSectionProps) {
  return (
    <section id="features" className="rhythm-section relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/10 to-transparent pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            One workspace. Every model. Your keys.
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Everything your team needs to build, share, and re-run creative AI workflows on a canvas you actually own.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.05 }}
              className="group"
            >
              <div className={`relative h-full rounded-2xl border ${feature.borderColor} ${feature.bgColor} backdrop-blur-sm p-6 transition-all duration-300 hover:border-white/20 hover:shadow-lg`}>
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} border ${feature.borderColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
