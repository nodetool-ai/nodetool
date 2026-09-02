"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { LayoutTemplate, MousePointerClick, Bot, Box } from "lucide-react";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-emerald-500/50 hover:shadow-strong";

const highlights = [
  {
    icon: MousePointerClick,
    title: "Drag a widget, wire a port",
    body: "Fields, sliders, pickers, and result displays bind to the inputs and outputs of the workflows the app runs. Results stream in as the run happens.",
  },
  {
    icon: Bot,
    title: "An agent builds and grades it",
    body: "Describe the app and it plans the workflows, places the widgets, replays every interaction, and has a second model judge whether the result matches the ask. No passing verdict, no app.",
  },
  {
    icon: Box,
    title: "One file to hand over",
    body: "Export an app as a bundle — the screen plus the full graph of every workflow behind it — and import it on another machine.",
  },
];

export default function AppBuilderSection() {
  return (
    <section
      id="app-builder"
      aria-labelledby="app-builder-title"
      className="relative py-24 overflow-clip-safe"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-emerald-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="scroll-fade mb-12 text-center max-w-3xl mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/10"
          >
            <LayoutTemplate className="w-8 h-8 text-emerald-400" />
          </motion.div>

          <motion.h2
            id="app-builder-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Turn workflows into{" "}
            <span className="text-white">simple apps you can share</span>
          </motion.h2>

          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-lg text-slate-300 leading-relaxed"
          >
            Once a workflow works, give it a screen: a few inputs and a Run
            button. Hand that screen to a teammate or client so they get
            results without seeing the canvas underneath, which stays yours to
            open and change.
          </motion.p>
        </div>

        <motion.figure
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}
          className="scroll-fade relative"
        >
          <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 overflow-hidden shadow-2xl shadow-emerald-900/20 ring-1 ring-white/5 backdrop-blur-sm">
            <Image
              src="/screen_app_builder.png"
              alt="NodeTool's app builder in Design view: a palette of widgets (text input, slider, switch, select, date input, resource picker) on the left, a mini app screen in the middle with a prompt field and a Run button, and a page inspector with app title and theme on the right"
              width={1440}
              height={900}
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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                <Icon
                  className="h-6 w-6 text-emerald-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href="/apps"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-sm font-semibold text-emerald-200 transition-all hover:border-emerald-400 hover:bg-emerald-500/20 focus-ring"
          >
            Browse the mini apps that ship with NodeTool
          </a>
        </div>
      </div>
    </section>
  );
}
