"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Lock,
  Boxes,
  TrendingUp,
  Users,
  FileCode,
  Cloud,
  Gauge,
} from "lucide-react";

interface BusinessFeaturesSectionProps {
  reducedMotion?: boolean;
}

const features = [
  {
    title: "Cost Reduction",
    description: "Slash AI costs by up to 80% by using your own infrastructure and avoiding expensive API subscriptions.",
    icon: DollarSign,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    title: "Data Privacy",
    description: "Keep sensitive business data on-premise. Full control over your AI models and processing pipelines.",
    icon: Lock,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    title: "Flexible Integration",
    description: "Connect to existing tools and databases. REST APIs, webhooks, and custom connectors available.",
    icon: Boxes,
    color: "text-amber-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20",
  },
  {
    title: "Scalable Architecture",
    description: "Start small and scale up. From single-machine deployment to distributed cloud infrastructure.",
    icon: TrendingUp,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    title: "Team Collaboration",
    description: "Share workflows across teams. Version control, audit logs, and role-based access control.",
    icon: Users,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },
  {
    title: "Developer Friendly",
    description: "Open-source and extensible. Build custom nodes, integrate proprietary models, and automate with APIs.",
    icon: FileCode,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    title: "Hybrid Deployment",
    description: "Deploy anywhere: on-premise, cloud, or hybrid. Compatible with AWS, Azure, GCP, and private clouds.",
    icon: Cloud,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
  },
  {
    title: "Enterprise Performance",
    description: "GPU acceleration, batch processing, and optimized inference. Handle high-volume workloads efficiently.",
    icon: Gauge,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20",
  },
];

export default function BusinessFeaturesSection({ reducedMotion }: BusinessFeaturesSectionProps) {
  return (
    <section id="features" className="rhythm-section relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-950/10 to-transparent pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Enterprise-Grade AI Platform
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Everything your business needs to build, deploy, and scale AI workflows with confidence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.05 }}
              className="group"
            >
              <div className={`relative h-full rounded-2xl border ${feature.borderColor} ${feature.bgColor} backdrop-blur-sm p-6 transition-all duration-300 hover:border-white/20 hover:shadow-lg`}>
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} border ${feature.borderColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
