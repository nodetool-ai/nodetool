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
    title: "Brand and campaign work",
    description: "Concept frames, key visuals, and ad variants on one canvas. Pick the best image model for the brief, render hundreds of variants, hand off the winners.",
    icon: ImageIcon,
    gradient: "from-emerald-500/20 to-teal-500/20",
    examples: ["Hero key visuals", "Ad variants at scale", "Brand-locked style transfer"],
  },
  {
    title: "Motion and short-form video",
    description: "Wire Seedance, Veo, and Wan into the same canvas as your image and audio nodes. Edit, mask, and composite without leaving the workspace.",
    icon: ImageIcon,
    gradient: "from-blue-500/20 to-cyan-500/20",
    examples: ["Social cutdowns", "Animated key art", "Pre-vis and storyboards"],
  },
  {
    title: "Post-production helpers",
    description: "Inpainting, outpainting, relight, upscale, and rotoscoping nodes alongside the editing tools your team already relies on.",
    icon: FileText,
    gradient: "from-teal-500/20 to-purple-500/20",
    examples: ["Plate cleanup", "AI upscale and restoration", "Background replacement"],
  },
  {
    title: "Asset and library work",
    description: "Batch-tag, batch-caption, and batch-edit your studio's image and video library with the model best suited to each step.",
    icon: BarChart3,
    gradient: "from-cyan-500/20 to-blue-500/20",
    examples: ["Auto-tagging", "Caption generation", "Style-consistent re-renders"],
  },
  {
    title: "Voice and audio",
    description: "ElevenLabs voices, Suno music, and stem separation as nodes. Sync to your motion canvas, render the full piece in one workspace.",
    icon: MessageSquare,
    gradient: "from-rose-500/20 to-pink-500/20",
    examples: ["Voiceover variants", "Music beds", "Localized dub passes"],
  },
  {
    title: "Internal creative pipelines",
    description: "Wire NodeTool into your studio's tools — DAM, asset server, internal services — using REST, webhooks, and custom nodes.",
    icon: Database,
    gradient: "from-amber-500/20 to-orange-500/20",
    examples: ["DAM-to-canvas hand-off", "Approval routing", "Custom node for in-house models"],
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
            What teams <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">ship on it</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Brand work, motion, post-production, and creative ops — on the same canvas as your image, video, and audio nodes.
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
