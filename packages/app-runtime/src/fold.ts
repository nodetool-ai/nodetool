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
import type {
  ActivityEntry,
  AppStateEvent,
  Disposition,
  InvocationState
} from "./state.js";
import { isNumber, isObjectLike, isRecord, isString } from "./predicates.js";

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
  isString(value) ? value : value == null ? "" : String(value);

/** Display text for a node/job error, which the kernel sends in several shapes. */
export const errorText = (value: unknown): string => {
  if (value == null) return "";
  if (isString(value)) return value.trim();
  if (value instanceof Error) return value.message;
  if (isObjectLike(value)) {
    const record = value as Record<string, unknown>;
    for (const field of ["message", "error", "detail"]) {
      const candidate = record[field];
      if (isString(candidate) && candidate.trim() !== "") {
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

/** Which loop a message came from: a relayed script message's `source`, else its node. */
const sourceOf = (message: Record<string, unknown>): string | undefined => {
  const source = str(message.source).trim() || str(message.node_id).trim();
  return source || undefined;
};

/** The most characters of a tool result one transcript entry keeps. */
const RESULT_CHARS = 400;

const resultText = (value: unknown): string => {
  const summary = isRecord(value) && isString(value.summary) ? value.summary : null;
  const text = summary ?? (isString(value) ? value : JSON.stringify(value) ?? "");
  return text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}…` : text;
};

/** A tool call message as a transcript entry, or null when it names no tool. */
const toolEntry = (
  message: Record<string, unknown>,
  status: "running" | "done" | "error"
): ActivityEntry | null => {
  const name = str(message.name).trim();
  const id = str(message.tool_call_id).trim();
  if (!id && !name) return null;
  const source = sourceOf(message);
  const entry: ActivityEntry = {
    kind: "tool",
    id: id || `${source ?? ""}:${name}`,
    name,
    label: str(message.message).trim() || name,
    status,
    ...(source && { source })
  };
  if (status === "running" && isRecord(message.args)) {
    entry.args = message.args;
  }
  if (status !== "running") {
    entry.result = resultText(message.result);
  }
  return entry;
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
 * they become the invocation's activity label. Agent text (`chunk`) and tool
 * calls with their results (`tool_call_update`, `tool_result_update`) also
 * enter the invocation's transcript, which shows the whole of an agent's work.
 */
export const messageToEvents = (
  message: Record<string, unknown>,
  ctx: FoldContext
): AppStateEvent[] => {
  const type = message.type;
  if (!isString(type)) return [];

  const invocation = ctx.resolveInvocation(
    isString(message.job_id) ? message.job_id : null
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
      const text = str(message.content);
      const events = valueEvents(
        ctx,
        invocation,
        str(message.node_id),
        text,
        "append",
        message.done === true
      );
      if (text && message.thinking !== true) {
        const source = sourceOf(message);
        events.push({
          type: "invocationTranscript",
          invocationId: invocation.id,
          entry: { kind: "text", text, ...(source && { source }) }
        });
      }
      return events;
    }

    case "node_progress": {
      const { progress, total } = message;
      const hasRatio = isNumber(progress) && isNumber(total) && total > 0;
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
      const events: AppStateEvent[] = label
        ? [{ type: "invocationActivity", invocationId: invocation.id, label }]
        : [];
      const entry =
        type === "tool_call_update" ? toolEntry(message, "running") : null;
      if (entry) {
        events.push({
          type: "invocationTranscript",
          invocationId: invocation.id,
          entry
        });
      }
      return events;
    }

    case "tool_result_update": {
      const entry = toolEntry(
        message,
        message.is_error === true ? "error" : "done"
      );
      return entry
        ? [{ type: "invocationTranscript", invocationId: invocation.id, entry }]
        : [];
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
