"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Mail,
  Database,
  Image as ImageIcon,
  MessageSquare,
  BarChart3,
} from "lucide-react";

interface BusinessUseCasesSectionProps {
  reducedMotion?: boolean;
}

const useCases = [
  {
    title: "Brand campaigns at speed",
    description: "Generate on-brand visuals, social posts, and ad variants from a single workflow your team can re-run all season.",
    icon: ImageIcon,
    gradient: "from-emerald-500/20 to-teal-500/20",
    examples: ["Ad creative variants", "Social post sets", "Brand-consistent imagery"],
  },
  {
    title: "Video & post-production",
    description: "Wire Seedance, Veo, Kling, and Runway alongside your existing edit tools. Generate B-roll, run upscales, and ship cuts faster.",
    icon: MessageSquare,
    gradient: "from-blue-500/20 to-cyan-500/20",
    examples: ["B-roll generation", "Upscale & relight", "Frame-accurate edits"],
  },
  {
    title: "Pitch & concept work",
    description: "Move from rough idea to a presentable pitch deck of stills, motion, and voiceover in a single afternoon — without leaving the canvas.",
    icon: Mail,
    gradient: "from-teal-500/20 to-purple-500/20",
    examples: ["Mood boards", "Animatics", "Voiceover with ElevenLabs"],
  },
  {
    title: "Asset libraries & batch work",
    description: "Process hundreds of stills, generate variants, and tag everything — without juggling browser tabs across Midjourney, Runway, and Photoshop.",
    icon: BarChart3,
    gradient: "from-cyan-500/20 to-blue-500/20",
    examples: ["Batch upscale", "Style transfer at scale", "Auto-tagging"],
  },
  {
    title: "Agent-driven research",
    description: "Drop a planning agent into the canvas to research references, compile mood boards, and draft creative briefs from your prompts.",
    icon: FileText,
    gradient: "from-rose-500/20 to-pink-500/20",
    examples: ["Reference research", "Brief drafting", "Mood board scraping"],
  },
  {
    title: "Custom team workflows",
    description: "Wrap the steps your team does every week into a workflow they can re-run, share, and version — on a canvas, not a script.",
    icon: Database,
    gradient: "from-amber-500/20 to-orange-500/20",
    examples: ["Repeatable team recipes", "Shared workflow library", "Workflow handoff"],
  },
];

export default function BusinessUseCasesSection({ reducedMotion }: BusinessUseCasesSectionProps) {
  return (
    <section id="use-cases" className="rhythm-section relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Real workflows for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">creative teams</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            From small studios to agency creative teams, NodeTool runs the visual AI work your team already does — on a canvas you actually own.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
              className="group"
            >
              <div className={`relative h-full rounded-2xl border border-white/10 bg-gradient-to-br ${useCase.gradient} backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20 hover:shadow-2xl`}>
                <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <useCase.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{useCase.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed">{useCase.description}</p>
                <div className="space-y-2">
                  {useCase.examples.map((example) => (
                    <div key={example} className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {example}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
