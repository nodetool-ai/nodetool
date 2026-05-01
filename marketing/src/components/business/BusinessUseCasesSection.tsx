"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Mail,
  Database,
  Image as ImageIcon,
  MessageSquare,
  BarChart3,
} from "lucide-react";

interface BusinessUseCasesSectionProps {
  reducedMotion?: boolean;
}

const useCases = [
  {
    title: "Document Intelligence",
    description: "Automate document processing, extraction, and analysis. Process invoices, contracts, and forms at scale.",
    icon: FileText,
    gradient: "from-emerald-500/20 to-teal-500/20",
    examples: ["Invoice processing", "Contract analysis", "Form extraction"],
  },
  {
    title: "Customer Support Automation",
    description: "Build intelligent chatbots and ticket routing systems. Reduce response times and support costs.",
    icon: MessageSquare,
    gradient: "from-blue-500/20 to-cyan-500/20",
    examples: ["24/7 chatbot support", "Ticket classification", "Knowledge base search"],
  },
  {
    title: "Marketing & Content",
    description: "Generate marketing materials, social media content, and personalized campaigns at scale.",
    icon: Mail,
    gradient: "from-teal-500/20 to-purple-500/20",
    examples: ["Ad copy generation", "Image creation", "Email personalization"],
  },
  {
    title: "Data Analysis & Insights",
    description: "Transform raw data into actionable insights. Automated reporting, trend detection, and forecasting.",
    icon: BarChart3,
    gradient: "from-cyan-500/20 to-blue-500/20",
    examples: ["Sales forecasting", "Anomaly detection", "Report generation"],
  },
  {
    title: "Quality Assurance",
    description: "Automated visual inspection, defect detection, and quality control in manufacturing processes.",
    icon: ImageIcon,
    gradient: "from-rose-500/20 to-pink-500/20",
    examples: ["Visual inspection", "Defect detection", "Product classification"],
  },
  {
    title: "Process Automation",
    description: "Connect disparate systems and automate complex business workflows with AI-powered decision making.",
    icon: Database,
    gradient: "from-amber-500/20 to-orange-500/20",
    examples: ["Data pipeline automation", "Cross-system integration", "Smart routing"],
  },
];

export default function BusinessUseCasesSection({ reducedMotion }: BusinessUseCasesSectionProps) {
  return (
    <section id="use-cases" className="rhythm-section relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Real-World <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">Business Applications</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            From small businesses to enterprise organizations, NodeTool powers AI automation across industries.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
              className="group"
            >
              <div className={`relative h-full rounded-2xl border border-white/10 bg-gradient-to-br ${useCase.gradient} backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20 hover:shadow-2xl`}>
                <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <useCase.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{useCase.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed">{useCase.description}</p>
                <div className="space-y-2">
                  {useCase.examples.map((example) => (
                    <div key={example} className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {example}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
