"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Tilt3D from "./Tilt3D";
import { Shield, Cpu, Globe, Lock } from "lucide-react";

const features = [
  {
    title: "Local-First",
    body: "All workflows, assets, and models can run on your machine for maximum privacy and control. Work offline once models are downloaded.",
    image: "/local_first.webp",
    icon: Cpu,
    accent: "blue",
  },
  {
    title: "Open Source",
    body: "NodeTool is open-source under AGPL-3.0. Inspect, modify, and self-host the entire stack.",
    image: "/open_source.webp",
    icon: Globe,
    accent: "emerald",
  },
  {
    title: "Privacy by Design",
    body: "Your data stays yours—process locally or use your API keys. No collection, no telemetry, opt-in cloud only.",
    image: "/data_privacy.webp",
    icon: Shield,
    accent: "violet",
  },
  {
    title: "Cloud-Augmented",
    body: "Mix local AI with cloud services. Add API keys for OpenAI, Anthropic, Replicate—use the best tool for each task.",
    image: "/no_lockin.webp",
    icon: Lock,
    accent: "rose",
  },
];

const accentColors: Record<string, string> = {
  blue: "group-hover:text-blue-400 group-hover:border-blue-500/50 group-hover:shadow-blue-500/20",
  emerald: "group-hover:text-emerald-400 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20",
  violet: "group-hover:text-amber-400 group-hover:border-teal-500/50 group-hover:shadow-teal-500/20",
  rose: "group-hover:text-rose-400 group-hover:border-rose-500/50 group-hover:shadow-rose-500/20",
};

const bgAccents: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  violet: "bg-teal-500/10 text-amber-400",
  rose: "bg-rose-500/10 text-rose-400",
};

interface OwnershipSectionProps {
  reducedMotion?: boolean;
}

export default function OwnershipSection({
  reducedMotion = false,
}: OwnershipSectionProps) {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Ambient Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Local-first or <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400">
              cloud-augmented.
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Your tools, your data—always under your control. Run everything locally for maximum privacy, or mix in cloud services for flexibility.
          </motion.p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {features.map((item) => (
            <motion.div
              key={item.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div
                  className={`group relative h-full flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${accentColors[item.accent]}`}
                >
                  {/* Image Container with Gradient Overlay */}
                  <div className="relative h-48 w-full overflow-hidden">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
                  </div>

                  {/* Content */}
                  <div className="relative flex flex-col flex-grow p-6 pt-0">
                    <div className={`-mt-8 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 shadow-lg backdrop-blur-md ${bgAccents[item.accent]}`}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    
                    <h3 className="mb-3 text-lg font-semibold text-white group-hover:text-white transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-400 group-hover:text-slate-300 transition-colors">
                      {item.body}
                    </p>
                  </div>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}



