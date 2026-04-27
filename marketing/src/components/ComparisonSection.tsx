"use client";
import React from "react";
import { motion } from "framer-motion";

interface ComparisonSectionProps {
  reducedMotion?: boolean;
}

export default function ComparisonSection({
  reducedMotion = false,
}: ComparisonSectionProps) {
  return (
    <section
      id="differences"
      aria-labelledby="differences-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-[600px] h-[300px] bg-violet-900/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.h2
            id="differences-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            How NodeTool Differs
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            NodeTool combines concepts from existing tools while specializing for AI development
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <ComparisonCard
            title="vs ComfyUI"
            comparison="ComfyUI"
            focus="Image generation workflows with Stable Diffusion"
            nodeTool="General AI workflows: LLMs, RAG, audio, video, and images"
            reducedMotion={reducedMotion}
          />

          <ComparisonCard
            title="vs n8n"
            comparison="n8n"
            focus="General workflow automation for business processes and APIs"
            nodeTool="AI-specific workflows with native model management and local LLM support"
            reducedMotion={reducedMotion}
          />

          <ComparisonCard
            title="vs LangChain"
            comparison="LangChain"
            focus="Code-first Python framework for LLM applications"
            nodeTool="Visual node interface with no coding required (extensible via Python)"
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Additional Context */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 max-w-3xl mx-auto"
        >
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-8">
            <h3 className="text-xl font-semibold text-white mb-4">NodeTool&apos;s Position</h3>
            <p className="text-slate-300 leading-relaxed mb-4">
              NodeTool takes the node-based visual approach from ComfyUI and applies it to the broader AI development 
              space. Unlike general automation tools like n8n, NodeTool is built specifically for AI workloads with 
              features like local model management, type-safe multimodal connections, and RAG pipeline support.
            </p>
            <p className="text-slate-300 leading-relaxed">
              Compared to code-first frameworks like LangChain, NodeTool provides a visual interface that eliminates 
              boilerplate while remaining extensible through custom Python nodes. It runs locally by default, addressing 
              privacy concerns inherent in cloud-only solutions.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

interface ComparisonCardProps {
  title: string;
  comparison: string;
  focus: string;
  nodeTool: string;
  reducedMotion: boolean;
}

function ComparisonCard({
  title,
  comparison,
  focus,
  nodeTool,
  reducedMotion,
}: ComparisonCardProps) {
  return (
    <motion.div
      initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="relative group"
    >
      <div className="relative h-full rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft p-6 hover:border-violet-500/50 transition-all duration-300">
        {/* Inner glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 0%, rgba(139, 92, 246, 0.08), transparent 55%)",
          }}
        />

        <div className="relative z-10">
          <h3 className="text-xl font-bold text-white mb-6">{title}</h3>

          {/* Comparison Tool */}
          <div className="mb-6 pb-6 border-b border-slate-700/50">
            <div className="text-sm font-medium text-slate-400 mb-2">{comparison}</div>
            <div className="text-slate-300 leading-relaxed">{focus}</div>
          </div>

          {/* NodeTool */}
          <div>
            <div className="text-sm font-medium text-violet-400 mb-2">NodeTool</div>
            <div className="text-slate-300 leading-relaxed">{nodeTool}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
