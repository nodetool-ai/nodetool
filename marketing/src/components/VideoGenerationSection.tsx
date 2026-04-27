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
            Support for Seedance 2.0, OpenAI Sora, Google Veo, Kling 3.0, and local generation.
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
              title: "Seedance 2.0",
              description: "State-of-the-art video generation with exceptional motion quality",
              icon: Film,
              category: "Best-in-Class",
              features: ["Text-to-video", "Image-to-video", "Superior motion"],
              color: "text-green-400",
              bg: "bg-green-500/10",
              border: "border-green-500/20",
            },
            {
              title: "Kling 3.0",
              description: "Latest Kling model with cinematic quality",
              icon: Video,
              category: "Text & Image to Video",
              features: ["Text-to-video", "Image-to-video", "Cinematic output"],
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/20",
            },
            {
              title: "OpenAI Sora",
              description: "Sora 2 & Sora 2 Pro models",
              icon: Video,
              category: "Text & Image to Video",
              features: ["Text-to-video", "Image-to-video", "Auto-sizing"],
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              border: "border-emerald-500/20",
            },
            {
              title: "Google Veo",
              description: "Veo 2.0, 3.0, and 3.0 Fast",
              icon: ImageIcon,
              category: "Text & Image to Video",
              features: ["Text-to-video", "Image-to-video", "Fast generation"],
              color: "text-teal-400",
              bg: "bg-teal-500/10",
              border: "border-teal-500/20",
            },
            {
              title: "HuggingFace",
              description: "Via inference providers",
              icon: Cloud,
              category: "Cloud Video Models",
              features: ["Text-to-video", "Multiple providers", "API access"],
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/20",
            },
            {
              title: "Local Generation",
              description: "Self-hosted video generation—run models entirely on your machine.",
              icon: Server,
              category: "Self-Hosted",
              features: ["Wan 2.2 T2V", "No API costs", "Full privacy"],
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



