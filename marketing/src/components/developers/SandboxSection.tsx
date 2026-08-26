"use client";
import React from "react";
import { motion } from "framer-motion";
import { Cpu, Globe, HardDrive, Image as ImageIcon, KeyRound, Radio, Trash2 } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const codeNodeBody = `// A Code node body. Inputs arrive on \`inputs\`, never as globals.
import { parse } from "@nodetool-ai/sandbox-csv";

const rows = parse(await media.text(inputs.file)).data;
const kept = rows.filter((r) => Number(r.score) > inputs.threshold);

for (const row of kept) {
  await emit("row", row);          // streams downstream now
}
progress(100, \`kept \${kept.length}\`);
await output("count", kept.length); // final, posted when the body ends`;

const capabilities = [
  {
    icon: Globe,
    name: "fetch",
    detail:
      "HTTP with the SSRF guard in front of it. 20 calls, 1 MB bodies, 15 s each, every redirect re-checked.",
  },
  {
    icon: HardDrive,
    name: "workspace",
    detail:
      "read, write, list, stat, copy, move, mkdir, remove. Jailed to the run's workspace root, symlinks resolved before every call.",
  },
  {
    icon: KeyRound,
    name: "nodetool.secrets",
    detail:
      "get, tryGet, list — narrowed to the names the node declared. There is no setter anywhere in the guest.",
  },
  {
    icon: ImageIcon,
    name: "image / audio / video",
    detail:
      "Decode, trim, resize, mix, composite. Transforms return handles, so the bytes stay on the host while you chain calls.",
  },
  {
    icon: Radio,
    name: "emit / output / stream",
    detail:
      "The node's IO contract. emit streams a value now under backpressure, output records a final, stream() pulls items as they arrive.",
  },
  {
    icon: Cpu,
    name: "media / canvas / crypto / format",
    detail:
      "Resolve a ref to bytes, draw on a 2D surface replayed on a real host context, hash with WebCrypto, format with the host's Intl.",
  },
];

const deleted = [
  ["eval and Function", "Deleted before a single line of user code evaluates."],
  ["setTimeout and friends", "Their callbacks would fire outside the run's error contract. sleep(ms) is the only timer."],
  ["Ambient modules", "A body that imports nothing gets no loader at all. Dynamic import() is denied outright."],
  ["Buffer, process, env", "The Node-compat preamble never installs them, and the prelude deletes them anyway."],
];

export default function SandboxSection() {
  return (
    <section id="sandbox" aria-labelledby="sandbox-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20 mb-4"
          >
            <Cpu className="h-4 w-4" />
            Anatomy of a run
          </motion.span>
          <motion.h2
            id="sandbox-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            A stripped-down guest, and what the host hands it
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Your code starts with less than plain QuickJS. Everything past that
            is a bridge the host built for this specific run, bound to its
            limits and its abort signal. Nothing in the guest can widen a grant
            it was given.
          </motion.p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-3 min-w-0 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-1">A body that streams</h3>
            <p className="text-sm text-slate-400 mb-4">
              One import for the library, one global for the capability, two
              awaitable calls for the outputs.
            </p>
            <CodeBlock code={codeNodeBody} language="typescript" />
            <p className="mt-4 text-sm text-slate-400">
              <span className="text-slate-200 font-medium">The body picks the mode.</span>{" "}
              Mention <code className="font-mono text-teal-300">stream(name)</code> and it runs
              once for the whole stream, pulling its own items. Leave it out and
              it runs once per incoming item. There is nothing to configure.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="lg:col-span-2 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">The granted surface</h3>
            <ul className="space-y-4">
              {capabilities.map((cap) => (
                <li key={cap.name} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
                    <cap.icon className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-teal-300">{cap.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{cap.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.25 }}
          className="mt-8 rounded-2xl bg-gradient-to-br from-rose-900/15 to-slate-900/20 p-6 sm:p-8 ring-1 ring-rose-500/20"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20">
              <Trash2 className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Gone before your code loads</h3>
              <p className="text-sm text-slate-400">
                The prelude runs first, so there is no window where these exist.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {deleted.map(([name, detail]) => (
              <div key={name} className="rounded-xl bg-slate-900/50 p-5 ring-1 ring-slate-700/50">
                <h4 className="font-mono text-sm text-rose-300">{name}</h4>
                <p className="mt-2 text-sm text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
