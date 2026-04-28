/**
 * AgentWorkflowRunner -- executes a graph plan via the kernel's WorkflowRunner.
 *
 * Takes a GraphData (produced by GraphPlanner) and runs it through the kernel.
 * Agent step nodes are resolved via AgentStepExecutor; deterministic nodes
 * are resolved via the provided NodeRegistry.
 */

import { WorkflowRunner } from "@nodetool/kernel";
import type { NodeRegistry } from "@nodetool/node-sdk";
import type { BaseProvider, ProcessingContext } from "@nodetool/runtime";
import type {
  GraphData,
  ProcessingMessage,
  NodeUpdate,
  StepResult
} from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";
import { AGENT_STEP_NODE_TYPE } from "./graph-builder.js";
import { AgentStepExecutor } from "./agent-step-executor.js";
import type { Tool } from "./tools/base-tool.js";
import { randomUUID } from "node:crypto";

const log = createLogger("nodetool.agents.workflow-runner");

export interface AgentWorkflowRunnerOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  tools: Tool[];
  context: ProcessingContext;
  systemPrompt?: string;
  maxTokenLimit?: number;
  maxStepIterations?: number;
  inputs?: Record<string, unknown>;
}

export class AgentWorkflowRunner {
  private readonly opts: AgentWorkflowRunnerOptions;

  constructor(opts: AgentWorkflowRunnerOptions) {
    this.opts = opts;
  }

  /**
   * Execute a graph plan and yield ProcessingMessages live as the kernel emits them.
   */
  async *execute(
    graphData: GraphData
  ): AsyncGenerator<ProcessingMessage> {
    const jobId = randomUUID();
    const { provider, model, registry, tools, context } = this.opts;

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor: (node: { id: string; type: string }) => {
        if (node.type === AGENT_STEP_NODE_TYPE) {
          return new AgentStepExecutor(node, {
            provider,
            model,
            tools,
            systemPrompt: this.opts.systemPrompt,
            maxTokenLimit: this.opts.maxTokenLimit,
            maxIterations: this.opts.maxStepIterations
          });
        }
        return registry.resolve(node);
      },
      executionContext: context
    });

    log.info("Executing agent graph", {
      jobId,
      nodes: graphData.nodes.length,
      edges: graphData.edges.length
    });

    // Intercept context.emit to stream kernel messages live to our generator.
    const queue: ProcessingMessage[] = [];
    let waiter: (() => void) | null = null;
    const wake = (): void => {
      const w = waiter;
      waiter = null;
      w?.();
    };
    const ctx = context as unknown as {
      emit: (msg: ProcessingMessage) => void;
    };
    const origEmit = ctx.emit.bind(context);
    ctx.emit = (msg: ProcessingMessage) => {
      origEmit(msg);
      queue.push(msg);
      wake();
    };

    let runError: unknown = null;
    let done = false;
    const runPromise = runner
      .run({ job_id: jobId, params: this.opts.inputs }, graphData)
      .catch((err) => {
        runError = err;
        return undefined;
      })
      .finally(() => {
        done = true;
        wake();
      });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (done) break;
        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
      }
    } finally {
      ctx.emit = origEmit;
    }

    if (runError) {
      throw runError instanceof Error
        ? runError
        : new Error(String(runError));
    }

    const result = await runPromise;
    if (!result) {
      throw new Error("Workflow execution produced no result");
    }

    if (result.status === "failed") {
      throw new Error(result.error ?? "Workflow execution failed");
    }

    const nodeErrors = (result.messages ?? []).filter(
      (m: ProcessingMessage): m is NodeUpdate =>
        m.type === "node_update" && (m as NodeUpdate).status === "error"
    );
    if (nodeErrors.length > 0) {
      log.error("Node execution errors", {
        count: nodeErrors.length,
        first: nodeErrors[0].error
      });
    }

    log.info("Agent graph execution complete", {
      jobId,
      status: result.status,
      outputKeys: Object.keys(result.outputs)
    });

    // Yield a final step_result with the graph outputs so callers can
    // capture the result (MultiModeAgent checks is_task_result).
    if (result.status === "completed" && Object.keys(result.outputs).length > 0) {
      yield {
        type: "step_result",
        step: { name: "graph_execution", status: "completed" },
        result: result.outputs,
        is_task_result: true
      } satisfies StepResult;
    }
  }
}
