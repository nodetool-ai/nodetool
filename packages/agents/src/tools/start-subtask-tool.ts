/**
 * `start_subtask` — the background half of delegation.
 *
 * Same child as {@link RunSubtaskTool} — full inherited toolset, depth gate,
 * tagged event forwarding — but `process()` returns a receipt immediately and
 * the child loop runs detached, pumped by a promise this class owns. The
 * per-turn {@link BackgroundSubtaskRegistry} (on
 * `SubAgentToolRuntime.background`) is the handoff: the pump settles the
 * record when the child ends, and `wait_subtasks` reads the same records.
 *
 * A host that builds no registry refuses with `background_unavailable`
 * instead of spawning a child nobody can collect.
 */

import { randomUUID } from "node:crypto";
import { budgetFromContext, type ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  enterSubAgentDepth,
  forwardSubAgentStream,
  runSubAgent,
  SubAgentTool,
  type SubAgentToolRun,
  type SubAgentToolRuntime
} from "../subagent.js";
import type { BackgroundSubtaskRegistry } from "../background-subtasks.js";
import {
  START_SUBTASK_DESCRIPTION,
  START_SUBTASK_SCHEMA
} from "../prompts/background-subtask-prompt.js";
import { Tool } from "./base-tool.js";
import { RunSubtaskTool } from "./run-subtask-tool.js";
import { WaitSubtasksTool } from "./wait-subtasks-tool.js";
import { TOOL_CALL_ID_FIELD } from "./subtask-fields.js";
import { isString } from "../utils/type-guards.js";

export interface StartSubtaskToolOptions extends SubAgentToolRuntime {
  /** Registry shared with this turn's `wait_subtasks` tool. */
  background?: BackgroundSubtaskRegistry;
  /** Max LLM iterations per child loop. Defaults to 20. */
  maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 20;

/**
 * Background children one turn may start. The registry is per turn and every
 * record on it is a detached child loop, so without a cap a model that keeps
 * calling `start_subtask` grows the registry — and the queue for the run's
 * permits — without bound.
 */
export const MAX_BACKGROUND_SUBTASKS_PER_TURN = 8;

export class StartSubtaskTool extends SubAgentTool {
  readonly name = "start_subtask";
  readonly description = START_SUBTASK_DESCRIPTION;
  readonly jsonSchema = START_SUBTASK_SCHEMA;

  private readonly registry?: BackgroundSubtaskRegistry;

  constructor(opts: StartSubtaskToolOptions) {
    super({ ...opts, maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS });
    this.registry = opts.background;
  }

  protected buildRun(
    params: Record<string, unknown>
  ): SubAgentToolRun | { error: string; message: string } {
    const description = isString(params.description)
      ? params.description.trim()
      : "";
    const prompt = isString(params.prompt) ? params.prompt.trim() : "";
    if (!prompt) {
      return {
        error: "missing_prompt",
        message: "`prompt` is required and must be a non-empty string."
      };
    }
    return {
      instructions: prompt,
      title: description || "subtask",
      errorCode: "subtask_failed",
      noResultCode: "subtask_no_result",
      noResultMessage: "Subtask ended without producing a final assistant message.",
      errorExtras: { description: description || null }
    };
  }

  protected buildChildToolset(parentTools: Tool[]): Tool[] {
    const names = new Set(parentTools.map((t) => t.name));
    const extras: Tool[] = [];
    if (!names.has("run_subtask")) {
      extras.push(new RunSubtaskTool(this.runtimeForChild()));
    }
    if (!names.has("start_subtask")) extras.push(this);
    if (!names.has("wait_subtasks")) {
      extras.push(new WaitSubtasksTool({ background: this.registry }));
    }
    return extras.length > 0 ? [...extras, ...parentTools] : parentTools;
  }

  private runtimeForChild(): import("../subagent.js").SubAgentToolRuntime {
    return {
      provider: this.provider,
      model: this.model,
      parentTools: this.parentToolsFn,
      forwardMessage: this.forward,
      maxDepth: this.maxDepth,
      maxIterations: this.maxIterations,
      budget: this.budget,
      background: this.registry
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const desc = isString(params.description) ? params.description.trim() : "";
    return desc
      ? `Starting background subtask: ${desc}`
      : "Starting background subtask";
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.registry) {
      return {
        error: "background_unavailable",
        message:
          "`start_subtask` needs a background registry, but this run carries " +
          "no `SubAgentToolRuntime.background`. Use `run_subtask`, which " +
          "blocks and returns the result directly."
      };
    }

    if (this.registry.size >= MAX_BACKGROUND_SUBTASKS_PER_TURN) {
      return {
        error: "background_limit_reached",
        limit: MAX_BACKGROUND_SUBTASKS_PER_TURN,
        message:
          `This turn has already started ${MAX_BACKGROUND_SUBTASKS_PER_TURN} ` +
          "background subtasks, the most it may. Call wait_subtasks to " +
          "collect them, or use `run_subtask`, which blocks and returns the " +
          "result directly."
      };
    }

    const gate = enterSubAgentDepth(context, this.maxDepth, this.depthNoun);
    if (!gate.ok) return gate.refusal;

    const run = this.buildRun(params);
    if ("error" in run) return run;

    const parentToolCallId = isString(params[TOOL_CALL_ID_FIELD])
      ? params[TOOL_CALL_ID_FIELD]
      : null;

    const id = randomUUID();
    this.registry.start(id, run.title, gate.depth);

    const gen = runSubAgent({
      context: gate.childCtx,
      provider: this.provider,
      model: this.model,
      tools: this.buildChildToolset(this.parentToolsFn()),
      instructions: run.instructions,
      title: run.title,
      outputSchema: run.outputSchema,
      systemPrompt: run.systemPrompt,
      maxIterations: run.maxIterations ?? this.maxIterations,
      // A detached child still spends the parent's allowance, and draws a
      // permit before it opens a conversation: the parent's own when free,
      // else one of the run's (`acquireRunSlot`). The parent keeps its turn,
      // so a child on the parent's permit can overlap the parent's next
      // turn — the cap above is what bounds that.
      turnBudget: this.budget ?? budgetFromContext(context),
      signal: context.signal
    });

    void this.pump(gen, id, parentToolCallId, gate.depth, context.signal);

    return {
      subtask_id: id,
      description: run.title,
      status: "running",
      message:
        "The subtask is running in the background. Call wait_subtasks to " +
        "collect its result — include this subtask_id to wait for it alone."
    };
  }

  /**
   * Drive the detached child to settlement. Never throws: every path lands
   * in a registry settle, so `wait_subtasks` always sees a terminal status.
   */
  private async pump(
    gen: AsyncGenerator<ProcessingMessage>,
    id: string,
    parentToolCallId: string | null,
    depth: number,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const { aborted, value } = await forwardSubAgentStream(gen, {
        forward: this.forward,
        parentToolCallId,
        depth,
        label: this.name,
        signal
      });
      if (aborted) {
        this.registry?.settle(id, { aborted: true });
      } else if (!value || !value.ok) {
        this.registry?.settle(id, {
          ok: false,
          error: value ? value.error : "Background subagent stream ended early."
        });
      } else if (value.result === null || value.result === undefined) {
        // Match run_subtask's settlement vocabulary: a child that ends with
        // no final message is a failure, not a null success.
        this.registry?.settle(id, {
          ok: false,
          error: "subtask_no_result"
        });
      } else {
        this.registry?.settle(id, value);
      }
    } catch (e) {
      this.registry?.settle(id, {
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
}
