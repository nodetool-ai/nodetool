/**
 * Abstract base class for all agents.
 *
 * Port of src/nodetool/agents/base_agent.py
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { Tool } from "./tools/base-tool.js";
import type { Task } from "./types.js";
import { DEFAULT_TOKEN_LIMIT } from "./constants.js";

export abstract class BaseAgent {
  readonly name: string;
  readonly objective: string;
  readonly provider: BaseProvider;
  readonly model: string;
  readonly tools: Tool[];
  readonly inputs: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly maxTokenLimit: number;
  results: unknown = null;
  task: Task | null = null;

  constructor(opts: {
    name: string;
    objective: string;
    provider: BaseProvider;
    model: string;
    tools?: Tool[];
    inputs?: Record<string, unknown>;
    systemPrompt?: string;
    maxTokenLimit?: number;
  }) {
    this.name = opts.name;
    this.objective = opts.objective;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ?? [];
    this.inputs = opts.inputs ?? {};
    this.systemPrompt = opts.systemPrompt ?? "";
    this.maxTokenLimit = opts.maxTokenLimit ?? DEFAULT_TOKEN_LIMIT;
  }

  /**
   * Execute the agent's objective.
   * Subclasses must implement this to define planning and execution logic.
   */
  abstract execute(
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage>;

  /**
   * Retrieve the results of the agent's execution.
   */
  abstract getResults(): unknown;
}
