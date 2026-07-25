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
 */
import type { AppStateEvent, InvocationState } from "./state.js";

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
    case "output_update": {
      const nodeId = str(message.node_id);
      const key = ctx.outputKey(invocation.operationId, nodeId);
      if (!key) return [];
      return [
        {
          type: "outputValue",
          key,
          invocationId: invocation.id,
          value: message.value,
          disposition: message.disposition === "replace" ? "replace" : "append",
          done: message.done === true
        }
      ];
    }

    case "chunk": {
      // Only text chunks fold into a display value; audio/video chunks are
      // consumed by their own players.
      if (message.content_type && message.content_type !== "text") return [];
      const nodeId = str(message.node_id);
      const key = ctx.outputKey(invocation.operationId, nodeId);
      if (!key) return [];
      return [
        {
          type: "outputValue",
          key,
          invocationId: invocation.id,
          value: str(message.content),
          disposition: "append",
          done: message.done === true
        }
      ];
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
      return [
        { type: "invocationError", invocationId: invocation.id, error }
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
      return [
        {
          type: "invocationStatus",
          invocationId: invocation.id,
          status: mapped,
          ...(error ? { error } : {})
        }
      ];
    }

    default:
      return [];
  }
};

export const messagesToEvents = (
  messages: ReadonlyArray<Record<string, unknown>>,
  ctx: FoldContext
): AppStateEvent[] => messages.flatMap((message) => messageToEvents(message, ctx));
