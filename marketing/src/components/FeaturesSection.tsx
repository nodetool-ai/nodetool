"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import {
  Workflow,
  Database,
  Layers,
  MousePointer2,
  Activity,
} from "lucide-react";

interface FeaturesSectionProps {
  reducedMotion?: boolean;
}

export default function FeaturesSection({
  reducedMotion = false,
}: FeaturesSectionProps) {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 shadow-lg shadow-blue-500/10"
          >
            <Workflow className="w-8 h-8 text-blue-400" />
          </motion.div>

          <motion.h2
            id="features-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            One canvas <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              for the whole craft
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Image, video, audio, and text on a single node-based canvas — with
            the editing tools you rely on: masks, inpaint, outpaint, relight,
            upscale, layers, compositing.
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

              {/* Browser/Window Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                <div className="ml-4 text-xs text-slate-500 font-medium flex items-center gap-2">
                  <MousePointer2 className="w-3 h-3" />
                  Workflow Editor
                </div>
              </div>

              <Image
                src="/screen_canvas.png"
                alt="Visual canvas showing a workflow"
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
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {[
            {
              title: "Editing tools, not just generation",
              description:
                "Masks, inpaint, outpaint, relight, upscale, layers, compositing. The post tools you reach for, wired into the same canvas as the model calls.",
              icon: MousePointer2,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              border: "border-blue-500/20",
            },
            {
              title: "Watch every node render",
              description:
                "Outputs stream in as nodes finish. Inspect any frame, swap a model, re-run from that node down.",
              icon: Activity,
              color: "text-purple-400",
              bg: "bg-purple-500/10",
              border: "border-purple-500/20",
            },
            {
              title: "Your keys, provider prices",
              description:
                "BYOK for FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and the rest. No credits, no markup, no curated roster.",
              icon: Database,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              border: "border-emerald-500/20",
            },
            {
              title: "Image, video, audio, text",
              description:
                "Flux, Seedance, Wan, ControlNet, Whisper, ElevenLabs, Suno — every modality on one canvas, named by their real names.",
              icon: Layers,
              color: "text-orange-400",
              bg: "bg-orange-500/10",
              border: "border-orange-500/20",
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
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-6 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${feature.bg} ${feature.border} border`}
                  >
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-blue-200 transition-colors">
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
