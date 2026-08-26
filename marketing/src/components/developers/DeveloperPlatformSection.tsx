"use client";
import React from "react";
import { motion } from "framer-motion";
import { Blocks, Plug, Server } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const customNodeCode = `import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class SentimentNode extends BaseNode {
  static readonly nodeType = "my.text.Sentiment";
  static readonly title = "Sentiment";
  static readonly description = "Score text sentiment from -1 to 1.";
  static readonly metadataOutputTypes = { score: "float" };

  @prop({ type: "str", default: "" })
  declare text: string;

  async process(): Promise<{ score: number }> {
    return { score: await analyze(this.text) };
  }
}`;

const installCode = `git clone https://github.com/nodetool-ai/nodetool
cd nodetool
nvm use                  # Node 22.22.1, from .nvmrc
npm install
npm run build:packages
npm run dev:nodetool -- serve   # HTTP + WebSocket on :7777`;

const cards = [
  {
    icon: Blocks,
    title: "Custom nodes",
    body:
      "Extend BaseNode, decorate the properties, implement process(). Register the package and the node appears in the canvas, in the DSL codegen, and as a sandbox-flow callable — one definition, every surface.",
  },
  {
    icon: Plug,
    title: "MCP, for agents outside NodeTool",
    body:
      "The toolbelt speaks MCP. nodetool mcp install wires up a CLI agent; the .mcpb bundle installs into Claude Desktop by drag-and-drop and hot-attaches when the server appears. A deployed server is reached at /mcp with a token minted in settings.",
  },
  {
    icon: Server,
    title: "Run it yourself",
    body:
      "The deploy unit is a self-contained container image with the frontend and the example workflows baked in. Docker Compose for self-hosting, or the deploy tooling for SSH, RunPod, GCP and Supabase targets. AGPL-3.0, your keys, your files.",
  },
];

export default function DeveloperPlatformSection() {
  return (
    <section id="platform" aria-labelledby="platform-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-slate-500/10 px-4 py-1.5 text-sm font-medium text-slate-300 ring-1 ring-inset ring-slate-500/20 mb-4"
          >
            Around the sandbox
          </motion.span>
          <motion.h2
            id="platform-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            The rest of the runtime
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            Sandboxed code is where you spend most of your time. Below it sits
            an actor-model kernel, a node SDK, an HTTP and WebSocket API, and a
            container you can run on your own boxes.
          </motion.p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {cards.map((card, idx) => (
            <motion.div
              key={card.title}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
                <card.icon className="h-5 w-5 text-violet-400" />
              </div>
              <h4 className="mt-4 font-semibold text-white">{card.title}</h4>
              <p className="mt-2 text-sm text-slate-400">{card.body}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="min-w-0 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">A node in 15 lines</h3>
            <CodeBlock code={customNodeCode} language="typescript" />
          </motion.div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="min-w-0 rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
          >
            <h3 className="text-lg font-semibold text-white mb-4">From a checkout</h3>
            <CodeBlock code={installCode} language="bash" />
            <p className="mt-4 text-sm text-slate-400">
              The <span className="font-mono text-slate-300">@nodetool-ai</span>{" "}
              packages are not on npm yet, so host-side imports resolve from a
              source checkout. The sandbox specifiers on this page are a
              different thing: they resolve inside the guest, and every pack
              listed above ships with the app.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
