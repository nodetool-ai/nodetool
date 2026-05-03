"use client";
import React from "react";
import { motion } from "framer-motion";
import { Github, MessageCircle, Star } from "lucide-react";

export default function CommunitySection({ stars }: { stars?: number | null }) {
  return (
    <section
      aria-labelledby="community-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-blue-950/20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl p-8 md:p-16 text-center overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <h2
              id="community-title"
              className="text-3xl md:text-4xl font-bold text-white mb-6"
            >
              Build with the <span className="text-blue-400">community</span>
            </h2>
            <p className="text-lg text-slate-300 mb-10 leading-relaxed">
              NodeTool is open-source under AGPL-3.0. Join the Discord, explore the GitHub repo, and share workflows with other builders.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-slate-900 font-semibold hover:bg-blue-50 transition-colors shadow-lg shadow-white/10 group"
              >
                <Github className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                <span>Star on GitHub</span>
                <div className="ml-3 pl-3 border-l border-slate-200 text-sm font-normal text-slate-500 flex items-center">
                  <Star className="w-3 h-3 mr-1 text-yellow-500 fill-yellow-500" />
                  <span>
                    {stars
                      ? stars > 1000
                        ? `${(stars / 1000).toFixed(1)}k`
                        : stars
                      : "2.4k"}
                  </span>
                </div>
              </a>

              <a
                href="https://discord.gg/WmQTWZRcYE"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 group"
              >
                <MessageCircle className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                <span>Join Discord</span>
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}



