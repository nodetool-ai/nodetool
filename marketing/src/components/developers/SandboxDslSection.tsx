"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { GitBranch, Workflow } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const flowCode = `import "@nodetool-ai/sandbox-nodetool/flow";
import { agent } from "@nodetool-ai/sandbox-flow/nodetool.agents";
import { textToImage } from "@nodetool-ai/sandbox-flow/lib.image";

// Promise.all is the fan-out. No ForEach node, no scheduler.
const shots = await Promise.all(
  inputs.beats.map((beat) =>
    textToImage({ prompt: beat, model: inputs.model })
  )
);

// A streaming node carries .stream. Breaking early closes it,
// and the node stops.
let notes = "";
for await (const chunk of agent.stream({ objective: inputs.brief })) {
  notes += chunk.chunk ?? "";
  if (notes.length > 2000) break;
}

await output("shots", shots.map((s) => s.output));
await output("notes", notes);`;

const dslCode = `import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { resize } from "@nodetool-ai/sandbox-dsl/nodetool.image";
import { output as outputNode } from "@nodetool-ai/sandbox-dsl/nodetool.output";
import { validate_workflow, create_workflow }
  from "@nodetool-ai/sandbox-nodetool/workflows";

const prompt = stringInput({ name: "prompt", value: "a fox in snow" });
const smaller = resize({ image: prompt.output(), width: 256, height: 256 });

// workflow() walks back from its terminals and returns { nodes, edges }.
const graph = workflow(
  outputNode({ name: "image", value: smaller.output() })
);

// Free, and it catches the dangling edge before a run pays for
// the half of the graph that works.
const check = await validate_workflow({ graph });
if (!check.ok) {
  throw new Error(check.issues.map((i) => i.message).join("; "));
}

const saved = await create_workflow({ name: "Thumbnailer", graph });`;

const tabs = [
  {
    id: "flow",
    label: "Run a node",
    pack: "@nodetool-ai/sandbox-flow",
    icon: Workflow,
    accent: "text-teal-300",
    headline: "Use this when you just want the data.",
    blurb:
      "Functions are direct, awaitable API calls. You handle concurrency with Promise.all and branching with if/else. Nothing is scheduled: the call resolves the node from the registry, injects secrets, runs process(), and returns the outputs — the same execution the kernel performs, minus the actor.",
    code: flowCode,
    stats: [
      ["424", "node callables"],
      ["68", "namespace modules"],
      ["0", "graphs built"],
    ],
    notes: [
      "if, for and try are themselves. The pack ships no control-flow combinators.",
      "Each callable is generated from the node's own metadata, so its inputs are the node's inputs.",
      "Recursion is capped at depth 4, with 16 concurrently open streams per run.",
    ],
  },
  {
    id: "dsl",
    label: "Build a graph",
    pack: "@nodetool-ai/sandbox-dsl",
    icon: GitBranch,
    accent: "text-violet-300",
    headline: "Use this when you want an artifact.",
    blurb:
      "Nothing executes. Each call builds up a workflow graph instead — assign a handle to an input and the edge is wired for you. What you get back is kernel-shaped { nodes, edges }: validate it, run it on a server, or open it in the visual editor.",
    code: dslCode,
    stats: [
      ["441", "node builders"],
      ["70", "namespace modules"],
      ["1", "graph per workflow() call"],
    ],
    notes: [
      "The builders come from the same registry metadata the visual canvas draws from.",
      "A node type the pack does not export has no import to resolve, so a hallucinated type fails before the program runs.",
      "A handle is not text: interpolating one throws, rather than writing [object Object] into a property and wiring no edge.",
    ],
  },
] as const;

export default function SandboxDslSection() {
  const [active, setActive] = useState<string>(tabs[0].id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <section id="dsl" aria-labelledby="dsl-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-12">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-4 py-1.5 text-sm font-medium text-teal-300 ring-1 ring-inset ring-teal-500/20 mb-4"
          >
            <Workflow className="h-4 w-4" />
            Flow vs. DSL
          </motion.span>
          <motion.h2
            id="dsl-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Pick your paradigm
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Every node NodeTool ships is available as an import. We expose them
            two ways, and which one you want depends on what you need at the
            end: the values, or the graph that produced them.
          </motion.p>
        </div>

        <div
          role="tablist"
          aria-label="Sandbox DSL packs"
          className="mb-8 flex flex-wrap justify-center gap-3"
        >
          {tabs.map((t) => {
            const selected = t.id === tab.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`dsl-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`dsl-panel-${t.id}`}
                onClick={() => setActive(t.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
                  selected
                    ? "bg-slate-800 text-white ring-1 ring-teal-500/40"
                    : "bg-slate-900/50 text-slate-400 ring-1 ring-slate-700/50 hover:text-slate-200"
                }`}
              >
                <t.icon className={`h-4 w-4 ${selected ? t.accent : "text-slate-500"}`} />
                {t.label}
                <span className="hidden font-mono text-xs font-normal text-slate-500 sm:inline">
                  {t.pack.replace("@nodetool-ai/", "")}
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`dsl-panel-${tab.id}`}
          aria-labelledby={`dsl-tab-${tab.id}`}
          className="grid gap-8 lg:grid-cols-5 items-start"
        >
          <div className="lg:col-span-2">
            <p className="font-mono text-xs text-slate-500">{tab.pack}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{tab.headline}</h3>
            <p className="mt-4 text-slate-400">{tab.blurb}</p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {tab.stats.map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-xl bg-slate-800/40 p-4 text-center ring-1 ring-slate-700/50"
                >
                  <p className={`text-2xl font-bold ${tab.accent}`}>{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <ul className="mt-6 space-y-3">
              {tab.notes.map((note) => (
                <li key={note} className="flex gap-3 text-sm text-slate-400">
                  <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tab.id === "flow" ? "bg-teal-400" : "bg-violet-400"}`} />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3 min-w-0">
            <CodeBlock code={tab.code} language="typescript" />
          </div>
        </div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.25 }}
          className="mt-10 rounded-2xl bg-slate-800/40 p-6 sm:p-8 ring-1 ring-slate-700/50"
        >
          <h3 className="text-lg font-semibold text-white">Which one to reach for</h3>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div>
              <p className="font-mono text-sm text-teal-300">sandbox-flow</p>
              <p className="mt-2 text-sm text-slate-400">
                You want values. Branching, retries and concurrency are plain
                JavaScript, and every call still opens a{" "}
                <span className="font-mono text-slate-300">node.process</span>{" "}
                span and bills through the run&apos;s own context.
              </p>
            </div>
            <div>
              <p className="font-mono text-sm text-violet-300">sandbox-dsl</p>
              <p className="mt-2 text-sm text-slate-400">
                You want an artifact — something to open in the editor,
                validate, supervise, or hand to the server. The graph is just
                data until something checks it, so validate before you save.
              </p>
            </div>
            <div>
              <p className="font-mono text-sm text-slate-300">WorkflowRunner</p>
              <p className="mt-2 text-sm text-slate-400">
                An actor per node, correlated lineage, end-of-stream
                propagation. Right for the editor and for supervised runs, pure
                overhead when the caller is code that just wants a value.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
