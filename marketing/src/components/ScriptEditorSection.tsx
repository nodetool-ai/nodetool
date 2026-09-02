"use client";
import React from "react";
import { motion } from "framer-motion";
import { Mic, AudioLines, History, FileText } from "lucide-react";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-rose-500/50 hover:shadow-strong";

const highlights = [
  {
    icon: Mic,
    title: "A voice per speaker",
    body: "Cast each speaker once — provider, model, voice — and every line they own inherits it until you override that line.",
  },
  {
    icon: AudioLines,
    title: "Takes you can audition",
    body: "Voicing a line saves a take with its own word timings. Keep several, compare them, pick the read you want.",
  },
  {
    icon: History,
    title: "Edits mark themselves stale",
    body: "Change a line's words or its voice and the line flags itself against the take that no longer matches. Re-voice that line, not the script.",
  },
];

const scriptLines = [
  { speaker: "Narrator", text: "The keeper had counted every wave.", status: "voiced" },
  { speaker: "Nova", text: "Something down there is counting back.", status: "stale" },
  { speaker: "Narrator", text: "So she let the beam bend.", status: "draft" },
];

const statusStyles: Record<string, string> = {
  voiced: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  stale: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  draft: "bg-slate-500/10 text-slate-300 border-slate-500/30",
};

export default function ScriptEditorSection() {
  return (
    <section
      id="script-editor"
      aria-labelledby="script-title"
      className="relative py-24 overflow-clip-safe"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-rose-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="scroll-fade">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 shadow-lg shadow-rose-500/10"
            >
              <FileText className="w-8 h-8 text-rose-400" />
            </motion.div>

            <motion.h2
              id="script-title"
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
            >
              Scripting <span className="text-white">&amp; casting</span>
            </motion.h2>

            <motion.p
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="text-lg text-slate-300 leading-relaxed"
            >
              Draft the dialogue, cast a voice per character, and audition
              alternate readings, each with word-level timing. The script is
              its own document: the words are the source of truth, the takes
              derive from them, and an edit shows which line needs voicing
              again.
            </motion.p>
          </div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
            className="scroll-fade rounded-2xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-2xl shadow-rose-900/20 ring-1 ring-white/5 backdrop-blur-sm"
            aria-hidden="true"
          >
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              Scene 1 — The point at dusk
            </div>
            <ul className="space-y-3">
              {scriptLines.map((line) => (
                <li
                  key={line.text}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">
                      {line.speaker}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[line.status]}`}
                    >
                      {line.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {line.text}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className={`group ${cardBase} ${cardHoverUnified} p-6`}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10">
                <Icon
                  className="h-6 w-6 text-rose-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
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
