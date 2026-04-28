"use client";
import React from "react";
import { motion } from "framer-motion";
import { Code2, Terminal, Blocks } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const features = [
  {
    title: "Developer SDK",
    description:
      "Build and run workflows programmatically. Strict types, async streaming, and a fluent graph builder.",
    icon: Code2,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    code: `import { WorkflowRunner } from "@nodetool/kernel";

const runner = new WorkflowRunner();
const result = await runner.run(graph, {
  prompt: "A sunset over mountains",
});`,
  },
  {
    title: "Graph DSL",
    description:
      "Declare workflows in code. Type-checked node inputs and outputs, no YAML, no JSON-by-hand.",
    icon: Terminal,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    code: `import { workflow, constant, text } from "@nodetool/dsl";

const a = constant.string({ value: "Hello, " });
const b = constant.string({ value: "NodeTool!" });
const out = text.concat({ a: a.output, b: b.output });

const wf = workflow(out);`,
  },
  {
    title: "Custom Nodes",
    description:
      "Extend NodeTool with your own nodes. Decorate fields, implement process(), ship it.",
    icon: Blocks,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    code: `import { BaseNode, prop } from "@nodetool/node-sdk";

export class MyNode extends BaseNode {
  static readonly nodeType = "my.pkg.MyNode";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "" })
  declare prompt: string;

  async process() {
    return { output: await myLogic(this.prompt) };
  }
}`,
  },
];

interface DeveloperFeaturesSectionProps {
  reducedMotion: boolean;
}

export default function DeveloperFeaturesSection({
  reducedMotion,
}: DeveloperFeaturesSectionProps) {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
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
            className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20 mb-4"
          >
            Developer Experience
          </motion.span>
          <motion.h2
            id="features-title"
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            Build with Powerful APIs
          </motion.h2>
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto"
          >
            Everything you need to integrate AI workflows into your applications
          </motion.p>
        </div>

        {/* Main Features with Code */}
        <div className="space-y-6">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={reducedMotion ? {} : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className={`group relative rounded-2xl ${feature.bgColor} border ${feature.borderColor} p-6 sm:p-8 backdrop-blur-sm`}
            >
              <div className="grid gap-6 md:grid-cols-5 md:gap-8 items-start">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.bgColor} ring-1 ${feature.borderColor}`}
                    >
                      <feature.icon className={`h-5 w-5 ${feature.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-slate-400">{feature.description}</p>
                </div>
                <div className="md:col-span-3 min-w-0">
                  <CodeBlock code={feature.code} language="typescript" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
