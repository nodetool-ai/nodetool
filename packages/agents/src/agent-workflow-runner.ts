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
  NodeUpdate
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
}

export class AgentWorkflowRunner {
  private readonly opts: AgentWorkflowRunnerOptions;

  constructor(opts: AgentWorkflowRunnerOptions) {
    this.opts = opts;
  }

  /**
   * Execute a graph plan and yield ProcessingMessages.
   */
  async *execute(
    graphData: GraphData
  ): AsyncGenerator<ProcessingMessage> {
    const jobId = randomUUID();
    const { provider, model, registry, tools, context } = this.opts;
    const collectedMessages: ProcessingMessage[] = [];

    // Capture messages emitted during execution
    const originalOnMessage = (context as unknown as Record<string, unknown>)[
      "_onMessage"
    ] as ((msg: ProcessingMessage) => void) | null;

    const captureMessage = (msg: ProcessingMessage): void => {
      collectedMessages.push(msg);
      if (originalOnMessage) {
        originalOnMessage(msg);
      }
    };

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

    const result = await runner.run({ job_id: jobId }, graphData);

    // Yield all collected messages
    for (const msg of collectedMessages) {
      yield msg;
    }

    // Yield messages from the runner result
    if (result.messages) {
      for (const msg of result.messages) {
        yield msg;
      }
    }

    if (result.status === "failed") {
      throw new Error(result.error ?? "Workflow execution failed");
    }

    // Surface node-level errors
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
  }
}
