import { getWorkflowRunnerStore } from "../../../stores/WorkflowRunner";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import useResultsStore from "../../../stores/ResultsStore";
import useStatusStore from "../../../stores/StatusStore";
import useErrorStore, {
  nodeErrorToDisplayString
} from "../../../stores/ErrorStore";
import { isRecord, isString } from "../../../utils/typePredicates";

/** A node as the run report needs it. */
export interface RunReportNode {
  id: string;
  type?: string;
  title?: string;
  properties?: Record<string, unknown>;
}

export interface NodeRunState {
  status?: string;
  error?: string;
  output?: unknown;
}

export interface RunReport {
  job_id: string;
  status: "completed" | "error" | "cancelled" | "running";
  error?: string;
  outputs: Record<string, unknown>;
  node_errors: Array<{ node_id: string; title?: string; message: string }>;
}

const MAX_TEXT = 1000;
const MAX_ITEMS = 5;
const MEDIA_FIELDS = ["type", "uri", "asset_id", "mimeType", "content_type", "metadata"];

/**
 * Reduce a node value to something an agent can read: media refs lose their
 * inline bytes, long text is cut, long lists keep their head and a count.
 */
export const summarizeValue = (value: unknown, depth = 0): unknown => {
  if (isString(value)) {
    return value.length > MAX_TEXT
      ? `${value.slice(0, MAX_TEXT)}… (${value.length} chars)`
      : value;
  }
  if (value instanceof Uint8Array) {
    return `<${value.length} bytes>`;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ITEMS).map((item) => summarizeValue(item, depth + 1));
    return value.length > MAX_ITEMS ? { items: head, total: value.length } : head;
  }
  if (isRecord(value)) {
    if (isString(value.type) && ("uri" in value || "asset_id" in value || "data" in value)) {
      const ref: Record<string, unknown> = {};
      for (const field of MEDIA_FIELDS) {
        if (value[field] !== undefined && value[field] !== "") ref[field] = value[field];
      }
      return ref;
    }
    if (depth >= 3) return "{…}";
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = summarizeValue(item, depth + 1);
    }
    return out;
  }
  return value;
};

const statusText = (value: unknown): string | undefined => {
  if (isString(value)) return value;
  if (isRecord(value) && isString(value.status)) return value.status;
  return undefined;
};

/** One node's state in one run, read from the job-keyed stores. */
export const nodeRunState = (
  workflowId: string,
  jobId: string,
  nodeId: string
): NodeRunState => {
  const state: NodeRunState = {};
  const status = statusText(useStatusStore.getState().getStatus(workflowId, jobId, nodeId));
  if (status) state.status = status;
  const error = nodeErrorToDisplayString(useErrorStore.getState().getError(workflowId, jobId, nodeId));
  if (error) state.error = error;
  const output = useResultsStore.getState().getOutputResult(workflowId, jobId, nodeId);
  if (output !== undefined) state.output = summarizeValue(output);
  return state;
};

const outputName = (node: RunReportNode): string =>
  isString(node.properties?.name) && node.properties.name !== "" ? node.properties.name : node.id;

/** The report for a run, from its job-keyed state as it stands now. */
export const buildRunReport = (
  workflowId: string,
  jobId: string,
  nodes: readonly RunReportNode[]
): RunReport => {
  const run = useWorkflowRunsStore.getState().getRuns(workflowId).find((r) => r.jobId === jobId);
  const state = run?.state;
  const report: RunReport = {
    job_id: jobId,
    status:
      state === "completed" || state === "error" || state === "cancelled" ? state : "running",
    outputs: {},
    node_errors: []
  };
  if (run?.error) report.error = run.error;
  const results = useResultsStore.getState();
  const errors = useErrorStore.getState();
  for (const node of nodes) {
    if (node.type?.startsWith("nodetool.output.")) {
      const value = results.getOutputResult(workflowId, jobId, node.id);
      if (value !== undefined) report.outputs[outputName(node)] = summarizeValue(value);
    }
    const message = nodeErrorToDisplayString(errors.getError(workflowId, jobId, node.id));
    if (message) {
      report.node_errors.push(
        node.title ? { node_id: node.id, title: node.title, message } : { node_id: node.id, message }
      );
    }
  }
  return report;
};

const TERMINAL = new Set(["completed", "error", "cancelled"]);

/**
 * Wait until the run ends, then report it. A timeout returns the report with
 * status "running" and leaves the run going. An abort cancels the run.
 */
export const waitForRunReport = (
  workflowId: string,
  jobId: string,
  nodes: readonly RunReportNode[],
  timeoutMs: number,
  signal?: AbortSignal
): Promise<RunReport> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanups: Array<() => void> = [];
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      finish();
    };
    const check = (): void => {
      const run = useWorkflowRunsStore.getState().getRuns(workflowId).find((r) => r.jobId === jobId);
      if (!run || !TERMINAL.has(run.state)) return;
      // A failed job records its node errors in the frame after the state change.
      queueMicrotask(() => settle(() => resolve(buildRunReport(workflowId, jobId, nodes))));
    };
    const onAbort = (): void =>
      settle(() => {
        void getWorkflowRunnerStore(workflowId).getState().cancelJob(jobId);
        reject(new Error("The run was cancelled because the tool call was aborted."));
      });
    const timer = setTimeout(
      () => settle(() => resolve(buildRunReport(workflowId, jobId, nodes))),
      timeoutMs
    );
    cleanups.push(() => clearTimeout(timer));
    cleanups.push(useWorkflowRunsStore.subscribe(check));
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }
    check();
  });
