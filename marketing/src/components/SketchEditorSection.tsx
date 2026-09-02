"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Brush, Sparkles, Layers, Wand2 } from "lucide-react";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-violet-500/50 hover:shadow-strong";

const highlights = [
  {
    icon: Brush,
    title: "A real brush engine",
    body: "Round, soft, airbrush, and spray brushes with size, opacity, hardness, and angle. Pick any color and paint straight onto the canvas.",
  },
  {
    icon: Layers,
    title: "Layers & blend modes",
    body: "Stack layers, set opacity and blend modes, reorder and mask — the same controls you reach for in a pro image editor.",
  },
  {
    icon: Sparkles,
    title: "Generate onto a layer",
    body: "Describe an image and it lands on its own layer. Mix hand-painted strokes with text-to-image and image-to-image right where you draw.",
  },
];

export default function SketchEditorSection() {
  return (
    <section
      id="sketch-editor"
      aria-labelledby="sketch-title"
      className="relative py-24 overflow-clip-safe"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-violet-500/10 border border-violet-500/20 shadow-lg shadow-violet-500/10"
          >
            <Wand2 className="w-8 h-8 text-violet-400" />
          </motion.div>

          <motion.h2
            id="sketch-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Built-in <span className="text-white">sketch editor</span>
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-300 leading-relaxed"
          >
            A full layer-based image editor with generation built in. Paint with
            real brushes, stack layers and blend modes, then prompt a model to
            create or refine any layer — and export a finished PNG without
            leaving the canvas.
          </motion.p>
        </div>

        <motion.figure
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}
          className="scroll-fade relative"
        >
          <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 overflow-hidden shadow-2xl shadow-violet-900/20 ring-1 ring-white/5 backdrop-blur-sm">
            <Image
              src="/screen_sketch_editor.webp"
              alt="NodeTool's built-in sketch editor: a layered canvas holding an AI-generated 'Kung Fu' movie poster, with a brush toolbar and brush settings across the top, a color picker and a layers panel with text-to-image layers on the right, and a 'Describe the image' generate bar with a Flux Schnell model selector and an Export PNG button"
              width={2000}
              height={1300}
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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
                <Icon
                  className="h-6 w-6 text-violet-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
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
