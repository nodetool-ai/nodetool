/**
 * `plan_orchestration_script` — the {@link ScriptPlanner} exposed as a chat
 * tool, the code-shaped counterpart to `plan_workflow_graph`.
 *
 * The LLM hands over an objective; the planner authors a JavaScript
 * orchestration script against the {@link ScriptRunner} guest API, and the
 * runner executes it — every `agent()` call in the script becomes a real
 * sub-agent running on the caller's toolset. Planning and execution events are
 * forwarded upward tagged with `parent_tool_call_id`, so the chat UI streams
 * the planner's progress and each sub-agent's work under this tool's card.
 *
 * Sub-agent tools are the *gated* parent toolset, so anything with side
 * effects still goes through the permission gate; the orchestration call
 * itself has none.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { Tool } from "./base-tool.js";
import { TOOL_CALL_ID_FIELD } from "./subtask-fields.js";
import { ScriptPlanner } from "../script-planner.js";
import { ScriptRunner } from "../script-runner.js";

const log = createLogger("nodetool.agents.plan-orchestration-script-tool");

/** Agent-call ceiling for a chat-initiated script. Well under ScriptRunner's own default. */
export const DEFAULT_TOOL_MAX_AGENT_CALLS = 20;

const CANCELLED = "Orchestration was cancelled.";

export interface PlanOrchestrationScriptToolOptions {
  provider: BaseProvider;
  model: string;
  /**
   * Tools sub-agents may use. Called lazily on each invocation so a
   * dynamically-mutated toolbelt is observed, mirroring `run_subtask`.
   */
  parentTools?: () => Tool[];
  /**
   * Forwards planner and sub-agent events to the client. Events arrive tagged
   * with `parent_tool_call_id` so the UI can nest them under this tool's card.
   */
  forwardMessage?: (msg: ProcessingMessage) => Promise<void> | void;
  /**
   * Resolves the abort signal for the *current* chat turn. Read lazily on each
   * call: the tool outlives a single turn, and each turn installs a fresh
   * controller, so a captured signal would go stale after the first Stop.
   */
  signal?: () => AbortSignal | undefined;
  /** Lifetime cap on `agent()` calls per script. Defaults to 20. */
  maxAgentCalls?: number;
  /** Concurrent `agent()` calls beyond this queue. Defaults to ScriptRunner's. */
  maxConcurrentAgents?: number;
}

const DESCRIPTION = [
  "Plan and run an orchestration script for a multi-step objective. The",
  "backend ScriptPlanner writes ONE JavaScript script that coordinates",
  "sub-agents (`agent()`, `parallel()`, `pipeline()`, `budget`), and the",
  "sandboxed ScriptRunner executes it — each `agent()` call is a real",
  "sub-agent with this session's tools. Returns the script and its return",
  "value; progress streams to the user.",
  "",
  "Use this over repeated `run_subtask` calls when the work needs control",
  "flow a flat list of subtasks cannot express: fan-out over an unknown-size",
  "list, loop-until-done, per-item pipelines, or budget-scaled depth. Set",
  "`execute: false` to review the script without running it."
].join("\n");

export class PlanOrchestrationScriptTool extends Tool {
  readonly name = "plan_orchestration_script";
  readonly needsToolCallId = true;
  readonly description = DESCRIPTION;
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      objective: {
        type: "string" as const,
        description:
          "Natural-language description of what the orchestration should " +
          "accomplish. Self-contained — sub-agents see nothing else."
      },
      inputs: {
        type: "object" as const,
        description:
          "Values the script can read via `inputs`, keyed by name. Inline " +
          "anything the sub-agents need here rather than assuming context."
      },
      output_schema: {
        type: "object" as const,
        description:
          "JSON schema the final deliverable must match. Omit for free text."
      },
      execute: {
        type: "boolean" as const,
        description:
          "Run the script after planning it. Default true; set false to " +
          "review the script first.",
        default: true
      }
    },
    required: ["objective"]
  };

  constructor(private readonly opts: PlanOrchestrationScriptToolOptions) {
    super();
  }

  userMessage(params: Record<string, unknown>): string {
    const objective =
      typeof params["objective"] === "string"
        ? params["objective"].slice(0, 80)
        : "objective";
    return `Orchestrating: ${objective}`;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const objective =
      typeof params["objective"] === "string" ? params["objective"].trim() : "";
    if (!objective) {
      return {
        error: "`objective` is required and must be a non-empty string."
      };
    }

    const parentToolCallId =
      typeof params[TOOL_CALL_ID_FIELD] === "string"
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;
    const forward = async (msg: ProcessingMessage): Promise<void> => {
      if (!this.opts.forwardMessage) return;
      const tagged = {
        ...(msg as unknown as Record<string, unknown>),
        parent_tool_call_id: parentToolCallId
      } as unknown as ProcessingMessage;
      try {
        await this.opts.forwardMessage(tagged);
      } catch {
        // A broken forwarder must not kill the run — the model still gets the
        // script and result from the tool return below.
      }
    };

    const signal = this.opts.signal?.();
    if (signal?.aborted) return { error: CANCELLED };

    const inputs =
      params["inputs"] && typeof params["inputs"] === "object"
        ? (params["inputs"] as Record<string, unknown>)
        : {};
    const outputSchema =
      params["output_schema"] && typeof params["output_schema"] === "object"
        ? (params["output_schema"] as Record<string, unknown>)
        : undefined;
    const tools = this.opts.parentTools?.() ?? [];

    const planner = new ScriptPlanner({
      provider: this.opts.provider,
      model: this.opts.model,
      tools,
      outputSchema,
      inputs,
      threadId: context.threadId ?? undefined,
      signal
    });

    let script: string | null = null;
    const planGen = planner.plan(objective, context);
    let next = await planGen.next();
    while (!next.done) {
      // The planner's own abort stops its LLM loop, but a tool call already in
      // flight still resolves — stop driving the generator so a Stop ends the
      // turn promptly instead of after the current round.
      if (signal?.aborted) {
        await planGen.return(null);
        return { error: CANCELLED };
      }
      await forward(next.value);
      next = await planGen.next();
    }
    script = next.value;

    if (signal?.aborted) return { error: CANCELLED };
    if (!script) {
      return {
        error:
          "ScriptPlanner failed to produce a valid orchestration script. " +
          "Sharpen the objective (name the concrete steps and deliverable) " +
          "and retry."
      };
    }

    if (params["execute"] === false) {
      return { script, executed: false };
    }

    const runner = new ScriptRunner({
      provider: this.opts.provider,
      model: this.opts.model,
      context,
      tools,
      inputs,
      signal,
      maxAgentCalls: this.opts.maxAgentCalls ?? DEFAULT_TOOL_MAX_AGENT_CALLS,
      maxConcurrentAgents: this.opts.maxConcurrentAgents
    });

    const runGen = runner.execute(script);
    try {
      let step = await runGen.next();
      while (!step.done) {
        if (signal?.aborted) {
          await runGen.return(null);
          return { script, error: CANCELLED };
        }
        await forward(step.value);
        step = await runGen.next();
      }
      log.info("Orchestration script executed", { chars: script.length });
      return { script, executed: true, result: step.value ?? null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.warn("Orchestration script failed", { error: message });
      return { script, executed: true, error: message };
    }
  }
}
