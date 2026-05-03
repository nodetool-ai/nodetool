"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Film, Video, Image as ImageIcon, Cloud, Server } from "lucide-react";

interface VideoGenerationSectionProps {
  reducedMotion?: boolean;
}

export default function VideoGenerationSection({
  reducedMotion = false,
}: VideoGenerationSectionProps) {
  return (
    <section
      id="video-generation"
      aria-labelledby="video-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 right-1/2 translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-emerald-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/10"
          >
            <Film className="w-8 h-8 text-emerald-400" />
          </motion.div>

          <motion.h2
            id="video-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            AI Video <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              Generation
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Generate videos from text or images using state-of-the-art models.
            Support for Google Veo, Kling, Hailuo, Wan, and local open-weight generation.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-8"
          >
            <video
              src="/sora.mp4"
              autoPlay
              loop
              muted
              playsInline
              controls
              className="w-full max-w-2xl mx-auto rounded-2xl shadow-2xl shadow-emerald-500/20 border border-white/10"
            />
          </motion.div>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {[
            {
              title: "Wan 2.2",
              description: "Open-weight video diffusion via Replicate—text-to-video and image-to-video.",
              icon: Film,
              category: "Open Weights",
              features: ["Text-to-video", "Image-to-video", "Open model"],
              color: "text-green-400",
              bg: "bg-green-500/10",
              border: "border-green-500/20",
            },
            {
              title: "Kling v2.1",
              description: "Kuaishou's Kling 2.1—5s and 10s clips at up to 1080p from a starting image.",
              icon: Video,
              category: "Text & Image to Video",
              features: ["Image-to-video", "Up to 1080p", "Cinematic output"],
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/20",
            },
            {
              title: "Hailuo 02",
              description: "MiniMax Hailuo 02—6s or 10s clips at 768p or 1080p with strong real-world physics.",
              icon: Video,
              category: "Text & Image to Video",
              features: ["Text-to-video", "Image-to-video", "Real-world physics"],
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              border: "border-emerald-500/20",
            },
            {
              title: "Google Veo 3.1",
              description: "Latest Veo with image-to-video and high motion fidelity.",
              icon: ImageIcon,
              category: "Text & Image to Video",
              features: ["Text-to-video", "Image-to-video", "High fidelity"],
              color: "text-teal-400",
              bg: "bg-teal-500/10",
              border: "border-teal-500/20",
            },
            {
              title: "HuggingFace",
              description: "Pull any compatible video model from the Hub via inference providers.",
              icon: Cloud,
              category: "Cloud Video Models",
              features: ["Text-to-video", "Multiple providers", "API access"],
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/20",
            },
            {
              title: "Local Generation",
              description: "Run open-weight video models on your own GPU through the local HuggingFace bridge.",
              icon: Server,
              category: "Self-Hosted",
              features: ["Open-weight models", "No API costs", "Full privacy"],
              color: "text-blue-400",
              bg: "bg-blue-500/10",
              border: "border-blue-500/20",
            },
          ].map((item) => (
            <motion.div
              key={item.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-6 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${item.bg} ${item.border} border`}>
                    <item.icon className={`w-6 h-6 ${item.color}`} />
                  </div>

                  <div className="mb-2">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${item.bg} ${item.color} border ${item.border}`}>
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-200 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-400 mb-4 flex-grow">
                    {item.description}
                  </p>

                  <ul className="space-y-2 border-t border-white/5 pt-4">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-center text-xs text-slate-500">
                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${item.color.replace('text-', 'bg-')}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}



