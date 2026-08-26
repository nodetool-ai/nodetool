"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Clapperboard, Coins, Users, GitBranch } from "lucide-react";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-amber-500/50 hover:shadow-strong";

const highlights = [
  {
    icon: Coins,
    title: "Stills cost cents, clips cost dollars",
    body: "Generate stills until one looks right and pick it. Only then do you pay to animate the shot into a clip.",
  },
  {
    icon: GitBranch,
    title: "Revise one shot, not the reel",
    body: '"Darker, add rain" runs video-to-video on that clip and swaps it in place. Fixing shot 3 never re-rolls shots 1–5.',
  },
  {
    icon: Users,
    title: "A cast that stays consistent",
    body: "Characters, locations, styles, and props are named entities with a fixed descriptor that goes into every prompt that names them.",
  },
];

export default function StoryboardSection() {
  return (
    <section
      id="storyboard"
      aria-labelledby="storyboard-title"
      className="relative py-24 overflow-clip-safe"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-amber-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/10"
          >
            <Clapperboard className="w-8 h-8 text-amber-400" />
          </motion.div>

          <motion.h2
            id="storyboard-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Storyboard <span className="text-white">before you spend</span>
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-300 leading-relaxed"
          >
            Pitch a concept and a visual style, press Direct, and get a shot
            list back — action, camera, motion, and duration per card. Approve
            the stills you like, animate only those, then lay the whole thing
            onto the multi-track timeline in one click.
          </motion.p>
        </div>

        <motion.figure
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}
          className="scroll-fade relative"
        >
          <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 overflow-hidden shadow-2xl shadow-amber-900/20 ring-1 ring-white/5 backdrop-blur-sm">
            <Image
              src="/screen_storyboard.png"
              alt="NodeTool's storyboard surface: title, brief, and visual style fields above a Direct button, and five shot cards for a lighthouse film — each with its still, its action line, camera notes, and a status of Rendered, Approved, Still ready, Rendering, or Planned"
              width={1680}
              height={1000}
              className="h-auto w-full"
              loading="lazy"
            />
          </div>
        </motion.figure>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className={`group ${cardBase} ${cardHoverUnified} p-6`}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                <Icon
                  className="h-6 w-6 text-amber-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
