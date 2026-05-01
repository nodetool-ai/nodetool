"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "../Tilt3D";
import {
  Globe,
  Database,
  Code2,
  Newspaper,
  BookOpen,
  GraduationCap,
  Image,
  Lightbulb,
  Rocket,
  LucideIcon,
} from "lucide-react";

interface AgentUseCasesSectionProps {
  reducedMotion?: boolean;
}

interface UseCase {
  name: string;
  description: string;
  icon: LucideIcon;
  iconBgFrom: string;
  iconBgTo: string;
  example: string;
}

const useCases: UseCase[] = [
  {
    name: "Web Research Agent",
    description:
      "Automate web research with agents that search, scrape, and synthesize information from multiple sources into comprehensive reports.",
    icon: Globe,
    iconBgFrom: "from-teal-600/20",
    iconBgTo: "to-blue-600/20",
    example: "Research AI trends and create a summary with citations",
  },
  {
    name: "RAG Knowledge Base",
    description:
      "Build Retrieval-Augmented Generation workflows that index documents in a SQLite-vec vector store and answer questions with source attribution.",
    icon: Database,
    iconBgFrom: "from-blue-600/20",
    iconBgTo: "to-cyan-600/20",
    example: "Index documentation and answer technical questions",
  },
  {
    name: "Multi-Agent Research Team",
    description:
      "Deploy a coordinator agent that decomposes research into subtasks, delegates to specialized agents, and synthesizes results via task board and message bus.",
    icon: Newspaper,
    iconBgFrom: "from-cyan-600/20",
    iconBgTo: "to-emerald-600/20",
    example: "Research AI trends using a team of 3 specialized agents",
  },
  {
    name: "News & Current Events",
    description:
      "Google News and grounded search integration. Get current events with source verification and citations.",
    icon: BookOpen,
    iconBgFrom: "from-emerald-600/20",
    iconBgTo: "to-green-600/20",
    example: "Summarize today's tech news with sources",
  },
  {
    name: "Coding Assistant",
    description:
      "AI agents that write, review, and refactor code. Execute JavaScript, Python, or Bash in sandboxed environments and iterate on results.",
    icon: Code2,
    iconBgFrom: "from-pink-600/20",
    iconBgTo: "to-rose-600/20",
    example: "Generate a function and run tests",
  },
  {
    name: "Document Processing",
    description:
      "Extract text and tables from PDFs, convert between formats, and chain with LLM analysis for automated document workflows.",
    icon: GraduationCap,
    iconBgFrom: "from-amber-600/20",
    iconBgTo: "to-orange-600/20",
    example: "Extract key findings from a research paper PDF",
  },
  {
    name: "Image Generation",
    description:
      "Generate images with gpt-image-2 (OpenAI DALL-E), FLUX, or Imagen (Google Gemini API). Chain with text generation for creative workflows.",
    icon: Image,
    iconBgFrom: "from-indigo-600/20",
    iconBgTo: "to-teal-600/20",
    example: "Generate product mockups from descriptions",
  },
  {
    name: "Planning Agent",
    description:
      "Automatic task decomposition into dependency DAGs with parallel execution. Separate planning and execution models for cost optimization.",
    icon: Lightbulb,
    iconBgFrom: "from-rose-600/20",
    iconBgTo: "to-pink-600/20",
    example: "Break down a complex project into executable steps",
  },
  {
    name: "Browser Automation",
    description:
      "Agents that navigate the web, take screenshots, fill forms, and extract data. Built-in browser and screenshot tools.",
    icon: Rocket,
    iconBgFrom: "from-teal-600/20",
    iconBgTo: "to-cyan-600/20",
    example: "Scrape product pricing from competitor websites",
  },
];

export default function AgentUseCasesSection({
  reducedMotion = false,
}: AgentUseCasesSectionProps) {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[500px] bg-teal-900/20 blur-[120px] rounded-full opacity-50" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            id="use-cases-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Ready-to-Use{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
              Workflows
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Build these workflows visually in the UI or run them as TypeScript scripts.
            All examples are available in our{" "}
            <a
              href="https://github.com/nodetool-ai/nodetool/tree/main/examples"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              examples repository
            </a>.
          </motion.p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {useCases.map((item) => (
            <motion.div
              key={item.name}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm p-8 transition-all duration-300 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl">
                  {/* Icon */}
                  <div
                    className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${item.iconBgFrom} ${item.iconBgTo} shadow-lg ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <item.icon className={`h-7 w-7 text-white`} aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-amber-200 transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-slate-400 leading-relaxed mb-4 flex-grow">
                    {item.description}
                  </p>

                  {/* Example */}
                  <div className="mt-auto pt-4 border-t border-white/5">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                      Example Prompt
                    </p>
                    <p className="text-sm text-amber-300/80 italic">
                      &quot;{item.example}&quot;
                    </p>
                  </div>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <a
            href="https://github.com/nodetool-ai/nodetool/tree/main/examples/workflows"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-teal-600/80 to-blue-600/80 text-white font-semibold hover:from-teal-500 hover:to-blue-500 transition-all shadow-lg shadow-teal-900/30 hover:shadow-teal-900/50"
          >
            View All Examples on GitHub
            <span className="text-lg">→</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
