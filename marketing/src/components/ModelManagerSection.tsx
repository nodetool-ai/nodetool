"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Database, Download } from "lucide-react";

export default function ModelManagerSection() {
  return (
    <section
      id="models"
      aria-labelledby="model-manager-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-blue-500/10 border border-blue-500/20 shadow-lg shadow-blue-500/10"
          >
            <Database className="w-8 h-8 text-blue-400" />
          </motion.div>

          <motion.h2
            id="model-manager-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Hello <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
              HuggingFace
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-slate-400 leading-relaxed"
          >
            Search, download, and manage model weights directly from the Hub.
            <br />
            Organize your local library without leaving the app.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative mx-auto max-w-5xl"
        >
          <Tilt3D>
            <div className="relative rounded-xl border border-white/[0.04] bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-purple-500/5 pointer-events-none" />

              {/* Browser/Window Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                <div className="ml-4 text-xs text-slate-500 font-medium flex items-center gap-2">
                  <Download className="w-3 h-3" />
                  Model Manager
                </div>
              </div>

              <Image
                src="/screen_model_manager.png"
                alt="Model manager interface showing Hugging Face integration"
                width={1400}
                height={900}
                className="w-full h-auto opacity-90 transition-opacity group-hover:opacity-100"
                loading="lazy"
              />
            </div>
          </Tilt3D>
        </motion.div>
      </div>
    </section>
  );
}
