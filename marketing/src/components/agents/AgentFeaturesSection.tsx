"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Tilt3D from "../Tilt3D";
import {
  Bot,
  Brain,
  Code2,
  Eye,
  GitFork,
  Lock,
  Puzzle,
  RefreshCw,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

interface AgentFeaturesSectionProps {
  reducedMotion?: boolean;
}

export default function AgentFeaturesSection({
  reducedMotion = false,
}: AgentFeaturesSectionProps) {
  const features = [
    {
      icon: Brain,
      title: "Three Execution Modes",
      description:
        "Loop mode for simple tasks, Plan mode for automatic task decomposition with parallel DAG execution, and Multi-Agent mode for team collaboration.",
      color: "teal",
    },
    {
      icon: GitFork,
      title: "Task Planning & Parallel Execution",
      description:
        "TaskPlanner decomposes objectives into dependency graphs. ParallelTaskExecutor runs independent tasks concurrently with automatic result passing.",
      color: "blue",
    },
    {
      icon: RefreshCw,
      title: "Multi-Agent Teams",
      description:
        "Coordinator, autonomous, or hybrid strategies. Agents communicate via message bus, share a task board, and specialize with different models and tools.",
      color: "cyan",
    },
    {
      icon: Puzzle,
      title: "50+ Built-in Tools",
      description:
        "Web search, browser automation, code execution, PDF processing, image generation, math, file operations, HTTP requests, and more.",
      color: "emerald",
    },
    {
      icon: Eye,
      title: "Full Observability",
      description:
        "Real-time streaming of reasoning traces, tool calls, and task progress. OpenTelemetry tracing and structured logging built in.",
      color: "pink",
    },
    {
      icon: Sparkles,
      title: "Skill System",
      description:
        "Auto-discoverable SKILL.md files inject domain expertise into agent prompts. Match skills by keyword or select explicitly.",
      color: "amber",
    },
  ];

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-teal-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-teal-500/10 border border-teal-500/20 shadow-lg shadow-teal-500/10"
          >
            <Bot className="w-8 h-8 text-amber-400" />
          </motion.div>

          <motion.h2
            id="features-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Agent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
              Superpowers
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Build agents that think, plan, and execute with the same visual
            tools you use for any NodeTool workflow.
          </motion.p>
        </div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {features.map((feature) => (
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
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 border
                    ${feature.color === "teal" ? "bg-teal-500/10 border-teal-500/20" : ""}
                    ${feature.color === "blue" ? "bg-blue-500/10 border-blue-500/20" : ""}
                    ${feature.color === "cyan" ? "bg-cyan-500/10 border-cyan-500/20" : ""}
                    ${feature.color === "emerald" ? "bg-emerald-500/10 border-emerald-500/20" : ""}
                    ${feature.color === "pink" ? "bg-pink-500/10 border-pink-500/20" : ""}
                    ${feature.color === "amber" ? "bg-amber-500/10 border-amber-500/20" : ""}
                  `}
                  >
                    <feature.icon
                      className={`w-6 h-6
                      ${feature.color === "teal" ? "text-amber-400" : ""}
                      ${feature.color === "blue" ? "text-blue-400" : ""}
                      ${feature.color === "cyan" ? "text-cyan-400" : ""}
                      ${feature.color === "emerald" ? "text-emerald-400" : ""}
                      ${feature.color === "pink" ? "text-pink-400" : ""}
                      ${feature.color === "amber" ? "text-amber-400" : ""}
                    `}
                    />
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-amber-200 transition-colors">
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
