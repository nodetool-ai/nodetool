"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Box,
  Layers,
  Network,
  Zap,
  Code2,
  Database,
  PackagePlus,
  Terminal,
} from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const installationCodeSource = `git clone https://github.com/nodetool-ai/nodetool
cd nodetool
nvm use         # Node 24.x
npm install
npm run build:packages`;

const basicUsageCode = `import { workflow, constant, text, agent } from "@nodetool-ai/dsl";

// Define an input
const question = constant.string({ value: "What is NodeTool?" });

// Create an agent that processes the question
const reply = agent.run({
  provider: "ollama",
  model: "llama3.2:3b",
  prompt: question.output,
});

// Wrap it in a workflow
const wf = workflow(reply);

// Run it:
//   import { WorkflowRunner } from "@nodetool-ai/kernel";
//   const result = await new WorkflowRunner().run(wf);`;

const dslExplanation = [
  {
    title: "Declarative, Not Imperative",
    description: "Define what to compute, not how. The DSL builds a graph that the engine executes optimally.",
  },
  {
    title: "Automatic Data Flow",
    description: "Connect nodes by referencing outputs (e.g., agent.out.text). The engine handles data passing and dependencies.",
  },
  {
    title: "Built for Composition",
    description: "Chain operations naturally. Each node's output becomes another's input, creating complex workflows from simple parts.",
  },
  {
    title: "Visual + Code Sync",
    description: "The same graph runs in the UI or from code. Export visual workflows, edit, import them back.",
  },
];

const coreFeatures = [
  {
    icon: Box,
    title: "Node-Based DSL",
    description: "Declare graphs in code. Strict types, no vendor lock-in.",
    color: "text-violet-400",
  },
  {
    icon: Layers,
    title: "First-Class Agents",
    description: "Planner, browser, search & tool-calling baked in.",
    color: "text-blue-400",
  },
  {
    icon: Network,
    title: "Multi-Provider Models",
    description: "OpenAI, Anthropic, Ollama, Hugging Face, and more.",
    color: "text-emerald-400",
  },
  {
    icon: Database,
    title: "RAG & Vector Stores",
    description: "Native adapters for ChromaDB and semantic search.",
    color: "text-pink-400",
  },
  {
    icon: Zap,
    title: "Actor-Based Execution",
    description: "One actor per node, streaming-first architecture.",
    color: "text-amber-400",
  },
  {
    icon: PackagePlus,
    title: "Plugin SDK",
    description: "Bring your own nodes with the extensible plugin system.",
    color: "text-cyan-400",
  },
];

interface DeveloperCoreSectionProps {
  reducedMotion: boolean;
}

export default function DeveloperCoreSection({
  reducedMotion,
}: DeveloperCoreSectionProps) {
  return (
    <section
      id="core"
      aria-labelledby="core-title"
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
            className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-300 ring-1 ring-inset ring-blue-500/20 mb-4"
          >
            <Code2 className="h-4 w-4" />
            NodeTool Core Engine
          </motion.span>
          <motion.h2
            id="core-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Open-Source Runtime
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            Workflows run in an async Node.js runtime. Use NodeTool as a library
            in your own app, or standalone via the CLI to build, run, and ship AI
            workflows.
          </motion.p>
          <motion.div
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-4 flex flex-wrap justify-center gap-2"
          >
            <Image
              src="https://img.shields.io/badge/Node.js-24.x-339933.svg"
              alt="Node.js 24.x"
              width={105}
              height={20}
              className="h-5 w-auto"
              unoptimized
            />
<Image
              src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg"
              alt="AGPL License"
              width={125}
              height={20}
              className="h-5 w-auto"
              unoptimized
            />
            <Image
              src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"
              alt="PRs Welcome"
              width={95}
              height={20}
              className="h-5 w-auto"
              unoptimized
            />
          </motion.div>
        </div>

        {/* Core Features Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-16">
          {coreFeatures.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              className="flex items-start gap-4 rounded-xl bg-slate-800/40 p-5 ring-1 ring-slate-700/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-700/50 ring-1 ring-slate-600/50">
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <div>
                <h4 className="font-semibold text-white">{feature.title}</h4>
                <p className="mt-1 text-sm text-slate-400">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Installation and Usage */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Installation */}
          <motion.div
            initial={reducedMotion ? {} : { opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
                <Terminal className="h-5 w-5 text-violet-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">Installation</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-400 mb-2">npm package:</p>
                <div className="rounded-lg bg-slate-950/90 p-4 text-xs text-slate-300 font-mono border border-slate-700/50 flex items-center justify-between gap-3">
                  <code className="language-bash text-slate-500 line-through">npm install @nodetool-ai/kernel</code>
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/30 whitespace-nowrap">
                    coming soon
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-2">From source (today):</p>
                <CodeBlock code={installationCodeSource} language="bash" />
              </div>
            </div>
          </motion.div>

          {/* Basic Usage */}
          <motion.div
            initial={reducedMotion ? {} : { opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Code2 className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">DSL Example</h3>
            </div>
            <CodeBlock code={basicUsageCode} language="typescript" />
          </motion.div>
        </div>

        {/* DSL Explanation */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 rounded-2xl bg-gradient-to-br from-teal-900/20 to-purple-900/20 p-8 ring-1 ring-teal-500/20"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 ring-1 ring-teal-500/20">
              <Box className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Why the DSL?</h3>
              <p className="text-sm text-slate-400">The NodeTool DSL is fundamentally different from imperative code</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {dslExplanation.map((point, idx) => (
              <motion.div
                key={point.title}
                initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
                className="rounded-xl bg-slate-800/40 p-5 ring-1 ring-slate-700/50"
              >
                <h4 className="font-semibold text-white mb-2">{point.title}</h4>
                <p className="text-sm text-slate-400">{point.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

{/* Links */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="https://github.com/nodetool-ai/nodetool-core"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-3 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            NodeTool Core on GitHub
          </a>
          <a
            href="https://docs.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all hover:bg-violet-500"
          >
            Documentation
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
