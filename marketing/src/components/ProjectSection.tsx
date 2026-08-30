"use client";
import React from "react";
import { motion } from "framer-motion";
import ProjectShowcase from "./ProjectShowcase";
import { FolderKanban } from "lucide-react";

export default function ProjectSection() {
  return (
    <section
      id="projects"
      aria-labelledby="projects-title"
      className="relative py-24 overflow-clip-safe"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/10"
          >
            <FolderKanban className="w-8 h-8 text-emerald-400" />
          </motion.div>

          <motion.h2
            id="projects-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Go from conversation to <br />
            <span className="text-white">complete project.</span>
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Stop copy-pasting from chat windows. Describe what you need, and
            NodeTool generates the full project in seconds.
          </motion.p>

          <motion.a
            href="/agents"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.08 }}
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 transition-colors hover:text-emerald-200 focus-ring"
          >
            How agents and workflows work together →
          </motion.a>
        </div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="scroll-fade"
        >
          <ProjectShowcase />
        </motion.div>
      </div>
    </section>
  );
}
