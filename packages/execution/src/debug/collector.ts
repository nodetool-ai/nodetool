/**
 * Folds a workflow run's processing-message stream into an `ExecutionSummary`.
 *
 * Pure and surface-agnostic: the same reducer distills the server runner's
 * `RunResult.messages` and the browser harness's raw event log, so both surfaces
 * report identically. Only `import type` is used here so the module stays free of
 * runtime workspace dependencies (testable under the CLI vitest stub setup).
 */
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type {
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput
} from "./types.js";

const MAX_STRING_PREVIEW = 2000;
const MAX_ARRAY_PREVIEW = 50;
/** Fields that commonly carry base64 / data-URI payloads worth collapsing. */
const BLOB_KEYS = new Set(["data", "uri", "b64_json", "base64"]);
const BLOB_KEEP = 64;

/**
 * Make a value safe to embed in a JSON debug report: truncate long strings,
 * collapse binary and base64 blobs, and cap array/object fan-out. Keeps enough
 * to debug (shape, prefixes, sizes) without dumping megabytes of media bytes.
 */
export function previewValue(value: unknown, maxLen: number = MAX_STRING_PREVIEW): unknown {
  if (typeof value === "string") {
    return value.length > maxLen
      ? `${value.slice(0, maxLen)}…[${value.length} chars]`
      : value;
  }
  if (value instanceof Uint8Array) {
    return `<binary ${value.byteLength} bytes>`;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY_PREVIEW).map((v) => previewValue(v, maxLen));
    return value.length > MAX_ARRAY_PREVIEW
      ? [...head, `…[${value.length - MAX_ARRAY_PREVIEW} more]`]
      : head;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BLOB_KEYS.has(k) && typeof v === "string" && v.length > 256) {
        out[k] = `${v.slice(0, BLOB_KEEP)}…[${v.length} chars]`;
      } else {
        out[k] = previewValue(v, maxLen);
      }
    }
    return out;
  }
  return value;
}

function emptyNode(nodeId: string): NodeDebug {
  return {
    nodeId,
    nodeType: null,
    nodeName: null,
    status: "pending",
    error: null,
    outputs: [],
    cost: null
  };
}

/**
 * Reduce a processing-message stream into a structured execution summary.
 *
 * Accepts loosely-typed messages (the browser harness decodes JSON into bags of
 * unknown fields) and reads only the fields each `type` is known to carry.
 */
export function collectExecutionSummary(
  messages: ReadonlyArray<ProcessingMessage | Record<string, unknown>>
): ExecutionSummary {
  const nodes = new Map<string, NodeDebug>();
  const logs: LogEntry[] = [];
  const edges = new Map<string, EdgeDebug>();
  const llmCalls: LlmCallDebug[] = [];
  const outputs: NodeOutput[] = [];
  let status = "unknown";
  let error: string | null = null;

  const node = (id: string): NodeDebug => {
    let n = nodes.get(id);
    if (!n) {
      n = emptyNode(id);
      nodes.set(id, n);
    }
    return n;
  };

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    switch (msg.type) {
      case "job_update": {
        status = str(msg.status) ?? status;
        const e = str(msg.error);
        if (e) error = e;
        break;
      }
      case "node_update": {
        const id = str(msg.node_id);
        if (!id) break;
        const n = node(id);
        n.nodeType = str(msg.node_type) ?? n.nodeType;
        n.nodeName = str(msg.node_name) ?? n.nodeName;
        const s = str(msg.status);
        if (s) n.status = s;
        // A node_update can carry a stale/empty error field while completing —
        // only record an error when the status itself says so.
        if (s === "error" || s === "failed") {
          n.error = str(msg.error) || s;
        }
        const cost = msg.provider_cost as Record<string, unknown> | null | undefined;
        if (cost && typeof cost === "object") {
          n.cost = {
            provider: str(cost.provider) ?? "",
            amount: num(cost.amount) ?? 0,
            unit: str(cost.unit) ?? "",
            currency: str(cost.currency)
          };
        }
        break;
      }
      case "generation_complete": {
        const id = str(msg.node_id);
        if (!id) break;
        const n = node(id);
        n.nodeType = str(msg.node_type) ?? n.nodeType;
        n.nodeName = str(msg.node_name) ?? n.nodeName;
        const out = (msg.outputs as Record<string, unknown>) ?? {};
        for (const [name, v] of Object.entries(out)) {
          n.outputs.push({ outputName: name, outputType: typeof v, value: previewValue(v) });
        }
        break;
      }
      case "output_update": {
        const id = str(msg.node_id) ?? undefined;
        const o: NodeOutput = {
          nodeId: id,
          outputName: str(msg.output_name) ?? "output",
          outputType: str(msg.output_type) ?? typeof msg.value,
          value: previewValue(msg.value)
        };
        outputs.push(o);
        if (id) {
          const n = node(id);
          n.nodeName = str(msg.node_name) ?? n.nodeName;
        }
        break;
      }
      case "node_progress": {
        const id = str(msg.node_id);
        if (!id) break;
        node(id).progress = { progress: num(msg.progress) ?? 0, total: num(msg.total) ?? 0 };
        break;
      }
      case "edge_update": {
        const id = str(msg.edge_id);
        if (!id) break;
        edges.set(id, { edgeId: id, status: str(msg.status) ?? "", counter: num(msg.counter) });
        break;
      }
      case "log_update": {
        logs.push({
          nodeId: str(msg.node_id),
          nodeName: str(msg.node_name),
          severity: str(msg.severity) ?? "info",
          content: str(msg.content) ?? ""
        });
        break;
      }
      case "terminal_update": {
        const content = str(msg.content);
        if (content) {
          logs.push({ nodeId: str(msg.node_id), severity: "info", content });
        }
        break;
      }
      case "error": {
        const message = str(msg.message) ?? "unknown error";
        if (!error) error = message;
        logs.push({ nodeId: null, severity: "error", content: message });
        break;
      }
      case "llm_call": {
        llmCalls.push({
          nodeId: str(msg.node_id) ?? "",
          provider: str(msg.provider) ?? "",
          model: str(msg.model) ?? "",
          tokensInput: num(msg.tokens_input),
          tokensOutput: num(msg.tokens_output),
          cost: num(msg.cost),
          durationMs: num(msg.duration_ms) ?? 0,
          error: str(msg.error)
        });
        break;
      }
      default:
        break;
    }
  }

  const nodeList = [...nodes.values()];
  const errored = nodeList.filter((n) => n.error);
  const errors: ExecutionSummary["errors"] = errored.map((n) => ({
    nodeId: n.nodeId,
    nodeType: n.nodeType,
    message: n.error as string
  }));
  if (error && !errors.some((e) => e.message === error)) {
    errors.unshift({ nodeId: null, nodeType: null, message: error });
  }

  return {
    status,
    error,
    nodes: nodeList,
    logs,
    edges: [...edges.values()],
    llmCalls,
    outputs,
    counts: {
      nodes: nodeList.length,
      completed: nodeList.filter((n) => n.status === "completed").length,
      errored: errored.length,
      logs: logs.length,
      outputs: outputs.length,
      llmCalls: llmCalls.length
    },
    errors
  };
}
