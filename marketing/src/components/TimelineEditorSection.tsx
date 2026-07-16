"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Clapperboard, Sparkles, Layers, Download } from "lucide-react";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-sky-500/50 hover:shadow-strong";

const highlights = [
  {
    icon: Sparkles,
    title: "Generate at the playhead",
    body: "Prompt a model and the new clip lands on the track right under the playhead — no import step.",
  },
  {
    icon: Layers,
    title: "Multi-track video & audio",
    body: "AI video and AI audio share one timeline. Stack tracks, trim, split, and rearrange clips.",
  },
  {
    icon: Download,
    title: "Export a finished cut",
    body: "Render the whole sequence to a single video — the edit happens where you generate, not in another app.",
  },
];

export default function TimelineEditorSection() {
  return (
    <section
      id="timeline-editor"
      aria-labelledby="timeline-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-sky-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-sky-500/10 border border-sky-500/20 shadow-lg shadow-sky-500/10"
          >
            <Clapperboard className="w-8 h-8 text-sky-400" />
          </motion.div>

          <motion.h2
            id="timeline-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Built-in <span className="text-white">video editor</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-300 leading-relaxed"
          >
            Generate AI video and audio straight onto a multi-track timeline.
            Prompt a model at the playhead, drop the clip on a track, then trim,
            split, and export a finished cut.
          </motion.p>
        </div>

        <motion.figure
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 overflow-hidden shadow-2xl shadow-sky-900/20 ring-1 ring-white/5 backdrop-blur-sm">
            <Image
              src="/creatives_timeline.webp"
              alt="NodeTool's built-in timeline editor: a video preview with a clip inspector panel (Transform and Color controls) on the right, a multi-track timeline with AI-generated video clips on a video track and an audio waveform below, plus a 'Generate a video at the playhead' prompt bar with a model selector and an Export button"
              width={2000}
              height={1304}
              className="h-auto w-full"
              loading="lazy"
            />
          </div>
        </motion.figure>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className={`group ${cardBase} ${cardHoverUnified} p-6`}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
                <Icon
                  className="h-6 w-6 text-sky-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
