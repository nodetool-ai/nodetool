"use client";
import React from "react";
import { motion } from "framer-motion";
import { Terminal, Workflow, Code2, Globe, Zap } from "lucide-react";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const httpApiCode = `curl -X POST "http://localhost:7777/api/workflows/<id>/run" \\
  -H "Content-Type: application/json" \\
  -d '{"params": {"prompt": "Generate image"}}'`;

const websocketApiCode = `const socket = new WebSocket("ws://localhost:7777/predict");

socket.send(msgpack.encode({
  command: "run_job",
  data: {
    type: "run_job_request",
    workflow_id: "YOUR_WORKFLOW_ID",
    params: { /* parameters */ }
  }
}));

socket.onmessage = async (event) => {
  const data = msgpack.decode(
    new Uint8Array(await event.data.arrayBuffer())
  );
  
  if (data.type === "job_update") {
    console.log("Status:", data.status);
  } else if (data.type === "node_progress") {
    console.log("Progress:", data.progress / data.total);
  }
};`;

const cliCommands = [
  {
    title: "Run Workflows",
    description: "Execute Python DSL workflows directly",
    command: "nodetool run examples/simple_chat_workflow.py",
  },
  {
    title: "List Available Nodes",
    description: "Discover all available nodes",
    command: "nodetool list-nodes",
  },
  {
    title: "Validate Workflows",
    description: "Check workflow syntax and structure",
    command: "nodetool validate workflow.py",
  },
];

const dslExampleCode = `"""
Simple Chat Workflow - demonstrates DSL patterns
"""
from nodetool.dsl.graph import create_graph
from nodetool.dsl.nodetool.input import MessageInput, MessageDeconstructor
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider

# Accept chat message input
message_input = MessageInput(
    name="user_message",
    description="Incoming message from user",
)

# Extract text content
message_deconstructor = MessageDeconstructor(
    value=message_input.output,
)

# Process with an agent
chat_agent = Agent(
    model=LanguageModel(
        provider=Provider.Ollama,
        id="llama3.2:3b",
    ),
    system="You are a helpful assistant.",
    prompt=message_deconstructor.out.text,
)

# Return response
output = Output(
    name="assistant_response",
    value=chat_agent.out.text,
)

# Build the graph
graph = create_graph(output)

# To run: from nodetool.dsl.graph import run_graph
# result = run_graph(graph)`;

const apiExamples = [
  {
    title: "HTTP API",
    icon: Globe,
    color: "text-blue-400",
    description: "Run workflows via REST endpoints",
    code: httpApiCode,
  },
  {
    title: "WebSocket API",
    icon: Zap,
    color: "text-amber-400",
    description: "Real-time updates with WebSocket",
    code: websocketApiCode,
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
            CLI & APIs
          </motion.span>
          <motion.h2
            id="cli-api-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Multiple Ways to Execute
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            Command-line tools, HTTP endpoints, and WebSocket streaming—choose the interface
            that fits your workflow.
          </motion.p>
        </div>

        {/* DSL Example */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 rounded-2xl bg-gradient-to-br from-indigo-900/20 to-violet-900/20 p-8 ring-1 ring-indigo-500/20"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Code2 className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Complete DSL Workflow</h3>
              <p className="text-sm text-slate-400">From the nodetool-base examples</p>
            </div>
          </div>
          <pre className="rounded-lg bg-slate-950/90 p-5 text-xs text-slate-300 overflow-x-auto font-mono border border-slate-700/50 leading-relaxed max-h-[500px] overflow-y-auto">
            <code className="language-python">{dslExampleCode}</code>
          </pre>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Terminal className="h-4 w-4 text-violet-400" />
            <span>Run with: <code className="text-violet-300">nodetool run simple_chat_workflow.py</code></span>
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
                <pre className="rounded bg-slate-950 p-3 text-xs text-slate-300 overflow-x-auto font-mono border border-slate-700/50">
                  <code className="language-bash">{cmd.command}</code>
                </pre>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* API Examples */}
        <div className="grid gap-8 lg:grid-cols-2">
          {apiExamples.map((example, idx) => (
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
              <pre className="rounded-lg bg-slate-950/90 p-4 text-xs text-slate-300 overflow-x-auto font-mono max-h-[300px] overflow-y-auto border border-slate-700/50 leading-relaxed">
                <code className="language-javascript">{example.code}</code>
              </pre>
            </motion.div>
          ))}
        </div>

        {/* Get Started */}
        <motion.div
          initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-12 text-center rounded-2xl bg-gradient-to-br from-violet-900/20 to-indigo-900/20 p-8 ring-1 ring-violet-500/20"
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
              href="https://docs.nodetool.ai/api-reference.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-6 py-3 text-sm font-semibold text-white ring-1 ring-slate-700 transition-all hover:bg-slate-700"
            >
              API Reference
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
