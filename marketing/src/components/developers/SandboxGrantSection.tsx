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
  ["Tool calls per action", "50", "bounds a runaway loop"],
];

const guarantees = [
  {
    icon: ShieldCheck,
    title: "No dynamic code generation",
    body:
      "eval and Function are deleted before any user code evaluates, and dynamic import() is denied outright. Enforcement sits in the module normalizer rather than the loader, because QuickJS serves a cached module without consulting the loader.",
  },
  {
    icon: KeyRound,
    title: "Secrets are scoped, and never written",
    body:
      "A run declares the names it needs and the bridge refuses every other one, so a node that talks to one service cannot read another's credentials. There is no setter: request_secret takes a name and a reason, the user types the key in their own client, and the value never enters the guest, the websocket frame, or the model's context.",
  },
  {
    icon: Network,
    title: "SSRF guard, per hop",
    body:
      "fetch refuses loopback, link-local and private ranges, including IPv6 forms and IPv4-mapped addresses, and re-checks on every redirect. The switch that lifts it is host-set only, so guest code cannot enable it for itself.",
  },
  {
    icon: Radar,
    title: "Workspace containment",
    body:
      "Every workspace call resolves inside the run's root and re-checks the symlink-resolved real path immediately before the operation. Widening it to the host filesystem is a host-set switch that defaults off.",
  },
  {
    icon: Timer,
    title: "Cancellation, and a clock that suspends",
    body:
      "Once the abort signal fires, every subsequent bridge call fails fast and the guest unwinds. Time parked waiting on a person's approval is added back, so a prompt nobody answers does not kill the program that asked.",
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
            The grant
          </motion.span>
          <motion.h2
            id="limits-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Every limit is a number with a ceiling
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            A caller can tighten any limit, or raise it within bounds. No caller
            can switch a protection off, and nothing inside the guest can raise
            its own. These are the defaults a Code node and an agent action both
            start from.
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
