/**
 * Folds a workflow run's processing-message stream into an `ExecutionSummary`.
 *
 * Pure and surface-agnostic: the same reducer distills the server runner's
 * `RunResult.messages` and the browser harness's raw event log, so both surfaces
 * report identically. Only `import type` is used here so the module stays free of
 * runtime workspace dependencies (testable under the CLI vitest stub setup).
 */
import type { Intervention, ProcessingMessage } from "@nodetool-ai/protocol";
import type {
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput
} from "./types.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The deciders a `supervisor_decision` may name. Written as a total record so
 * a new value in the protocol enum fails this file rather than slipping
 * through as an unrecognized string.
 */
const DECIDED_BY = {
  agent: true,
  sticky: true,
  bounds: true,
  default: true,
  kernel: true
} satisfies Record<Intervention["decidedBy"], true>;

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
/** A value reduced to what a JSON debug report can carry. */
export type PreviewValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PreviewValue[]
  | { [key: string]: PreviewValue };

export function previewValue(
  value: unknown,
  maxLen: number = MAX_STRING_PREVIEW
): PreviewValue {
  if (typeof value === "string") {
    return value.length > maxLen
      ? `${value.slice(0, maxLen)}…[${value.length} chars]`
      : value;
  }
  if (value instanceof Uint8Array) {
    return `<binary ${value.byteLength} bytes>`;
  }
  if (Array.isArray(value)) {
    const head = value
      .slice(0, MAX_ARRAY_PREVIEW)
      .map((v) => previewValue(v, maxLen));
    return value.length > MAX_ARRAY_PREVIEW
      ? [...head, `…[${value.length - MAX_ARRAY_PREVIEW} more]`]
      : head;
  }
  if (value && typeof value === "object") {
    const out: { [key: string]: PreviewValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BLOB_KEYS.has(k) && typeof v === "string" && v.length > 256) {
        out[k] = `${v.slice(0, BLOB_KEEP)}…[${v.length} chars]`;
      } else {
        out[k] = previewValue(v, maxLen);
      }
    }
    return out;
  }
  // SAFETY: strings, binary, arrays and objects are handled above; what is
  // left is a JSON scalar the report can carry as it stands.
  return value as PreviewValue;
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
  const interventions: Intervention[] = [];
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
        const cost = msg.provider_cost as
          | Record<string, unknown>
          | null
          | undefined;
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
          n.outputs.push({
            outputName: name,
            outputType: typeof v,
            value: previewValue(v)
          });
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
        node(id).progress = {
          progress: num(msg.progress) ?? 0,
          total: num(msg.total) ?? 0
        };
        break;
      }
      case "edge_update": {
        const id = str(msg.edge_id);
        if (!id) break;
        edges.set(id, {
          edgeId: id,
          status: str(msg.status) ?? "",
          counter: num(msg.counter)
        });
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
      case "supervisor_decision": {
        const intervention = readIntervention(msg);
        if (intervention) interventions.push(intervention);
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
    interventions,
    counts: {
      nodes: nodeList.length,
      completed: nodeList.filter((n) => n.status === "completed").length,
      errored: errored.length,
      logs: logs.length,
      outputs: outputs.length,
      llmCalls: llmCalls.length,
      interventions: interventions.length
    },
    errors
  };
}

/**
 * Read a `supervisor_decision` message as an `Intervention`.
 *
 * Structural rather than schema-validated: this module stays free of runtime
 * imports (the browser harness feeds it decoded JSON bags), so it checks the
 * fields the record is keyed on and drops anything else. A message the kernel
 * emitted always passes.
 */
function readIntervention(msg: Record<string, unknown>): Intervention | null {
  const escalation = msg.escalation;
  const verdict = msg.verdict;
  if (!escalation || typeof escalation !== "object") return null;
  if (!verdict || typeof verdict !== "object") return null;
  if (typeof (verdict as { action?: unknown }).action !== "string") return null;
  const decidedBy = msg.decided_by;
  // `decided_by` is required by the message schema, and only `"agent"` means a
  // model was involved. Guessing it would misreport who decided — and inflate
  // the agent-decision count the cost rollup reads — so an unrecognized value
  // drops the record rather than defaulting.
  if (typeof decidedBy !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(DECIDED_BY, decidedBy)) return null;
  const cost = msg.cost;
  type InterventionFields = Mutable<Intervention>;
  const intervention: InterventionFields = {
    escalation: escalation as Intervention["escalation"],
    verdict: verdict as Intervention["verdict"],
    decidedBy: decidedBy as Intervention["decidedBy"]
  };
  if (typeof cost === "number") {
    intervention.costUsd = cost;
  }
  return intervention;
}
