"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  Braces,
  Camera,
  Cloud,
  Film,
  Folder,
  Image as ImageIcon,
  Mic,
  Music,
  Palette,
  Search,
  Terminal,
  Wand2,
} from "lucide-react";

interface AgentIntegrationsSectionProps {
  reducedMotion?: boolean;
}

const integrations = [
  {
    category: "Image models",
    items: [
      { name: "Flux", icon: ImageIcon },
      { name: "Nano Banana", icon: "🍌" },
      { name: "Ideogram", icon: "🎨" },
      { name: "gpt-image", icon: "🖼️" },
    ],
    color: "amber",
  },
  {
    category: "Video models",
    items: [
      { name: "Seedance", icon: Film },
      { name: "Veo", icon: "🎬" },
      { name: "Kling", icon: "📽️" },
      { name: "Runway · Sora", icon: "🎞️" },
    ],
    color: "pink",
  },
  {
    category: "Music & voice",
    items: [
      { name: "Suno", icon: Music },
      { name: "ElevenLabs", icon: Mic },
      { name: "Whisper", icon: "🎙️" },
      { name: "Stem split", icon: "🎚️" },
    ],
    color: "cyan",
  },
  {
    category: "Retouch & edit",
    items: [
      { name: "Inpaint · Outpaint", icon: Wand2 },
      { name: "Relight", icon: "💡" },
      { name: "Upscale 4×", icon: Palette },
      { name: "Color match", icon: Camera },
    ],
    color: "emerald",
  },
  {
    category: "Brand & references",
    items: [
      { name: "Mood boards", icon: Folder },
      { name: "Style guides", icon: "🎨" },
      { name: "Reference images", icon: Cloud },
      { name: "Web reference search", icon: Search },
    ],
    color: "blue",
  },
  {
    category: "The model providers",
    items: [
      { name: "OpenAI", icon: "🤖" },
      { name: "Anthropic", icon: "🧠" },
      { name: "Gemini", icon: "💎" },
      { name: "Local · Ollama", icon: "💻" },
    ],
    color: "teal",
  },
];

export default function AgentIntegrationsSection({
  reducedMotion = false,
}: AgentIntegrationsSectionProps) {
  return (
    <section
      id="integrations"
      aria-labelledby="integrations-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-900/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <motion.h2
            id="integrations-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Every tool in the{" "}
            <span className="text-white">
              creative kit.
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-neutral-400 leading-relaxed"
          >
            The same models the studios use — wired into agents that know when to
            reach for them. Hand your agent a brief and it picks the right tool for
            the shot.
          </motion.p>
        </div>

        {/* Integration Categories */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {integrations.map((category) => (
            <motion.div
              key={category.category}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="group relative rounded-2xl border border-white/5 bg-neutral-900/40 backdrop-blur-sm p-6 transition-all duration-300 hover:bg-neutral-900/60 hover:border-white/10"
            >
              {/* Category Header */}
              <h3
                className={`text-lg font-semibold mb-4
                ${category.color === "teal" ? "text-amber-300" : ""}
                ${category.color === "blue" ? "text-blue-300" : ""}
                ${category.color === "cyan" ? "text-cyan-300" : ""}
                ${category.color === "emerald" ? "text-emerald-300" : ""}
                ${category.color === "pink" ? "text-pink-300" : ""}
                ${category.color === "amber" ? "text-amber-300" : ""}
              `}
              >
                {category.category}
              </h3>

              {/* Integration Items */}
              <div className="grid grid-cols-2 gap-3">
                {category.items.map((item) => (
                  <div
                    key={item.name}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg 
                      bg-white/5 border border-white/5
                      transition-all duration-200
                      hover:bg-white/10 hover:border-white/10
                    `}
                  >
                    {typeof item.icon === "string" ? (
                      <span className="text-lg">{item.icon}</span>
                    ) : (
                      <item.icon className="w-4 h-4 text-neutral-400" />
                    )}
                    <span className="text-sm text-neutral-300">{item.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16 rounded-2xl border border-white/10 bg-gradient-to-r from-teal-900/20 via-neutral-900/50 to-blue-900/20 p-8 md:p-12 text-center"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Your favorite model isn&apos;t in the list yet?
          </h3>
          <p className="text-neutral-400 mb-6 max-w-2xl mx-auto">
            NodeTool is open source. Wrap any provider as a node, plug in a private
            checkpoint, or drive the canvas from the TypeScript SDK — agents pick it up
            like a first-class tool the moment it lands on the canvas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://docs.nodetool.ai/integrations"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white transition-all"
            >
              <Braces className="w-5 h-5" />
              Read the docs
            </a>
            <a
              href="https://github.com/nodetool-ai/nodetool"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-all"
            >
              <Terminal className="w-5 h-5" />
              Wire up your own model
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
