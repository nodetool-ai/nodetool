"use client";
import React from "react";
import { motion } from "framer-motion";
import { KeyRound, Network, Radar, ShieldCheck, Timer } from "lucide-react";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const limits: Array<[string, string, string]> = [
  ["Execution time", "30 s", "interrupt handler on a CPU budget"],
  ["Guest heap", "64 MB", "512 MB"],
  ["Call stack", "512 KB", "8 MB"],
  ["Fetch calls", "20 per run", "100"],
  ["Fetch body", "1 MB", "50 MB"],
  ["Fetch timeout", "15 s", "120 s"],
  ["Redirect hops", "5", "re-checked at every hop"],
  ["Output size", "100 KB", "10 MB"],
  ["Media handles", "256 MB per run", "total encoded payload"],
  ["Tool calls per action", "50", "stops a runaway loop"],
];

const guarantees = [
  {
    icon: ShieldCheck,
    title: "No dynamic code generation",
    body:
      "No eval, no Function constructor, and dynamic import() is blocked outright. Enforcement sits in the module normalizer, not the loader — QuickJS serves a cached module without ever consulting the loader.",
  },
  {
    icon: KeyRound,
    title: "Scoped secrets, and no setter",
    body:
      "A script declares the secrets it needs up front and the bridge refuses every other name, so a node that talks to one service cannot read another's credentials. Writing one goes through the user's own client: request_secret takes a name and a reason, never a value. The credential never enters the guest, the websocket frame, or an LLM context.",
  },
  {
    icon: Network,
    title: "SSRF guard, on every hop",
    body:
      "The built-in fetch blocks loopback, link-local and private ranges, including IPv6 forms and IPv4-mapped addresses, and validates every single redirect hop. The switch that lifts it is host-set only, so guest code cannot enable it for itself.",
  },
  {
    icon: Radar,
    title: "Strict workspace containment",
    body:
      "workspace.read, write and the rest are jailed to the run's root directory, with symlinks resolved and the real path re-checked immediately before every operation. Widening it to the host filesystem is a host-set switch that defaults off.",
  },
  {
    icon: Timer,
    title: "Hard abort, suspendable clock",
    body:
      "Once the abort signal fires, every bridge call after it fails fast and the guest unwinds. Time parked waiting on a human approval is credited back, so a prompt nobody answers does not kill the program that asked.",
  },
];

export default function SandboxGrantSection() {
  return (
    <section id="limits" aria-labelledby="limits-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-4 py-1.5 text-sm font-medium text-sky-300 ring-1 ring-inset ring-sky-500/20 mb-4"
          >
            <ShieldCheck className="h-4 w-4" />
            Security and limits
          </motion.span>
          <motion.h2
            id="limits-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Locked down by default
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Hard ceilings: 64 MB guest heap, 30 s of CPU, a 512 KB call stack.
            A caller can tighten any limit or raise it within bounds. Nobody can
            switch a protection off, and nothing inside the guest can raise its
            own. A Code node and an agent action start from the same numbers.
          </motion.p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-2 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Defaults and ceilings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="pb-2 pr-3 font-medium">Limit</th>
                    <th scope="col" className="pb-2 pr-3 font-medium">Default</th>
                    <th scope="col" className="pb-2 font-medium">Ceiling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {limits.map(([name, value, ceiling]) => (
                    <tr key={name}>
                      <th scope="row" className="py-2 pr-3 font-normal text-slate-300">
                        {name}
                      </th>
                      <td className="py-2 pr-3 font-mono text-sky-300">{value}</td>
                      <td className="py-2 text-xs text-slate-500">{ceiling}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <div className="lg:col-span-3 grid gap-5 sm:grid-cols-2">
            {guarantees.map((g, idx) => (
              <motion.div
                key={g.title}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20">
                  <g.icon className="h-5 w-5 text-sky-400" />
                </div>
                <h4 className="mt-4 font-semibold text-white">{g.title}</h4>
                <p className="mt-2 text-sm text-slate-400">{g.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
