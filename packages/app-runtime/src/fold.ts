import type { Mutable } from "./mutable.js";
/**
 * The streaming fold: one place that turns a run's processing messages into
 * state events.
 *
 * This used to exist three times — the web runtime, the CLI `app debug`
 * harness, and the eval suites each folded messages their own way, and they
 * drifted. Everything now goes through `messageToEvents`.
 *
 * Messages are matched to an invocation by `job_id`. A message whose job the
 * instance did not start is dropped: that is how a second tab, an overlapping
 * run, or a run started in the graph editor stops contaminating the app's
 * values.
 *
 * A node's value can land in two places at once: the output slot a display
 * widget reads, and — when the operation maps that output `to: "variable"` —
 * an app variable. Both get the same value, streamed chunks accumulating the
 * same way in each.
 */
import type { AppStateEvent, Disposition, InvocationState } from "./state.js";

export interface FoldContext {
  /**
   * Resolve a message's `job_id` to an invocation this instance owns, or null
   * to drop the message. Implementations may accept an absent `job_id` (an
   * older server that does not stamp it) when only one invocation is live.
   */
  resolveInvocation: (
    jobId: string | null | undefined
  ) => InvocationState | null;
  /** The output state key for a node within an operation, or null if unbound. */
  outputKey: (operationId: string, nodeId: string) => string | null;
  /**
   * The variable a node's output writes, or null when it writes none. Built
   * from `outputVariableTargets` of the running operation.
   */
  outputVariable?: (operationId: string, nodeId: string) => string | null;
}

const str = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

/** Display text for a node/job error, which the kernel sends in several shapes. */
export const errorText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const field of ["message", "error", "detail"]) {
      const candidate = record[field];
      if (typeof candidate === "string" && candidate.trim() !== "") {
        return candidate.trim();
      }
    }
  }
  return "";
};

/**
 * Fan one node value out to whatever it is wired to: the display slot, the
 * variable, or both. Neither wired means the message carries nothing this app
 * shows.
 */
const valueEvents = (
  ctx: FoldContext,
  invocation: InvocationState,
  nodeId: string,
  value: unknown,
  disposition: Disposition,
  done: boolean
): AppStateEvent[] => {
  const key = ctx.outputKey(invocation.operationId, nodeId);
  const variableId =
    ctx.outputVariable?.(invocation.operationId, nodeId) ?? null;
  const events: AppStateEvent[] = [];
  if (key) {
    events.push({
      type: "outputValue",
      key,
      invocationId: invocation.id,
      value,
      disposition,
      done
    });
  }
  if (variableId) {
    events.push({
      type: "setVariable",
      variableId,
      value,
      disposition,
      invocationId: invocation.id
    });
  }
  return events;
};

/** A short human-readable label for what a streaming run is doing right now. */
const activityLabel = (
  type: string,
  message: Record<string, unknown>
): string => {
  switch (type) {
    case "tool_call_update": {
      const note = str(message.message).trim();
      return note || str(message.name).trim();
    }
    case "planning_update": {
      const phase = str(message.phase).trim();
      const status = str(message.status).trim();
      return phase && status ? `${phase}: ${status}` : phase || status;
    }
    case "task_update": {
      const step = message.step as Record<string, unknown> | null | undefined;
      const task = message.task as Record<string, unknown> | null | undefined;
      const stepName = str(step?.name).trim();
      const taskTitle = str(task?.title).trim() || str(task?.name).trim();
      if (stepName && taskTitle) return `${taskTitle}: ${stepName}`;
      return stepName || taskTitle || str(message.event).replace(/_/g, " ");
    }
    default:
      return "";
  }
};

const TERMINAL_JOB_STATUS: Record<string, InvocationState["status"]> = {
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  timed_out: "failed",
  error: "failed"
};

/**
 * Fold one processing message into zero or more state events.
 *
 * `output_update` follows the protocol default: an absent `disposition`
 * appends (older servers omit it on streamed chunks); only an explicit
 * `"replace"` replaces.
 *
 * `tool_call_update`, `planning_update`, and `task_update` carry no value —
 * they become the invocation's activity label, which is all an app can show of
 * an agent's work in progress.
 */
export const messageToEvents = (
  message: Record<string, unknown>,
  ctx: FoldContext
): AppStateEvent[] => {
  const type = message.type;
  if (typeof type !== "string") return [];

  const invocation = ctx.resolveInvocation(
    typeof message.job_id === "string" ? message.job_id : null
  );
  if (!invocation) return [];

  switch (type) {
    case "output_update":
      return valueEvents(
        ctx,
        invocation,
        str(message.node_id),
        message.value,
        message.disposition === "replace" ? "replace" : "append",
        message.done === true
      );

    case "chunk": {
      // Only text chunks fold into a display value; audio/video chunks are
      // consumed by their own players.
      if (message.content_type && message.content_type !== "text") return [];
      return valueEvents(
        ctx,
        invocation,
        str(message.node_id),
        str(message.content),
        "append",
        message.done === true
      );
    }

    case "node_progress": {
      const { progress, total } = message;
      const hasRatio =
        typeof progress === "number" && typeof total === "number" && total > 0;
      return [
        {
          type: "invocationProgress",
          invocationId: invocation.id,
          progress: hasRatio ? progress / total : undefined
        }
      ];
    }

    case "node_update": {
      const error = errorText(message.error);
      if (!error) return [];
      return [{ type: "invocationError", invocationId: invocation.id, error }];
    }

    case "error": {
      const error = errorText(message.message) || errorText(message.error);
      if (!error) return [];
      return [{ type: "invocationError", invocationId: invocation.id, error }];
    }

    case "tool_call_update":
    case "planning_update":
    case "task_update": {
      const label = activityLabel(type, message);
      if (!label) return [];
      return [
        { type: "invocationActivity", invocationId: invocation.id, label }
      ];
    }

    case "job_update": {
      const status = str(message.status);
      const mapped = TERMINAL_JOB_STATUS[status];
      if (!mapped) {
        return status === "running"
          ? [
              {
                type: "invocationStatus",
                invocationId: invocation.id,
                status: "running"
              }
            ]
          : [];
      }
      const error = errorText(message.error);
      type StatusEffectFields = Mutable<
        Extract<AppStateEvent, { type: "invocationStatus" }>
      >;
      const statusEffect: StatusEffectFields = {
        type: "invocationStatus",
        invocationId: invocation.id,
        status: mapped
      };
      if (error) {
        statusEffect.error = error;
      }
      return [statusEffect];
    }

    default:
      return [];
  }
};

export const messagesToEvents = (
  messages: ReadonlyArray<Record<string, unknown>>,
  ctx: FoldContext
): AppStateEvent[] =>
  messages.flatMap((message) => messageToEvents(message, ctx));
