"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Tilt3D from "../Tilt3D";
import {
  Brain,
  Eye,
  GitFork,
  Palette,
  Sparkles,
  Users,
  Wand2,
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
      title: "The whole app is the toolbelt",
      description:
        "Around 120 tools cover every editor: the node canvas, the layered sketch pad, the storyboard, the video timeline, the script editor, the 3D scene, and the app builder. If you can click it, an agent can drive it.",
      color: "teal",
    },
    {
      icon: GitFork,
      title: "Agents build workflows",
      description:
        "Describe the pipeline and the agent authors the graph itself — picks the nodes, wires the edges, selects the models — and validates it before anything runs. What it leaves behind is a workflow you can inspect, edit, and rerun.",
      color: "blue",
    },
    {
      icon: Wand2,
      title: "Agents build apps — and test them",
      description:
        "Ask for a mini app and the agent plans the workflows, places the widgets, wires them together, then runs every interaction and has a second model judge whether the result does what you asked. No passing verdict, no app.",
      color: "cyan",
    },
    {
      icon: Users,
      title: "An agent on the failure path",
      description:
        "Supervised runs put an agent on call: when a step fails mid-run, it decides — retry, repair the output, skip the item, or stop — inside a decision and cost budget you set, with every intervention logged.",
      color: "emerald",
    },
    {
      icon: Eye,
      title: "It asks instead of guessing",
      description:
        "When a job is missing something only you can decide — a name, a look, permission to delete — the agent stops and asks. Every plan, tool call, prompt, and dollar of model spend is on the record.",
      color: "pink",
    },
    {
      icon: Sparkles,
      title: "Bring your own agent",
      description:
        "The full toolbelt is exposed over MCP. Point Claude Desktop, Claude Code, or any MCP-aware agent at NodeTool and it gets the same tools the built-in chat uses: build workflows, run them, read the results.",
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
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 shadow-lg shadow-rose-500/10"
          >
            <Palette className="w-8 h-8 text-rose-300" />
          </motion.div>

          <motion.h2
            id="features-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Agent-first,{" "}
            <span className="text-white">
              not agent-flavored.
            </span>
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Most tools bolted a chat panel onto an editor. NodeTool went the
            other way: the entire app is built as tools an agent can operate.
            Agents don&apos;t just answer questions about your work — they do
            the work, on the same surfaces you use.
          </motion.p>
        </div>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 1, y: 0 },
                show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
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
