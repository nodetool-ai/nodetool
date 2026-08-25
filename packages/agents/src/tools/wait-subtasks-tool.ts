/**
 * `wait_subtasks` — collect the results of background sub-agents.
 *
 * The blocking counterpart to {@link StartSubtaskTool}. Reads the same
 * per-turn {@link BackgroundSubtaskRegistry} and resolves when every
 * requested record left "running", on timeout, or when the turn's abort
 * signal fires — a stop button must never leave the parent parked in a wait.
 * Timeout and abort return current statuses instead of throwing; a partial
 * answer beats no answer.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  MAX_WAIT_TIMEOUT_MS,
  type BackgroundSubtaskRegistry,
  type WaitedSubtask
} from "../background-subtasks.js";
import {
  WAIT_SUBTASKS_DESCRIPTION,
  WAIT_SUBTASKS_SCHEMA
} from "../prompts/background-subtask-prompt.js";
import { isString } from "../utils/type-guards.js";

const MIN_WAIT_TIMEOUT_MS = 1_000;

export interface WaitSubtasksToolOptions {
  /** The registry this turn's `start_subtask` calls write to. */
  background?: BackgroundSubtaskRegistry;
}

export class WaitSubtasksTool extends Tool {
  readonly name = "wait_subtasks";
  readonly description = WAIT_SUBTASKS_DESCRIPTION;
  readonly jsonSchema = WAIT_SUBTASKS_SCHEMA;

  private readonly registry?: BackgroundSubtaskRegistry;

  constructor(opts: WaitSubtasksToolOptions) {
    super();
    this.registry = opts.background;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.registry) {
      return {
        error: "background_unavailable",
        message:
          "`wait_subtasks` needs a background registry, but this run carries " +
          "no `SubAgentToolRuntime.background`. Nothing can be running in " +
          "the background here."
      };
    }
    if (this.registry.size === 0) {
      return {
        subtasks: [],
        message:
          "No background subtasks have been started in this turn. Start one " +
          "with start_subtask."
      };
    }

    const ids = stringArray(params.ids);
    const timeoutMs = clampTimeout(params.timeout_ms);
    const rows = await this.registry.wait({
      ids,
      timeoutMs,
      signal: context.signal
    });
    return {
      subtasks: rows,
      all_settled: rows.every((row) => row.status !== "running")
    };
  }
}

function stringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.filter(isString);
  return values.length > 0 ? values : undefined;
}

function clampTimeout(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  return Math.min(
    Math.max(Math.floor(raw), MIN_WAIT_TIMEOUT_MS),
    MAX_WAIT_TIMEOUT_MS
  );
}

export type { WaitedSubtask };
