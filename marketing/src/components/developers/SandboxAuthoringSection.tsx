"use client";
import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GitCompare, Recycle, Terminal } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const scriptBody = `// A JS script: a body plus declared ports, secrets, a timeout,
// and saved test cases. Callable from a mini app, a Code node,
// an agent, or another script.
let sum = 0;
for await (const n of stream("numbers")) {
  sum += n;
  await emit("running", sum);
}
await output("total", sum);`;

const loopCommands = `# Static. Syntax, imports against the installed catalog, undefined
# names, an undeclared inputs.* read, an output no return path sets.
nodetool jsscript validate ./running-total.json

# Once, in the real sandbox, with stream items staged by handle.
nodetool jsscript run ./running-total.json \\
  --input-streams '{"numbers":[1,2,3]}'

# The document's own saved cases. Non-zero exit on any failure.
nodetool jsscript test ./running-total.json --json

# A whole graph, before a run pays for the half that works.
nodetool validate my-workflow.json
nodetool debug my-workflow.json --watch`;

const cards = [
  {
    icon: CheckCircle2,
    title: "One analysis, every caller",
    body:
      "The AST that reports an unresolvable import, a bare read of a node input, or a declared output nothing writes lives in one package. The CLI validator, the authoring planner and the editor all read it, so a body cannot pass in one surface and fail in another.",
  },
  {
    icon: GitCompare,
    title: "--watch prints the diff, not the report",
    body:
      "Re-run on every save and see only what moved: verdict transitions, issues that appeared and resolved, token and cost movement. The edit-verify loop reads as a changelog instead of a fresh wall of output.",
  },
  {
    icon: Recycle,
    title: "Scripts compose, bounded",
    body:
      "A script runs inside its own envelope — its declared secrets intersected with the caller's allowance, its own timeout, its own imports. Composition is capped at depth 4 with a script-id chain, so a cycle fails the call naming it.",
  },
];

export default function SandboxAuthoringSection() {
  return (
    <section id="authoring" aria-labelledby="authoring-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20 mb-4"
          >
            <Terminal className="h-4 w-4" />
            The author loop
          </motion.span>
          <motion.h2
            id="authoring-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Validate, run, test — headless, from a file
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Every surface is drivable without a browser, and a file target needs
            no database. The same three verbs an agent reaches as{" "}
            <span className="font-mono text-slate-300">validate_code</span>,{" "}
            <span className="font-mono text-slate-300">run_code</span> and{" "}
            <span className="font-mono text-slate-300">test_code</span> are the
            ones you run at the prompt.
          </motion.p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="min-w-0 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">The script</h3>
            <CodeBlock code={scriptBody} language="typescript" />
            <p className="mt-4 text-sm text-slate-400">
              A body that mentions{" "}
              <code className="font-mono text-teal-300">stream</code> runs once
              for the whole stream and pulls its own items. Time parked on a
              take is clock-suspended, so a slow upstream cannot kill a correct
              consumer.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="min-w-0 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">The loop</h3>
            <CodeBlock code={loopCommands} language="bash" />
            <p className="mt-4 text-sm text-slate-400">
              Static checks return in well under a second, which is what makes
              them the pre-flight rather than an afterthought.
            </p>
          </motion.div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {cards.map((card, idx) => (
            <motion.div
              key={card.title}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <card.icon className="h-5 w-5 text-emerald-400" />
              </div>
              <h4 className="mt-4 font-semibold text-white">{card.title}</h4>
              <p className="mt-2 text-sm text-slate-400">{card.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
