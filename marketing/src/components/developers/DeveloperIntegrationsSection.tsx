"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Image,
  Video,
  Mic,
  FileText,
  Search,
  Globe,
  Braces,
} from "lucide-react";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const integrations = [
  {
    category: "Language Models",
    icon: Bot,
    color: "text-blue-400",
    items: ["OpenAI GPT-5.4", "Anthropic Claude", "Ollama", "Llama", "Mistral", "Qwen"],
  },
  {
    category: "Image Generation",
    icon: Image,
    color: "text-pink-400",
    items: ["FLUX", "gpt-image-1.5", "Ideogram", "Stable Diffusion"],
  },
  {
    category: "Video & Audio",
    icon: Video,
    color: "text-amber-400",
    items: ["Seedance 2.0", "Kling 3.0", "Runway", "Sora", "ElevenLabs", "Suno", "Whisper"],
  },
  {
    category: "Data & Search",
    icon: Search,
    color: "text-emerald-400",
    items: ["ChromaDB", "Pinecone", "Weaviate", "Elasticsearch", "PostgreSQL"],
  },
];

const nodeCategories = [
  { name: "LLM", count: "50+", icon: Bot },
  { name: "Image", count: "80+", icon: Image },
  { name: "Video", count: "30+", icon: Video },
  { name: "Audio", count: "25+", icon: Mic },
  { name: "Text", count: "40+", icon: FileText },
  { name: "Data", count: "35+", icon: Braces },
  { name: "Web", count: "20+", icon: Globe },
  { name: "Utils", count: "60+", icon: Search },
];

interface DeveloperIntegrationsSectionProps {
  reducedMotion: boolean;
}

export default function DeveloperIntegrationsSection({
  reducedMotion,
}: DeveloperIntegrationsSectionProps) {
  return (
    <section
      id="integrations"
      aria-labelledby="integrations-title"
      className="rhythm-section relative"
    >
      <div className={sectionContainer}>
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20 mb-4"
          >
            Integrations
          </motion.span>
          <motion.h2
            id="integrations-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Connect to Everything
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            340+ built-in nodes. Every major AI provider and model supported out of the box.
          </motion.p>
        </div>

        {/* Node Categories Stats */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-4 sm:grid-cols-8 gap-4 mb-16"
        >
          {nodeCategories.map((cat, idx) => (
            <motion.div
              key={cat.name}
              initial={reducedMotion ? {} : { opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="flex flex-col items-center gap-2 rounded-xl bg-slate-800/40 p-4 ring-1 ring-slate-700/50"
            >
              <cat.icon className="h-6 w-6 text-violet-400" />
              <span className="text-xl font-bold text-white">{cat.count}</span>
              <span className="text-xs text-slate-400">{cat.name}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Integration Categories */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration, idx) => (
            <motion.div
              key={integration.category}
              initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex items-center gap-3 mb-4">
                <integration.icon className={`h-6 w-6 ${integration.color}`} />
                <h3 className="font-semibold text-white">{integration.category}</h3>
              </div>
              <ul className="space-y-2">
                {integration.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm text-slate-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Open Source CTA */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16 text-center rounded-2xl bg-gradient-to-br from-violet-900/20 to-indigo-900/20 p-10 ring-1 ring-violet-500/20"
        >
          <h3 className="text-2xl font-bold text-white mb-4">
            100% Open Source
          </h3>
          <p className="text-slate-400 max-w-xl mx-auto mb-6">
            NodeTool is MIT licensed. Fork it, modify it, host it yourself.
            No vendor lock-in, no usage limits, complete control over your AI infrastructure.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/nodetool-ai/nodetool"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-3 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Star on GitHub
            </a>
            <a
              href="https://discord.gg/WmQTWZRcYE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500"
            >
              Join Discord Community
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
