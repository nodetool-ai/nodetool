"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Tilt3D from "../Tilt3D";
import {
  Brain,
  Eye,
  GitFork,
  Palette,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

interface AgentFeaturesSectionProps {
  reducedMotion?: boolean;
}

export default function AgentFeaturesSection({
  reducedMotion = false,
}: AgentFeaturesSectionProps) {
  const features = [
    {
      icon: Brain,
      title: "Briefs become storyboards",
      description:
        "Drop in a one-line prompt or a full mood board. The agent plans the shots, picks the model for each one, and lays out a board you can rearrange before a single render runs.",
      color: "teal",
    },
    {
      icon: GitFork,
      title: "Batch variants in parallel",
      description:
        "Need ten alts of the hero frame in five aspect ratios? The agent fans the work out across providers, runs them at the same time, and brings the cuts back ranked for review.",
      color: "blue",
    },
    {
      icon: Users,
      title: "A crew, not a single model",
      description:
        "Run a director, a stylist, and a colorist as separate agents that hand off via a shared board. Each one gets the model and prompt that fits its job.",
      color: "cyan",
    },
    {
      icon: Wand2,
      title: "Image, video, music — one room",
      description:
        "Agents can call Flux, Nano Banana, and Ideogram for stills, Seedance, Veo, Kling, and Runway for motion, Suno for score, and ElevenLabs for voice. All on one canvas.",
      color: "emerald",
    },
    {
      icon: Eye,
      title: "See every decision",
      description:
        "Watch the agent reason about composition, swap models when a render misses, and log every prompt it tried. No black boxes when the deadline hits.",
      color: "pink",
    },
    {
      icon: Sparkles,
      title: "Bottle your art direction",
      description:
        "Lock down a style guide as a reusable skill — palette, lens, mood, prompt patterns — and every agent on your canvas picks it up automatically.",
      color: "amber",
    },
  ];

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-teal-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 shadow-lg shadow-rose-500/10"
          >
            <Palette className="w-8 h-8 text-rose-300" />
          </motion.div>

          <motion.h2
            id="features-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Built to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-cyan-400">
              direct, not babysit.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Agents are nodes on the same canvas as your image, video, and audio
            workflows — except these nodes have taste, a plan, and the ability to
            self-correct when a render misses.
          </motion.p>
        </div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-6 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 border
                    ${feature.color === "teal" ? "bg-teal-500/10 border-teal-500/20" : ""}
                    ${feature.color === "blue" ? "bg-blue-500/10 border-blue-500/20" : ""}
                    ${feature.color === "cyan" ? "bg-cyan-500/10 border-cyan-500/20" : ""}
                    ${feature.color === "emerald" ? "bg-emerald-500/10 border-emerald-500/20" : ""}
                    ${feature.color === "pink" ? "bg-pink-500/10 border-pink-500/20" : ""}
                    ${feature.color === "amber" ? "bg-amber-500/10 border-amber-500/20" : ""}
                  `}
                  >
                    <feature.icon
                      className={`w-6 h-6
                      ${feature.color === "teal" ? "text-amber-400" : ""}
                      ${feature.color === "blue" ? "text-blue-400" : ""}
                      ${feature.color === "cyan" ? "text-cyan-400" : ""}
                      ${feature.color === "emerald" ? "text-emerald-400" : ""}
                      ${feature.color === "pink" ? "text-pink-400" : ""}
                      ${feature.color === "amber" ? "text-amber-400" : ""}
                    `}
                    />
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-amber-200 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
