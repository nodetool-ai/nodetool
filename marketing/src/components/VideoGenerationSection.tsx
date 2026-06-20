"use client";
import React from "react";
import { motion } from "framer-motion";
import { Film } from "lucide-react";

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
            <span className="text-white">
              Generation
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-300 leading-relaxed"
          >
            Generate video from text or images with Google Veo, Kling, Hailuo,
            and Wan — or run open-weight models on your own hardware.
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
            <p className="mt-3 text-xs text-slate-400">
              Sample output, shown for illustration. Results depend on the model
              and provider you choose.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}



