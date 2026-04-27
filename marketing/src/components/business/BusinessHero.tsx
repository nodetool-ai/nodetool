"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowRight, Download, BarChart3, Shield, Zap } from "lucide-react";

export default function BusinessHero() {
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-white/10 mb-8">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-300">Enterprise AI Made Simple</span>
        </div>

        <h1 id="hero-title" className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
          <span className="text-white">Transform Your Business with</span>
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-blue-400 to-amber-400">
            AI Automation
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">
          Build and deploy custom AI workflows without vendor lock-in. 
          Reduce costs, enhance productivity, and maintain complete control over your data.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <a
            href="https://github.com/nodetool-ai/nodetool/releases"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 text-white font-semibold hover:from-emerald-400 hover:to-blue-500 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
          >
            <Download className="w-5 h-5" />
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="#roi"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all"
          >
            <BarChart3 className="w-5 h-5" />
            Calculate ROI
          </a>
        </div>

        <div className="flex items-center justify-center gap-8 text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Enterprise Security
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            No Vendor Lock-in
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Self-Hosted or Cloud</span>
        </div>
      </motion.div>

      {/* Hero Visual */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="mt-20 relative"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-transparent to-transparent z-10 pointer-events-none" />
        <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-emerald-500/10">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
            <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
            <div className="w-3 h-3 rounded-full bg-amber-500/50" />
            <div className="w-3 h-3 rounded-full bg-rose-500/50" />
            <span className="ml-4 text-xs text-slate-500 font-medium">Business Automation Workflow</span>
          </div>
          <Image
            src="/screen_canvas.png"
            alt="Screenshot of NodeTool's visual workflow editor displaying a business automation workflow with interconnected nodes for AI processing, data transformation, and output generation"
            width={1400}
            height={800}
            className="w-full"
          />
        </div>
      </motion.div>
    </div>
  );
}
