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
    title: "Data Sovereignty",
    description: "Your data never leaves your infrastructure. Complete control over where and how data is processed.",
  },
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description: "All data in transit and at rest is encrypted. Support for custom encryption keys and HSM integration.",
  },
  {
    icon: Server,
    title: "On-Premise Deployment",
    description: "Deploy entirely on your infrastructure. No external dependencies or cloud services required.",
  },
  {
    icon: FileCheck,
    title: "Audit Logs",
    description: "Complete audit trail of all workflow executions, data access, and system changes.",
  },
  {
    icon: Eye,
    title: "Transparent & Open Source",
    description: "Full source code access under AGPL-3.0. Audit every line of code for security compliance.",
  },
  {
    icon: Key,
    title: "Access Control",
    description: "Role-based access control (RBAC), SSO integration, and fine-grained permissions management.",
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
            Enterprise Security <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400">& Compliance</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Built with security and compliance in mind from day one. Meet the strictest industry standards.
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
            <h3 className="text-xl font-semibold text-white mb-8">Compliance Ready</h3>
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
              Self-hosting gives you full control to meet your organization&apos;s specific compliance requirements.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
