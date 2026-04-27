"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Code2,
  Terminal,
  Blocks,
  Cpu,
  Database,
  GitBranch,
  Package,
  Workflow,
  Zap,
} from "lucide-react";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const features = [
  {
    title: "Python SDK",
    description:
      "Build and run workflows programmatically. Full type hints, async support, and comprehensive documentation.",
    icon: Code2,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    code: `from nodetool import Workflow

workflow = Workflow.load("my-workflow")
result = await workflow.run({
    "prompt": "A sunset over mountains"
})`,
  },
  {
    title: "REST API",
    description:
      "HTTP endpoints for all operations. Create, run, and manage workflows from any language or platform.",
    icon: Terminal,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    code: `curl -X POST https://api.nodetool.ai/run \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{"workflow": "img-gen", "inputs": {"prompt": "..."}}'`,
  },
  {
    title: "Custom Nodes",
    description:
      "Extend NodeTool with your own nodes. Package and share custom functionality with the community.",
    icon: Blocks,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    code: `@node
class MyCustomNode:
    prompt: str = Field(...)
    
    async def process(self) -> str:
        return await my_logic(self.prompt)`,
  },
];

const capabilities = [
  {
    icon: Cpu,
    title: "Local & Cloud Execution",
    description: "Run on your machine or deploy to RunPod, AWS, or any cloud.",
  },
  {
    icon: Database,
    title: "Built-in Vector Store",
    description: "ChromaDB integration for RAG and semantic search workflows.",
  },
  {
    icon: GitBranch,
    title: "Version Control Ready",
    description: "Workflows are JSON files. Track changes with Git.",
  },
  {
    icon: Package,
    title: "Package System",
    description: "Install nodes from the community or publish your own.",
  },
  {
    icon: Workflow,
    title: "Visual + Code",
    description: "Design visually, export to Python, or mix both approaches.",
  },
  {
    icon: Zap,
    title: "GPU Acceleration",
    description: "Native CUDA, ROCm, and Metal support for fast inference.",
  },
];

interface DeveloperFeaturesSectionProps {
  reducedMotion: boolean;
}

export default function DeveloperFeaturesSection({
  reducedMotion,
}: DeveloperFeaturesSectionProps) {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
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
            className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20 mb-4"
          >
            Developer Experience
          </motion.span>
          <motion.h2
            id="features-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Build with Powerful APIs
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            Everything you need to integrate AI workflows into your applications
          </motion.p>
        </div>

        {/* Main Features with Code */}
        <div className="grid gap-8 lg:grid-cols-3">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={`group relative rounded-2xl ${feature.bgColor} border ${feature.borderColor} p-6 backdrop-blur-sm`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.bgColor} ring-1 ${feature.borderColor}`}
                >
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
              </div>
              <p className="text-slate-400 mb-4">{feature.description}</p>
              <pre className="rounded-lg bg-slate-900/80 p-4 text-xs text-slate-300 overflow-x-auto font-mono">
                <code>{feature.code}</code>
              </pre>
            </motion.div>
          ))}
        </div>

        {/* Capabilities Grid */}
        <div className="mt-20">
          <motion.h3
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl font-bold text-white text-center mb-10"
          >
            Everything You Need
          </motion.h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap, idx) => (
              <motion.div
                key={cap.title}
                initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="flex items-start gap-4 rounded-xl bg-slate-800/40 p-5 ring-1 ring-slate-700/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
                  <cap.icon className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">{cap.title}</h4>
                  <p className="mt-1 text-sm text-slate-400">{cap.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
