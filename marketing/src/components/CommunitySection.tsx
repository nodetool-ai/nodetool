"use client";
import React from "react";
import { motion } from "framer-motion";
import { Github, MessageCircle, Star } from "lucide-react";
import { track } from "../lib/analytics";

interface CommunitySectionProps {
  stars?: number | null;
  /** Visual treatment: blue glass card (home), warm gradient card (creatives), or amber/emerald card (marketing). */
  variant?: "home" | "creatives" | "marketing";
  id?: string;
}

const variants = {
  home: {
    heading: (
      <>
        Made with <span className="text-blue-400">working creatives</span>
      </>
    ),
    body: "NodeTool is AGPL-3.0 open source. Star the repo, jump into Discord, and trade workflows with other artists, motion designers, and studios using it for real work.",
    card: "rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl p-8 md:p-16 text-center overflow-hidden relative",
    topBar:
      "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50",
    githubHover: "hover:bg-blue-50",
    discord:
      "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20",
  },
  creatives: {
    heading: (
      <>
        Join the{" "}
        <span className="text-white">
          community
        </span>
      </>
    ),
    body: "Trade workflows, swap prompts, and ship work with other working creatives. NodeTool is open source under AGPL-3.0 — built in the open.",
    card: "rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-teal-500/10 to-cyan-500/10 backdrop-blur-xl p-8 md:p-16 text-center overflow-hidden relative",
    topBar:
      "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-teal-500 to-cyan-500 opacity-50",
    githubHover: "hover:bg-slate-100",
    discord: "bg-[#5865F2] hover:bg-[#4752C4] shadow-lg",
  },
  marketing: {
    heading: (
      <>
        Made with <span className="text-amber-400">marketing teams</span>
      </>
    ),
    body: "NodeTool is AGPL-3.0 open source. Star the repo, jump into Discord, and trade campaign workflows with other marketers running production at scale.",
    card: "rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-emerald-500/10 to-cyan-500/10 backdrop-blur-xl p-8 md:p-16 text-center overflow-hidden relative",
    topBar:
      "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-emerald-500 to-cyan-500 opacity-50",
    githubHover: "hover:bg-slate-100",
    discord: "bg-[#5865F2] hover:bg-[#4752C4] shadow-lg",
  },
} as const;

export default function CommunitySection({
  stars,
  variant = "home",
  id,
}: CommunitySectionProps) {
  const v = variants[variant];

  return (
    <section
      id={id}
      aria-labelledby="community-title"
      className="relative py-24 overflow-hidden"
    >
      {variant === "home" && (
        <>
          {/* Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-blue-950/20 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />
        </>
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className={v.card}>
          <div className={v.topBar} />

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
              {v.heading}
            </h2>
            <p className="text-lg text-slate-300 mb-10 leading-relaxed">
              {v.body}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Star GitHub")}
                className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-slate-900 font-semibold ${v.githubHover} transition-colors shadow-lg group focus-ring`}
              >
                <Github className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                <span>Star on GitHub</span>
                {typeof stars === "number" && (
                  <div className="ml-3 pl-3 border-l border-slate-200 text-sm font-normal text-slate-400 flex items-center">
                    <Star className="w-3 h-3 mr-1 text-amber-500 fill-amber-500" />
                    <span>
                      {stars > 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
                    </span>
                  </div>
                )}
              </a>

              <a
                href="https://discord.gg/WmQTWZRcYE"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Join Discord")}
                className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl text-white font-semibold transition-colors ${v.discord} group focus-ring`}
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
