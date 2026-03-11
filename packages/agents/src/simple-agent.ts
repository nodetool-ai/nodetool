/**
 * SimpleAgent -- plans and executes a single step for a given objective.
 *
 * Port of src/nodetool/agents/simple_agent.py
 */

import type { BaseProvider } from "@nodetool/runtime";
import type { ProcessingContext } from "@nodetool/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool/protocol";
import { BaseAgent } from "./base-agent.js";
import { StepExecutor } from "./step-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";
import { randomUUID } from "node:crypto";

export class SimpleAgent extends BaseAgent {
  private readonly outputSchema: Record<string, unknown>;
  private readonly maxIterations: number;

  constructor(opts: {
    name: string;
    objective: string;
    provider: BaseProvider;
    model: string;
    tools: Tool[];
    outputSchema: Record<string, unknown>;
    inputs?: Record<string, unknown>;
    systemPrompt?: string;
    maxIterations?: number;
    maxTokenLimit?: number;
  }) {
    super(opts);
    this.outputSchema = opts.outputSchema;
    this.maxIterations = opts.maxIterations ?? 20;
  }

  async *execute(context: ProcessingContext): AsyncGenerator<ProcessingMessage> {
    const step: Step = {
      id: randomUUID(),
      instructions: this.objective,
      completed: false,
      dependsOn: [],
      outputSchema: JSON.stringify(this.outputSchema),
      logs: [],
    };

    const task: Task = {
      id: randomUUID(),
      title: this.objective,
      steps: [step],
    };

    this.task = task;

    const executor = new StepExecutor({
      task,
      step,
      context,
      provider: this.provider,
      model: this.model,
      tools: this.tools,
      systemPrompt: this.systemPrompt || undefined,
      maxTokenLimit: this.maxTokenLimit,
      maxIterations: this.maxIterations,
    });

    for await (const item of executor.execute()) {
      if (item.type === "step_result") {
        this.results = (item as StepResult).result;
      }
      yield item;
    }
  }

  getResults(): unknown {
    return this.results;
  }
}
