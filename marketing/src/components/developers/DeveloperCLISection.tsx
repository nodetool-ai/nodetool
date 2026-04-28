"use client";
import React from "react";
import { motion } from "framer-motion";
import { Terminal, Workflow, Code2, Boxes, Zap } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const customNodeCode = `// my-nodes/src/SentimentNode.ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class SentimentNode extends BaseNode {
  static readonly nodeType = "my.text.Sentiment";
  static readonly title = "Sentiment";
  static readonly description = "Score text sentiment from -1 to 1.";
  static readonly metadataOutputTypes = { score: "float" };

  @prop({ type: "str", default: "" })
  declare text: string;

  async process(): Promise<{ score: number }> {
    const score = await analyze(this.text);
    return { score };
  }
}`;

const programmaticRunCode = `import { WorkflowRunner } from "@nodetool-ai/kernel";
import { workflow, constant, text } from "@nodetool-ai/dsl";

const a = constant.string({ value: "Hello, " });
const b = constant.string({ value: "NodeTool!" });
const out = text.concat({ a: a.output, b: b.output });

const wf = workflow(out);
const runner = new WorkflowRunner();

runner.on("node_progress", (m) => console.log(m.progress));
runner.on("node_update", (m) => console.log(m.status));

const result = await runner.run(wf);
console.log(result);`;

const cliCommands = [
  {
    title: "Run Workflows",
    description: "Execute DSL workflows directly",
    command: "nodetool run examples/concat_text.ts",
  },
  {
    title: "Start the Server",
    description: "HTTP + WebSocket API on port 7777",
    command: "nodetool serve",
  },
  {
    title: "Agent Chat",
    description: "Interactive agent CLI with planning + tools",
    command: "nodetool-chat --agent --provider anthropic",
  },
];

const dslExampleCode = `// simple_chat_workflow.ts
// A complete chat workflow in code
import { workflow, input, agent, output } from "@nodetool-ai/dsl";

// Accept chat message input
const userMessage = input.message({
  name: "user_message",
  description: "Incoming message from user",
});

// Process with an agent
const reply = agent.run({
  provider: "ollama",
  model: "llama3.2:3b",
  system: "You are a helpful assistant.",
  prompt: userMessage.text,
});

// Return response
const response = output.string({
  name: "assistant_response",
  value: reply.text,
});

const wf = workflow(response);
console.log(JSON.stringify(wf));`;

const tsExamples = [
  {
    title: "Custom Node",
    icon: Boxes,
    color: "text-emerald-400",
    description: "Extend BaseNode, decorate fields, implement process()",
    code: customNodeCode,
  },
  {
    title: "Run Programmatically",
    icon: Zap,
    color: "text-amber-400",
    description: "Build a graph and stream events with WorkflowRunner",
    code: programmaticRunCode,
  },
];

interface DeveloperCLISectionProps {
  reducedMotion: boolean;
}

export default function DeveloperCLISection({
  reducedMotion,
}: DeveloperCLISectionProps) {
  return (
    <section
      id="cli-api"
      aria-labelledby="cli-api-title"
      className="rhythm-section relative"
    >
      <div className={sectionContainer}>
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20 mb-4"
          >
            <Terminal className="h-4 w-4" />
            CLI & SDK
          </motion.span>
          <motion.h2
            id="cli-api-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
Build, Run, Extend from Code
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            Declare graphs, write custom nodes, and run workflows from code.
            The CLI ships them, the runner streams them.
          </motion.p>
        </div>

        {/* DSL Example */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 rounded-2xl bg-gradient-to-br from-teal-900/20 to-violet-900/20 p-8 ring-1 ring-teal-500/20"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 ring-1 ring-teal-500/20">
              <Code2 className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Complete DSL Workflow</h3>
              <p className="text-sm text-slate-400">A complete chat workflow defined in code</p>
            </div>
          </div>
          <CodeBlock code={dslExampleCode} language="typescript" className="p-5 max-h-[500px] overflow-y-auto" />
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Terminal className="h-4 w-4 text-violet-400" />
            <span>Run with: <code className="text-violet-300">nodetool run simple_chat_workflow.ts</code></span>
          </div>
        </motion.div>

        {/* CLI Commands */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 rounded-2xl bg-slate-800/40 p-8 ring-1 ring-slate-700/50"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
              <Terminal className="h-5 w-5 text-violet-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">CLI Commands</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {cliCommands.map((cmd, idx) => (
              <motion.div
                key={cmd.title}
                initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="rounded-xl bg-slate-900/60 p-5"
              >
                <h4 className="font-semibold text-white mb-1">{cmd.title}</h4>
                <p className="text-sm text-slate-400 mb-3">{cmd.description}</p>
                <CodeBlock code={cmd.command} language="bash" className="p-3" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Code Examples */}
        <div className="grid gap-8 lg:grid-cols-2">
          {tsExamples.map((example, idx) => (
            <motion.div
              key={example.title}
              initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.15 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700/50 ring-1 ring-slate-600/50">
                  <example.icon className={`h-5 w-5 ${example.color}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{example.title}</h3>
                  <p className="text-sm text-slate-400">{example.description}</p>
                </div>
              </div>
              <CodeBlock code={example.code} language="typescript" className="max-h-[400px] overflow-y-auto" />
            </motion.div>
          ))}
        </div>

        {/* Get Started */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-12 text-center rounded-2xl bg-gradient-to-br from-violet-900/20 to-teal-900/20 p-8 ring-1 ring-violet-500/20"
        >
          <Workflow className="h-12 w-12 text-violet-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">
            Ready to Get Started?
          </h3>
          <p className="text-slate-400 max-w-xl mx-auto mb-6">
            Check out our comprehensive documentation with examples, tutorials, and API
            references to help you build your first AI workflow.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://docs.nodetool.ai/getting-started.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all hover:bg-violet-500"
            >
              <Code2 className="h-4 w-4" />
              Getting Started Guide
            </a>
            <a
              href="https://github.com/nodetool-ai/nodetool/tree/main/examples/workflows"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-3 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
            >
              Workflow Examples
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
