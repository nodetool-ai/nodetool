"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Brain,
  GitBranch,
  MessageSquare,
  ArrowRight,
  Repeat,
  CheckCircle,
} from "lucide-react";

export default function AgentWorkflowSection() {
  const workflowSteps = [
    {
      icon: MessageSquare,
      title: "Receive Objective",
      description: "Natural language goal with optional output schema",
      color: "teal",
    },
    {
      icon: Brain,
      title: "Plan & Decompose",
      description: "TaskPlanner breaks objective into a dependency DAG",
      color: "blue",
    },
    {
      icon: GitBranch,
      title: "Parallel Execution",
      description: "Independent tasks run concurrently with tool access",
      color: "cyan",
    },
    {
      icon: Repeat,
      title: "Iterate & Self-Correct",
      description: "Retry with different strategies, up to token budget",
      color: "emerald",
    },
    {
      icon: CheckCircle,
      title: "Validated Output",
      description: "JSON schema-validated result or natural response",
      color: "green",
    },
  ];

  return (
    <div className="py-20">
      <div className="text-center mb-16 max-w-3xl mx-auto">
        <motion.h2
          id="workflow-title"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
        >
          How Agents{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
            Think & Act
          </span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-lg text-slate-400 leading-relaxed"
        >
          NodeTool agents decompose objectives into dependency graphs,
          execute tasks in parallel, use tools iteratively, and deliver schema-validated output.
        </motion.p>
      </div>

      {/* Workflow Steps */}
      <div className="relative">
        {/* Connection Line (Desktop) */}
        <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500/20 via-cyan-500/20 to-green-500/20 -translate-y-1/2 z-0" />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 relative z-10"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.15 } },
          }}
        >
          {workflowSteps.map((step, index) => (
            <motion.div
              key={step.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="relative"
            >
              {/* Arrow connector for mobile */}
              {index < workflowSteps.length - 1 && (
                <div className="lg:hidden absolute -bottom-4 left-1/2 -translate-x-1/2 text-slate-600">
                  <ArrowRight className="w-5 h-5 rotate-90 md:rotate-0" />
                </div>
              )}

              <div
                className={`
                group relative h-full flex flex-col items-center text-center rounded-2xl 
                border border-white/5 bg-slate-900/40 backdrop-blur-sm p-6
                transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10
              `}
              >
                {/* Icon */}
                <div
                  className={`
                  w-14 h-14 rounded-xl flex items-center justify-center mb-4
                  ${step.color === "teal" ? "bg-teal-500/10 border border-teal-500/20" : ""}
                  ${step.color === "blue" ? "bg-blue-500/10 border border-blue-500/20" : ""}
                  ${step.color === "cyan" ? "bg-cyan-500/10 border border-cyan-500/20" : ""}
                  ${step.color === "emerald" ? "bg-emerald-500/10 border border-emerald-500/20" : ""}
                  ${step.color === "green" ? "bg-green-500/10 border border-green-500/20" : ""}
                  group-hover:scale-110 transition-transform duration-300
                `}
                >
                  <step.icon
                    className={`w-7 h-7 
                    ${step.color === "teal" ? "text-amber-400" : ""}
                    ${step.color === "blue" ? "text-blue-400" : ""}
                    ${step.color === "cyan" ? "text-cyan-400" : ""}
                    ${step.color === "emerald" ? "text-emerald-400" : ""}
                    ${step.color === "green" ? "text-green-400" : ""}
                  `}
                  />
                </div>

                {/* Step Number */}
                <div className="absolute top-4 right-4 text-xs font-mono text-slate-600">
                  0{index + 1}
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-400">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Key Capabilities */}
      <motion.div
        className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        variants={{
          show: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {[
          {
            title: "Three Agent Modes",
            description:
              "Loop mode for iterative tool-calling, Plan mode for automatic task decomposition with DAG execution, and Multi-Agent mode with team coordination.",
            gradient: "from-teal-600/20 to-blue-600/20",
          },
          {
            title: "50+ Built-in Tools",
            description:
              "Google search, browser automation, code execution (JS/Python/Bash), PDF processing, image generation, math, file I/O, and HTTP requests.",
            gradient: "from-blue-600/20 to-cyan-600/20",
          },
          {
            title: "Multi-Agent Teams",
            description:
              "Coordinator, autonomous, or hybrid strategies. Agents communicate via message bus, share a task board, and specialize with different models.",
            gradient: "from-cyan-600/20 to-green-600/20",
          },
        ].map((capability) => (
          <motion.div
            key={capability.title}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
            }}
            className="relative rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-8 overflow-hidden"
          >
            {/* Background gradient */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${capability.gradient} opacity-50`}
            />

            <div className="relative z-10">
              <h3 className="text-xl font-semibold text-white mb-3">
                {capability.title}
              </h3>
              <p className="text-slate-400 leading-relaxed">
                {capability.description}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
