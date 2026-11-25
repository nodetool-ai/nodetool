/**
 * A stand-in for the server behind `globalWebSocketManager`, for the node
 * editor demo on the marketing site.
 *
 * The editor's real Run path (`WorkflowRunner.run`) is unchanged: it builds a
 * `run_job` request and sends it through the global socket manager. Once this
 * transport is installed, `send` never opens a socket. A `run_job` is planned
 * by `planFakeRun` and its messages are delivered on a timer through
 * `deliverLocal`, the same seam in-browser runs use, so the canvas, results
 * and status stores update as they do for a server run. `cancel_job` stops
 * the timers and reports the job cancelled.
 */
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { isString } from "../../utils/typePredicates";
import { planFakeRun, type FakeRunRequest } from "./fakeRunPlan";

type Manager = Pick<
  typeof globalWebSocketManager,
  "send" | "ensureConnection" | "isConnectionOpen" | "deliverLocal"
>;

interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const browserTimers: Timers = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number)
};

function isRunRequest(value: unknown): value is FakeRunRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data = value as Record<string, unknown>;
  const graph = data.graph as Record<string, unknown> | undefined;
  return (
    isString(data.job_id) &&
    isString(data.workflow_id) &&
    typeof graph === "object" &&
    graph !== null &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges)
  );
}

/**
 * Replace the manager's network methods with the fake server. Returns a
 * function that stops pending runs and restores the originals.
 */
export function installFakeRunTransport(
  manager: Manager = globalWebSocketManager,
  timers: Timers = browserTimers
): () => void {
  const original = {
    send: manager.send,
    ensureConnection: manager.ensureConnection,
    isConnectionOpen: manager.isConnectionOpen
  };
  const pending = new Map<string, { workflowId: string; handles: unknown[] }>();

  const stopJob = (jobId: string): { workflowId: string } | undefined => {
    const job = pending.get(jobId);
    if (!job) {
      return undefined;
    }
    job.handles.forEach((handle) => timers.clearTimeout(handle));
    pending.delete(jobId);
    return job;
  };

  const startRun = (request: FakeRunRequest): void => {
    stopJob(request.job_id);
    const events = planFakeRun(request);
    const handles: unknown[] = [];
    pending.set(request.job_id, { workflowId: request.workflow_id, handles });
    const last = events[events.length - 1];
    for (const event of events) {
      handles.push(
        timers.setTimeout(() => {
          manager.deliverLocal(event.message as WebSocketMessage);
          if (event === last) {
            pending.delete(request.job_id);
          }
        }, event.t)
      );
    }
  };

  manager.ensureConnection = async () => undefined;
  manager.isConnectionOpen = () => true;
  manager.send = async (message: Record<string, unknown>) => {
    const command = message.command ?? message.type;
    const data = message.data as Record<string, unknown> | undefined;
    if (command === "run_job" && isRunRequest(data)) {
      startRun(data);
      return;
    }
    if (command === "cancel_job" && data && isString(data.job_id)) {
      const job = stopJob(data.job_id);
      if (job) {
        manager.deliverLocal({
          type: "job_update",
          status: "cancelled",
          job_id: data.job_id,
          workflow_id: job.workflowId
        });
      }
    }
  };

  return () => {
    [...pending.keys()].forEach(stopJob);
    manager.send = original.send;
    manager.ensureConnection = original.ensureConnection;
    manager.isConnectionOpen = original.isConnectionOpen;
  };
}
