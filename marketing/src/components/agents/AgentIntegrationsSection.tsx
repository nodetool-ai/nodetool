"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Search,
  Database,
  Cloud,
  FileText,
  MessageCircle,
  Calendar,
  Mail,
  Terminal,
  Braces,
  Webhook,
  Folder,
} from "lucide-react";

interface AgentIntegrationsSectionProps {
  reducedMotion?: boolean;
}

const integrations = [
  {
    category: "LLM Providers",
    items: [
      { name: "OpenAI", icon: "🤖" },
      { name: "Anthropic", icon: "🧠" },
      { name: "Gemini", icon: "💎" },
      { name: "Ollama / Local", icon: "💻" },
    ],
    color: "teal",
  },
  {
    category: "Search & Web",
    items: [
      { name: "Google Search", icon: Search },
      { name: "Google News", icon: "📰" },
      { name: "Browser Automation", icon: Globe },
      { name: "HTTP Requests", icon: "🌐" },
    ],
    color: "blue",
  },
  {
    category: "Data & Storage",
    items: [
      { name: "ChromaDB", icon: Database },
      { name: "Files & Folders", icon: Folder },
      { name: "Assets", icon: Cloud },
      { name: "Downloads", icon: "📥" },
    ],
    color: "cyan",
  },
  {
    category: "Documents & Media",
    items: [
      { name: "PDF Extract/Convert", icon: FileText },
      { name: "Markdown", icon: "📝" },
      { name: "Image Generation", icon: "🎨" },
      { name: "Text-to-Speech", icon: "🔊" },
    ],
    color: "emerald",
  },
  {
    category: "Code & Math",
    items: [
      { name: "JS/Python/Bash", icon: Terminal },
      { name: "Calculator", icon: "🔢" },
      { name: "Statistics", icon: "📊" },
      { name: "Geometry", icon: "📐" },
    ],
    color: "pink",
  },
  {
    category: "Team Collaboration",
    items: [
      { name: "Message Bus", icon: MessageCircle },
      { name: "Task Board", icon: "📋" },
      { name: "Email Search", icon: Mail },
      { name: "Agent Handoff", icon: "🤝" },
    ],
    color: "amber",
  },
];

export default function AgentIntegrationsSection({
  reducedMotion = false,
}: AgentIntegrationsSectionProps) {
  return (
    <section
      id="integrations"
      aria-labelledby="integrations-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-900/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.h2
            id="integrations-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Connect to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
              Everything
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            NodeTool agents can connect to any service, API, or data source.
            Built-in integrations make it easy to get started.
          </motion.p>
        </div>

        {/* Integration Categories */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {integrations.map((category) => (
            <motion.div
              key={category.category}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="group relative rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-6 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10"
            >
              {/* Category Header */}
              <h3
                className={`text-lg font-semibold mb-4
                ${category.color === "teal" ? "text-amber-300" : ""}
                ${category.color === "blue" ? "text-blue-300" : ""}
                ${category.color === "cyan" ? "text-cyan-300" : ""}
                ${category.color === "emerald" ? "text-emerald-300" : ""}
                ${category.color === "pink" ? "text-pink-300" : ""}
                ${category.color === "amber" ? "text-amber-300" : ""}
              `}
              >
                {category.category}
              </h3>

              {/* Integration Items */}
              <div className="grid grid-cols-2 gap-3">
                {category.items.map((item) => (
                  <div
                    key={item.name}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg 
                      bg-white/5 border border-white/5
                      transition-all duration-200
                      hover:bg-white/10 hover:border-white/10
                    `}
                  >
                    {typeof item.icon === "string" ? (
                      <span className="text-lg">{item.icon}</span>
                    ) : (
                      <item.icon className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-300">{item.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16 rounded-2xl border border-white/10 bg-gradient-to-r from-teal-900/20 via-slate-900/50 to-blue-900/20 p-8 md:p-12 text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Need a Custom Integration?
          </h3>
          <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
            NodeTool is fully extensible. Create custom nodes to connect to any
            service, or use the TypeScript SDK to build integrations programmatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://docs.nodetool.ai/integrations"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            >
              <Braces className="w-5 h-5" />
              View Integration Docs
            </a>
            <a
              href="https://github.com/nodetool-ai/nodetool"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white hover:bg-teal-500 transition-all"
            >
              <Terminal className="w-5 h-5" />
              Build Custom Nodes
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
