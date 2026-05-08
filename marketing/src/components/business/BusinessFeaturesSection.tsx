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
    title: "Provider prices, no markup",
    description: "Bring your team's keys to FAL, Replicate, OpenAI, Anthropic, Gemini, and the rest. Pay providers directly — no proprietary credits, no resold tokens.",
    icon: DollarSign,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    title: "Your data, your machines",
    description: "Workflows, assets, and prompts live where you put them — on a workstation, on your own server, or in your team's cloud account. Open source, AGPL-3.0.",
    icon: Lock,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    title: "Connects to what you already use",
    description: "REST APIs, webhooks, custom nodes for your internal tools, and a TypeScript SDK for the engineers on the team.",
    icon: Boxes,
    color: "text-amber-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20",
  },
  {
    title: "Start on a laptop, grow into a server",
    description: "Same workflows on a designer's MacBook, a workstation in the studio, or a Docker host in the team's cloud. No rewrite when you scale.",
    icon: TrendingUp,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    title: "Made for small teams",
    description: "Share workflows, hand off prompts, version control your canvas. One workspace, the people you actually work with.",
    icon: Users,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },
  {
    title: "Extensible by design",
    description: "Open source and node-based. Drop in custom Python or TypeScript nodes for your studio's models, internal services, or proprietary pipelines.",
    icon: FileCode,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    title: "Self-host or hosted",
    description: "Run Studio on your own machines, run Cloud in your browser, or self-host the same Docker images on AWS, Azure, GCP, or a private cloud.",
    icon: Cloud,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
  },
  {
    title: "Heavy frames, handled",
    description: "GPU acceleration for local renders, batch nodes for high-volume work, async queues for long jobs. Built for real production timelines.",
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
            What your team actually gets.
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            One workspace, every model, your keys. Built for the working creatives on your team — not for procurement.
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
