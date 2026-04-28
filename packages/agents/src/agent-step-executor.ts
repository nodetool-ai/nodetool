/**
 * AgentStepExecutor -- a NodeExecutor adapter that wraps StepExecutor.
 *
 * This bridges the agent system into the kernel: when WorkflowRunner encounters
 * a node of type "nodetool.agents.AgentStep", it resolves to this executor.
 * The executor creates a StepExecutor internally, runs the LLM tool-calling
 * loop, forwards ProcessingMessages via context.emit(), and returns the
 * final result as a Record for downstream kernel routing.
 */

import type { NodeExecutor } from "@nodetool/runtime";
import type { ProcessingContext, BaseProvider } from "@nodetool/runtime";
import type {
  NodeDescriptor,
  ProcessingMessage,
  StepResult
} from "@nodetool/protocol";
import { StepExecutor } from "./step-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";
import { randomUUID } from "node:crypto";

export interface AgentStepExecutorOptions {
  provider: BaseProvider;
  model: string;
  tools: Tool[];
  systemPrompt?: string;
  maxTokenLimit?: number;
  maxIterations?: number;
}

/**
 * Build a Step object from a NodeDescriptor with AgentStep properties.
 */
function stepFromDescriptor(node: NodeDescriptor): Step {
  const props = (node.properties ?? {}) as Record<string, unknown>;
  return {
    id: node.id,
    instructions:
      typeof props["instructions"] === "string" ? props["instructions"] : "",
    completed: false,
    dependsOn: [],
    outputSchema:
      typeof props["output_schema"] === "string"
        ? props["output_schema"]
        : undefined,
    tools: Array.isArray(props["tools"])
      ? (props["tools"] as string[])
      : undefined,
    logs: []
  };
}

/**
 * Format upstream inputs (arriving via kernel edges) into a context string
 * that gets prepended to the step instructions.
 */
function formatUpstreamContext(inputs: Record<string, unknown>): string {
  const entries = Object.entries(inputs).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return "";

  const sections = entries.map(([key, value]) => {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return `## Input "${key}":\n${serialized}`;
  });
  return (
    "# Upstream Results\n\n" + sections.join("\n\n") + "\n\n---\n\n"
  );
}

export class AgentStepExecutor implements NodeExecutor {
  private readonly node: NodeDescriptor;
  private readonly opts: AgentStepExecutorOptions;

  constructor(node: NodeDescriptor, opts: AgentStepExecutorOptions) {
    this.node = node;
    this.opts = opts;
  }

  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const step = stepFromDescriptor(this.node);
    const task: Task = {
      id: randomUUID(),
      title: step.instructions.slice(0, 80),
      steps: [step]
    };

    // Prepend upstream results to step instructions
    const upstreamContext = formatUpstreamContext(inputs);
    if (upstreamContext) {
      step.instructions = upstreamContext + step.instructions;
    }

    // Filter tools if the step specifies a subset
    let tools = this.opts.tools;
    if (step.tools && step.tools.length > 0) {
      const allowedNames = new Set(step.tools);
      tools = tools.filter((t) => allowedNames.has(t.name));
    }

    const executor = new StepExecutor({
      task,
      step,
      context: context!,
      provider: this.opts.provider,
      model: this.opts.model,
      tools,
      systemPrompt: this.opts.systemPrompt,
      maxTokenLimit: this.opts.maxTokenLimit,
      maxIterations: this.opts.maxIterations
    });

    let result: unknown = null;
    for await (const msg of executor.execute()) {
      // Forward processing messages for UI updates
      if (context) {
        context.emit(msg);
      }
      if (msg.type === "step_result") {
        result = (msg as StepResult).result;
      }
    }

    // Also store in context for backwards compat with code reading from context
    if (context) {
      context.set(this.node.id, result);
    }

    // Use "output" as the handle name so downstream nodes can connect via .output
    return { output: result, result };
  }
}
