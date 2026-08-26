"use client";
import React from "react";
import { motion } from "framer-motion";
import { Bot, Eye, Layers, ShieldCheck } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const actionCode = `import { find_model } from "@nodetool-ai/sandbox-nodetool/models";
import { run_workflow } from "@nodetool-ai/sandbox-nodetool/workflows";
import { thread_memory_save } from "@nodetool-ai/sandbox-nodetool/memory";

// One action. Five tool calls. Only finish() reaches the transcript.
const { results } = await find_model({
  capability: "text_to_image",
  query: "flux schnell"
});

const beats = ["establishing wide", "hands on the console", "cut to black"];
const runs = await Promise.all(
  beats.map((prompt) =>
    run_workflow({
      workflow_id: "wf_storyboard",
      params: { prompt, model: results[0].ref }
    })
  )
);

const stills = runs.map((r) => r.outputs.image?.[0]).filter(Boolean);
await thread_memory_save({
  content: "Storyboard stills for the console scene",
  resources: stills.map((uri) => ({ type: "asset", uri }))
});

finish({ shots: stills.length, missing: beats.length - stills.length });`;

const namespaces = [
  "workflows", "nodes", "models", "agents", "assets", "media", "jobs",
  "collections", "web", "memory", "threads", "documents", "scripts",
  "storyboards", "timelines", "sketches", "model3d", "entities", "apps",
  "js-scripts", "code", "flow", "packs", "settings", "files", "email",
  "google", "serpapi", "apify", "costs", "style", "shared", "ui",
];

const facts = [
  {
    icon: Layers,
    title: "Token savings, by construction",
    body:
      "The data stays in the guest isolate. You do not pay to pass giant JSON arrays back and forth to the model — only the reduction crosses into its context. The model sees execute_code({ code }) and nothing else.",
  },
  {
    icon: ShieldCheck,
    title: "Zero new privileges",
    body:
      "An agent gets the same limits and the same toolbelt as a developer writing a Code node. Every imported function is a tool the model could have called directly; an off-allowlist import stops the action before the guest starts, and third-party packs need session consent.",
  },
  {
    icon: Eye,
    title: "Fully observable",
    body:
      "Every call inside an action still surfaces to the host as a tool_call_update, so composition does not become opacity. Tool calls are hard-capped at 50 per action, which stops a runaway loop.",
  },
];

export default function AgentSandboxSection() {
  return (
    <section id="agents" aria-labelledby="agents-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20 mb-4"
          >
            <Bot className="h-4 w-4" />
            CodeAct
          </motion.span>
          <motion.h2
            id="agents-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Agents write code, not tool calls
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Standard tool-calling is a round trip per call: emit JSON, wait,
            loop. With CodeAct the agent writes a whole JavaScript program
            instead, and it runs in the same isolate your Code node runs in. It
            loops, branches and reduces locally, reaching 208 platform tools as
            imports across 33 namespaces. Its return value, logs and thrown
            errors are the observation for the next turn.
          </motion.p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-3 min-w-0"
          >
            <CodeBlock code={actionCode} language="typescript" />
            <p className="mt-4 text-sm text-slate-400">
              Five tool calls, one action, one observation. The payload never
              leaves the guest — only the reduction does.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="lg:col-span-2 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white">
              <span className="font-mono text-sm text-emerald-300">
                @nodetool-ai/sandbox-nodetool/
              </span>
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              33 namespaces, 208 tools. Only what an action imports gets
              mounted, so you pay for one module&apos;s dependency cone rather
              than the whole registry.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {namespaces.map((ns) => (
                <span
                  key={ns}
                  className="rounded-md bg-slate-900/70 px-2.5 py-1 font-mono text-xs text-slate-300 ring-1 ring-slate-700/50"
                >
                  {ns}
                </span>
              ))}
            </div>
            <p className="mt-5 text-sm text-slate-400">
              Every capability resolves against the run&apos;s own user id, and
              &quot;missing&quot; and &quot;not yours&quot; are the same answer,
              so a run cannot probe for ids.
            </p>
          </motion.div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {facts.map((fact, idx) => (
            <motion.div
              key={fact.title}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <fact.icon className="h-5 w-5 text-emerald-400" />
              </div>
              <h4 className="mt-4 font-semibold text-white">{fact.title}</h4>
              <p className="mt-2 text-sm text-slate-400">{fact.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.25 }}
          className="mt-8 rounded-2xl bg-gradient-to-br from-emerald-900/15 to-slate-900/20 p-6 sm:p-8 ring-1 ring-emerald-500/20"
        >
          <h3 className="text-xl font-semibold text-white">
            Your code and the agent&apos;s are the same program
          </h3>
          <p className="mt-3 max-w-3xl text-slate-400">
            A Code node body is code a person saved. An action is code the model
            just wrote. The only difference is what the host granted each one:
            the packs a session consented to, the secret names in scope, the
            tools on the belt. Engine, limits, marshaling and imports are one
            implementation, so what you test by hand is what the agent gets at
            runtime.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://github.com/nodetool-ai/nodetool/blob/main/docs/codeact-design.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
            >
              CodeAct design notes
            </a>
            <a
              href="https://docs.nodetool.ai/javascript-sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
            >
              Sandbox reference
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
