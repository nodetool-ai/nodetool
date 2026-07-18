/**
 * Headless mirror of the web app runtime (`useAppRuntime` + `appRuntimeStore`):
 * a flat reactive value store, the same message-folding rules for a run's
 * processing stream, and an action dispatcher. The web engine's reactive
 * subgraph runs collapse to full workflow runs here — the headless kernel has
 * no browser worker — which is noted in the report rather than simulated.
 *
 * Pure except for the injected `runWorkflow`, so it is unit-testable.
 */
import type { AppEventSpec, AppIO } from "./types.js";

/** Action shape shared with the web runtime (`AppAction`). */
export type HeadlessAction =
  | { kind: "run"; from?: string }
  | { kind: "cancel" }
  | { kind: "setState"; key: string; value: unknown }
  | { kind: "toggleState"; key: string };

export const eventToAction = (event: AppEventSpec, from?: string): HeadlessAction => {
  switch (event.kind) {
    case "setState":
      return { kind: "setState", key: event.key ?? "", value: event.value ?? "" };
    case "toggleState":
      return { kind: "toggleState", key: event.key ?? "" };
    case "cancel":
      return { kind: "cancel" };
    case "run":
    default:
      return { kind: "run", from };
  }
};

export interface HeadlessRuntimeInit {
  io: AppIO;
  /**
   * Execute the workflow with the given params and return its processing
   * messages. Called once per dispatched `run` action.
   */
  runWorkflow: (
    params: Record<string, unknown>
  ) => Promise<ReadonlyArray<Record<string, unknown>>>;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export class HeadlessAppRuntime {
  readonly values: Record<string, unknown> = {};
  error: string | null = null;
  runCount = 0;

  private readonly io: AppIO;
  private readonly runWorkflow: HeadlessRuntimeInit["runWorkflow"];
  private readonly outputKeyByNodeId = new Map<string, string>();

  constructor(init: HeadlessRuntimeInit) {
    this.io = init.io;
    this.runWorkflow = init.runWorkflow;
    for (const input of init.io.inputs) {
      if (input.defaultValue !== undefined) {
        this.values[input.name] = input.defaultValue;
      }
    }
    for (const output of init.io.outputs) {
      this.outputKeyByNodeId.set(output.nodeId, output.name);
    }
  }

  setValue(key: string, value: unknown): void {
    this.values[key] = value;
  }

  toggleValue(key: string): void {
    this.values[key] = !this.values[key];
  }

  /** Params for a run: every bound input's current value (mirror of `run()`). */
  collectParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const input of this.io.inputs) {
      const value = this.values[input.name];
      if (value !== undefined) params[input.name] = value;
    }
    return params;
  }

  /**
   * Fold a run's processing messages into the value store, using the same
   * rules as the web handler: `output_update` replaces (or appends streamed
   * text), `chunk` appends text, node/job errors land in `error`.
   */
  applyMessages(messages: ReadonlyArray<Record<string, unknown>>): void {
    for (const msg of messages) {
      switch (msg.type) {
        case "output_update": {
          const nodeId = typeof msg.node_id === "string" ? msg.node_id : "";
          const key =
            this.outputKeyByNodeId.get(nodeId) ??
            (typeof msg.node_name === "string" ? msg.node_name : undefined) ??
            (typeof msg.output_name === "string" ? msg.output_name : undefined);
          if (!key) break;
          // Absent disposition appends (protocol default); only explicit "replace" replaces.
          if (msg.disposition !== "replace" && typeof msg.value === "string") {
            this.values[key] = asString(this.values[key]) + msg.value;
          } else {
            this.values[key] = msg.value;
          }
          break;
        }
        case "chunk": {
          if (msg.content_type && msg.content_type !== "text") break;
          const nodeId = typeof msg.node_id === "string" ? msg.node_id : "";
          const key = this.outputKeyByNodeId.get(nodeId);
          if (!key) break;
          this.values[key] = asString(this.values[key]) + asString(msg.content);
          break;
        }
        case "node_update": {
          if (typeof msg.error === "string" && msg.error) this.error = msg.error;
          break;
        }
        case "job_update": {
          if (msg.status === "failed" && typeof msg.error === "string" && msg.error) {
            this.error = msg.error;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** Dispatch one action; a `run` executes the workflow and folds its stream. */
  async dispatch(action: HeadlessAction): Promise<void> {
    switch (action.kind) {
      case "run": {
        for (const output of this.io.outputs) {
          delete this.values[output.name];
        }
        this.error = null;
        this.runCount += 1;
        const messages = await this.runWorkflow(this.collectParams());
        this.applyMessages(messages);
        break;
      }
      case "setState":
        this.setValue(action.key, action.value);
        break;
      case "toggleState":
        this.toggleValue(action.key);
        break;
      case "cancel":
        // Headless runs are awaited to completion; nothing in flight to cancel.
        break;
      default:
        break;
    }
  }
}
