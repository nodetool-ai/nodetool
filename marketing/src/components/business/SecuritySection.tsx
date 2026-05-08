"use client";
import React from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Server, FileCheck, Eye, Key } from "lucide-react";

interface SecuritySectionProps {
  reducedMotion?: boolean;
}

const securityFeatures = [
  {
    icon: Shield,
    title: "Your data stays with you",
    description: "Workflows, files, and provider keys live with you — on your machine, in your browser, or on hardware you control.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit and at rest",
    description: "Cloud storage is encrypted by default. Studio keeps everything on your disk and never phones home.",
  },
  {
    icon: Server,
    title: "Self-host the same code",
    description: "Cloud is just our managed hosting of the open-source code. Run the same Docker images, CLI, and runtime on your own infrastructure.",
  },
  {
    icon: FileCheck,
    title: "Workflow history",
    description: "Every workflow run, every node output, every prompt — captured so your team can re-run, audit, and version what shipped.",
  },
  {
    icon: Eye,
    title: "Open source, end to end",
    description: "AGPL-3.0 on GitHub. No closed-source layer, no \"pro tier\" hiding the good features. Read the code, fork the code, ship the code.",
  },
  {
    icon: Key,
    title: "Your keys, your billing",
    description: "BYOK for every provider. Use your own accounts, your own usage limits, and your own provider-side controls.",
  },
];

const complianceLogos = [
  { name: "Open source", color: "text-blue-400" },
  { name: "BYOK", color: "text-emerald-400" },
  { name: "Self-hostable", color: "text-amber-400" },
  { name: "AGPL-3.0", color: "text-cyan-400" },
];

export default function SecuritySection({ reducedMotion }: SecuritySectionProps) {
  return (
    <section id="security" className="rhythm-section relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-transparent pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <Shield className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Your keys. Your data. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400">Your call.</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Open source, BYOK, and self-hostable — so your team controls where the work runs, where the keys live, and where the files end up.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : index * 0.08 }}
              className="group"
            >
              <div className="relative h-full rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 transition-all duration-300 hover:border-blue-500/30 hover:bg-slate-900/70">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Compliance Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <div className="inline-block rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl p-8 md:p-12">
            <h3 className="text-xl font-semibold text-white mb-8">Built on open ground</h3>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {complianceLogos.map((compliance, index) => (
                <motion.div
                  key={compliance.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: reducedMotion ? 0 : 0.5 + index * 0.1 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <Shield className={`w-5 h-5 ${compliance.color}`} />
                  <span className="text-sm font-medium text-slate-300">{compliance.name}</span>
                </motion.div>
              ))}
            </div>
            <p className="mt-8 text-sm text-slate-400 max-w-2xl mx-auto">
              Self-hosting puts the same open-source runtime on your hardware, so your team can meet whatever data and infrastructure rules your work needs to follow.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
