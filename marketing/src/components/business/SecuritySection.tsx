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
    title: "Files stay where you put them",
    description: "Workflows, prompts, and outputs live on your team's machines or in your team's cloud account. No cloud round-trip unless a node explicitly calls one.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit and at rest",
    description: "Provider keys are stored encrypted with the master key on your machine. TLS for every API call out.",
  },
  {
    icon: Server,
    title: "Self-host anywhere",
    description: "Run Studio on a workstation, run the same Docker images on your own server, or self-host in your team's AWS, Azure, or GCP account.",
  },
  {
    icon: FileCheck,
    title: "Run logs and traces",
    description: "Every workflow run is logged. OpenTelemetry tracing for agent steps and LLM calls — no black box.",
  },
  {
    icon: Eye,
    title: "Open source, AGPL-3.0",
    description: "Every node, every provider, every line of the runtime is on GitHub. Audit it, fork it, run a patched build for your team if you need to.",
  },
  {
    icon: Key,
    title: "Your keys, your account",
    description: "BYOK for every provider. Bills land on your team's accounts directly — not on a markup line item from us.",
  },
];

const complianceLogos = [
  { name: "SOC 2 Ready", color: "text-blue-400" },
  { name: "GDPR Compliant", color: "text-emerald-400" },
  { name: "HIPAA Compatible", color: "text-amber-400" },
  { name: "ISO 27001 Ready", color: "text-cyan-400" },
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
            Your team. Your keys. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400">Your machines.</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Open source, self-hostable, BYOK. The security story is the same one as the product story.
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
            <h3 className="text-xl font-semibold text-white mb-8">Compatible with your existing posture</h3>
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
              Self-hosting on your team&apos;s own infrastructure gives you the
              control your security review needs. We don&apos;t certify on your
              behalf — we get out of the way so you can.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
