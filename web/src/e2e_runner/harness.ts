/**
 * E2E runner orchestration.
 *
 * Loads the suite manifest + each workflow graph, then executes them one by one
 * against the backend over a single WebSocket connection, recording every
 * message (logs, node IO, edge counters, outputs, artifacts) into a RunRecord.
 *
 * The React layer (E2ERunnerApp) subscribes for live updates; the Playwright
 * driver controls execution and harvests results through `window.__E2E__`.
 */
import { HarnessWsClient } from "./wsClient";
import type {
  AdHocRunOptions,
  CapturedArtifact,
  E2EController,
  Manifest,
  RunRecord,
  RunSnapshot,
  RunStatus,
  WorkflowRef,
  WsEvent
} from "./types";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "error",
  "suspended"
]);
// Faked nodes complete near-instantly; a tight per-run cap keeps the whole
// 49-template suite within the Playwright test budget even when a template
// hangs (e.g. a required input with no default/param).
const RUN_TIMEOUT_MS = 25_000;

export interface HarnessState {
  manifest: WorkflowRef[];
  records: RunRecord[];
  state: "loading" | "idle" | "running" | "done";
  currentIndex: number;
  /** Per-node visual status for the currently rendered workflow, keyed by node id. */
  nodeStatus: Record<string, string>;
  /** A caller-supplied graph being run ad-hoc (debug harness), rendered instead of a manifest entry. */
  adHocGraph: { nodes: unknown[]; edges: unknown[] } | null;
  /** Bumped each ad-hoc run so the canvas re-renders even though currentIndex is unchanged. */
  adHocNonce: number;
  /** Monotonic stage counter for the in-flight ad-hoc run; bumped on status-bearing events. */
  stage: number;
}

type Listener = (state: HarnessState) => void;

function emptyRecord(ref: WorkflowRef): RunRecord {
  return {
    id: ref.id,
    name: ref.name,
    file: ref.file,
    source: ref.source,
    tags: ref.tags,
    status: "pending",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    params: ref.params,
    jobId: null,
    error: null,
    outputs: [],
    logs: [],
    artifacts: [],
    nodeIO: {},
    events: [],
    counts: { nodes: 0, outputs: 0, errors: 0, edgeUpdates: 0 },
    expectationFailures: []
  };
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Pull a displayable artifact out of an output value when it carries media. */
function extractArtifact(output: {
  output_name?: string;
  output_type?: string;
  value: unknown;
}): CapturedArtifact | null {
  const v = output.value;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const uri = typeof obj.uri === "string" ? obj.uri : undefined;
    const data = typeof obj.data === "string" ? obj.data : undefined;
    const type = typeof obj.type === "string" ? obj.type : output.output_type;
    const mimeType = typeof obj.mimeType === "string" ? obj.mimeType : undefined;
    if (uri || data) {
      // The value's own mimeType is authoritative; the type-based guess is a fallback.
      const contentType =
        mimeType ??
        (type === "image"
          ? "image/png"
          : type === "audio"
            ? "audio/mpeg"
            : type === "video"
              ? "video/mp4"
              : "application/octet-stream");
      const artifact: CapturedArtifact = {
        name: output.output_name ?? type ?? "artifact",
        contentType
      };
      if (uri) artifact.uri = uri;
      if (data) {
        artifact.dataUrl = data.startsWith("data:")
          ? data
          : `data:${contentType};base64,${data}`;
      }
      return artifact;
    }
  }
  return null;
}

/** Signals a terminal job_update; carries the final status + error. */
interface TerminalSignal {
  status: RunStatus;
  error?: string;
}

/**
 * Fold a single decoded WS event into a RunRecord, mutating `rec` and the live
 * `nodeStatus` map. Returns a terminal signal when the run has settled.
 *
 * Shared verbatim by the manifest-driven suite path (`handleEvent`) and the
 * ad-hoc debug path (`runGraph`) so both capture identical record shapes.
 */
function reduceRecordEvent(
  rec: RunRecord,
  msg: WsEvent,
  nodeStatus: Record<string, string>
): TerminalSignal | null {
  rec.events.push(msg);
  // The backend's invalid_command / invalid_message envelope carries no `type`
  // field, only { error, details?/message? }. Catch it before the type switch;
  // it's terminal and would otherwise fall through and hang to timeout.
  if (typeof msg.type !== "string") {
    const errCode = (msg as { error?: unknown }).error;
    if (typeof errCode === "string" && errCode) {
      const details = (msg as { details?: unknown; message?: unknown }).details;
      const message = (msg as { message?: unknown }).message;
      const text =
        typeof details === "string" && details
          ? `${errCode}: ${details}`
          : typeof message === "string" && message
            ? `${errCode}: ${message}`
            : errCode;
      if (!rec.error) rec.error = text;
      return { status: "error", error: text };
    }
  }
  switch (msg.type) {
    case "job_update": {
      if (typeof msg.job_id === "string" && msg.job_id) rec.jobId = msg.job_id;
      const status = String(msg.status ?? "");
      if (typeof msg.error === "string" && msg.error) rec.error = msg.error;
      if (TERMINAL_STATUSES.has(status)) {
        return {
          status: status as RunStatus,
          error: typeof msg.error === "string" ? msg.error : undefined
        };
      }
      break;
    }
    case "node_update": {
      const nodeId = String(msg.node_id ?? "");
      if (nodeId) {
        const status = String(msg.status ?? "");
        nodeStatus[nodeId] = status;
        const isError = status === "error" || status === "failed";
        const message =
          typeof msg.error === "string" && msg.error.length > 0 ? msg.error : null;
        rec.nodeIO[nodeId] = {
          node_type:
            typeof msg.node_type === "string" ? msg.node_type : rec.nodeIO[nodeId]?.node_type,
          status,
          result: (msg as { result?: unknown }).result ?? rec.nodeIO[nodeId]?.result,
          // Only treat a node as errored when its status says so — a
          // node_update can carry a stale/empty error field while completing.
          error: isError ? (message ?? status) : null
        };
      }
      break;
    }
    case "output_update": {
      const output = {
        node_id: typeof msg.node_id === "string" ? msg.node_id : undefined,
        node_name: typeof msg.node_name === "string" ? msg.node_name : undefined,
        output_name: typeof msg.output_name === "string" ? msg.output_name : undefined,
        output_type: typeof msg.output_type === "string" ? msg.output_type : undefined,
        value: (msg as { value?: unknown }).value
      };
      rec.outputs.push(output);
      const artifact = extractArtifact(output);
      if (artifact) rec.artifacts.push(artifact);
      break;
    }
    case "log_update": {
      rec.logs.push({
        ts: Date.now(),
        level: typeof msg.severity === "string" ? msg.severity : undefined,
        content: asString((msg as { content?: unknown }).content ?? msg),
        node_id: typeof msg.node_id === "string" ? msg.node_id : undefined
      });
      break;
    }
    case "error": {
      // A backend { type:"error", message } frame is terminal.
      const text = typeof msg.message === "string" && msg.message ? msg.message : "error";
      if (!rec.error) rec.error = text;
      return { status: "error", error: text };
    }
    default:
      break;
  }
  return null;
}

/** Recompute the rollup counts on a settled record. */
function finalizeCounts(rec: RunRecord): void {
  rec.counts = {
    nodes: Object.keys(rec.nodeIO).length,
    outputs: rec.outputs.length,
    errors: Object.values(rec.nodeIO).filter((n) => n.error).length,
    edgeUpdates: rec.events.filter((e) => e.type === "edge_update").length
  };
}

export class Harness {
  private listeners = new Set<Listener>();
  private state: HarnessState = {
    manifest: [],
    records: [],
    state: "loading",
    currentIndex: -1,
    nodeStatus: {},
    adHocGraph: null,
    adHocNonce: 0,
    stage: 0
  };
  private secretsAvailable: string[] = [];
  private graphCache = new Map<string, { nodes: unknown[]; edges: unknown[] }>();
  // Serializes runs: a second runNext/runGraph while one is in flight returns
  // the in-flight promise instead of racing the same pending record.
  private runInFlight: Promise<RunRecord | null> | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): HarnessState {
    return this.state;
  }

  private setState(patch: Partial<HarnessState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  async init(manifestUrl = "/e2e-suite/manifest.json"): Promise<void> {
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) {
        throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`);
      }
      const manifest = (await res.json()) as Manifest;
      this.secretsAvailable = manifest.secretsAvailable ?? [];
      this.setState({
        manifest: manifest.workflows,
        records: manifest.workflows.map(emptyRecord),
        state: "idle"
      });
    } catch (err) {
      // No manifest (e.g. the ad-hoc debug path) must not leave the harness
      // stuck "loading": settle to idle+empty so runGraph still works. The
      // caller still sees the rejection and surfaces the banner.
      this.setState({ manifest: [], records: [], state: "idle" });
      throw err;
    }
  }

  /** Load and cache a workflow graph by file path. */
  private async loadGraph(
    ref: WorkflowRef
  ): Promise<{ nodes: unknown[]; edges: unknown[] }> {
    const cached = this.graphCache.get(ref.file);
    if (cached) return cached;
    const res = await fetch(ref.file);
    if (!res.ok) throw new Error(`Failed to load graph ${ref.file}: ${res.status}`);
    const json = (await res.json()) as {
      graph?: { nodes?: unknown[]; edges?: unknown[] };
      nodes?: unknown[];
      edges?: unknown[];
    };
    const graph = {
      nodes: json.graph?.nodes ?? json.nodes ?? [],
      edges: json.graph?.edges ?? json.edges ?? []
    };
    this.graphCache.set(ref.file, graph);
    return graph;
  }

  /** The currently rendered workflow's graph, for the canvas. */
  async currentGraph(): Promise<{
    ref: WorkflowRef;
    graph: { nodes: unknown[]; edges: unknown[] };
  } | null> {
    if (this.state.adHocGraph) {
      const ref: WorkflowRef = {
        id: "adhoc",
        name: "ad-hoc graph",
        file: "",
        params: {},
        source: "custom"
      };
      return { ref, graph: this.state.adHocGraph };
    }
    const idx = this.state.currentIndex;
    if (idx < 0 || idx >= this.state.manifest.length) return null;
    const ref = this.state.manifest[idx];
    return { ref, graph: await this.loadGraph(ref) };
  }

  private missingSecrets(ref: WorkflowRef): string[] {
    return (ref.requiresSecrets ?? []).filter(
      (key) => !this.secretsAvailable.includes(key)
    );
  }

  // A single-step run leaves state at "running"; settle it back so manual mode
  // isn't stuck. "idle" while pending records remain, "done" once none do.
  private settleManualState(): void {
    const hasPending = this.state.records.some((r) => r.status === "pending");
    this.setState({ state: hasPending ? "idle" : "done" });
  }

  private updateRecord(index: number, mutate: (rec: RunRecord) => void): void {
    const records = this.state.records.slice();
    const rec = { ...records[index] };
    mutate(rec);
    records[index] = rec;
    this.setState({ records });
  }

  /** Run the next pending workflow. Resolves with its record once settled. */
  async runNext(): Promise<RunRecord | null> {
    if (this.runInFlight) return this.runInFlight;
    const nextIndex = this.state.records.findIndex(
      (r) => r.status === "pending"
    );
    if (nextIndex === -1) {
      this.setState({ state: "done" });
      return null;
    }
    const promise = this.runAt(nextIndex).finally(() => {
      this.runInFlight = null;
    });
    this.runInFlight = promise;
    return promise;
  }

  async runAll(): Promise<RunRecord[]> {
    let rec = await this.runNext();
    while (rec) {
      rec = await this.runNext();
    }
    return this.state.records;
  }

  private async runAt(index: number): Promise<RunRecord> {
    const ref = this.state.manifest[index];
    this.setState({ state: "running", currentIndex: index, nodeStatus: {} });

    const missing = this.missingSecrets(ref);
    if (missing.length > 0) {
      this.updateRecord(index, (rec) => {
        rec.status = "skipped";
        rec.skipReason = `Missing secrets: ${missing.join(", ")}`;
      });
      this.settleManualState();
      return this.state.records[index];
    }

    let graph: { nodes: unknown[]; edges: unknown[] };
    try {
      graph = await this.loadGraph(ref);
    } catch (err) {
      this.updateRecord(index, (rec) => {
        rec.status = "error";
        rec.error = err instanceof Error ? err.message : String(err);
      });
      this.settleManualState();
      return this.state.records[index];
    }

    const startedAt = Date.now();
    this.updateRecord(index, (rec) => {
      rec.status = "running";
      rec.startedAt = startedAt;
    });

    // Connect a fresh WebSocket per workflow: the backend runner closes the
    // connection when a job finishes, so reusing one socket across runs fails
    // every run after the first with "WebSocket is not open".
    const ws = new HarnessWsClient();
    try {
      await ws.connect();
    } catch (err) {
      const finishedAt = Date.now();
      this.updateRecord(index, (rec) => {
        rec.status = "error";
        rec.finishedAt = finishedAt;
        rec.durationMs = finishedAt - startedAt;
        rec.error = err instanceof Error ? err.message : String(err);
      });
      this.settleManualState();
      return this.state.records[index];
    }

    const runTimeoutMs = ref.timeoutMs ?? RUN_TIMEOUT_MS;

    await new Promise<void>((resolve) => {
      const nodeStatus: Record<string, string> = {};
      let settled = false;
      const timer = window.setTimeout(() => finish("timeout"), runTimeoutMs);

      const finish = (status: RunStatus, error?: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribe();
        unsubscribeClose();
        // A timed-out job keeps running server-side after we drop the socket;
        // best-effort ask the backend to stop it first.
        if (status === "timeout") {
          const jobId = this.state.records[index].jobId;
          if (jobId) {
            try {
              ws.send({ command: "stop", data: { job_id: jobId } });
            } catch {
              // best-effort; the socket may already be gone
            }
          }
        }
        ws.close();
        const finishedAt = Date.now();
        this.updateRecord(index, (rec) => {
          rec.status = status;
          rec.finishedAt = finishedAt;
          rec.durationMs = finishedAt - startedAt;
          if (error && !rec.error) rec.error = error;
          finalizeCounts(rec);
          this.applyExpectations(rec, ref);
        });
        resolve();
      };

      const unsubscribe = ws.onMessage((msg: WsEvent) => {
        this.handleEvent(index, msg, nodeStatus, finish);
      });
      const unsubscribeClose = ws.onClose(() =>
        finish("error", "WebSocket connection closed unexpectedly")
      );

      try {
        ws.send({ command: "run_job", data: { graph, params: ref.params } });
      } catch (err) {
        finish("error", err instanceof Error ? err.message : String(err));
      }
    });

    this.settleManualState();
    return this.state.records[index];
  }

  private handleEvent(
    index: number,
    msg: WsEvent,
    nodeStatus: Record<string, string>,
    finish: (status: RunStatus, error?: string) => void
  ): void {
    this.updateRecord(index, (rec) => {
      const terminal = reduceRecordEvent(rec, msg, nodeStatus);
      if (terminal) {
        // Defer finish() until after this record mutation is committed.
        queueMicrotask(() => finish(terminal.status, terminal.error));
      }
    });
    this.setState({ nodeStatus: { ...nodeStatus } });
  }

  private applyExpectations(rec: RunRecord, ref: WorkflowRef): void {
    const expect = ref.expect;
    if (!expect) return;
    const failures: string[] = [];
    if (expect.status && rec.status !== expect.status) {
      failures.push(`expected status ${expect.status}, got ${rec.status}`);
    }
    if (typeof expect.minOutputs === "number" && rec.outputs.length < expect.minOutputs) {
      failures.push(
        `expected at least ${expect.minOutputs} outputs, got ${rec.outputs.length}`
      );
    }
    if (expect.outputContains) {
      // Concatenate raw values (strings verbatim) so an expected substring with
      // quotes/backslashes/newlines isn't defeated by JSON escaping.
      const haystack = rec.outputs
        .map((o) => (typeof o.value === "string" ? o.value : asString(o.value)))
        .join("\n");
      if (!haystack.includes(expect.outputContains)) {
        failures.push(`outputs did not contain "${expect.outputContains}"`);
      }
    }
    rec.expectationFailures = failures;
  }

  /**
   * Run a caller-supplied graph that isn't part of the manifest. Renders it on
   * the canvas, executes it against the backend over a fresh WebSocket, and
   * resolves with a fully-populated RunRecord once the job settles. This is the
   * browser surface the `nodetool debug` harness drives.
   */
  async runGraph(
    graph: { nodes: unknown[]; edges: unknown[] },
    params: Record<string, unknown> = {},
    options: AdHocRunOptions = {}
  ): Promise<RunRecord> {
    // Refuse a concurrent run: hand back the in-flight promise instead.
    if (this.runInFlight) return this.runInFlight as Promise<RunRecord>;
    const promise = this.runGraphInternal(graph, params, options).finally(() => {
      this.runInFlight = null;
    });
    this.runInFlight = promise;
    return promise;
  }

  private async runGraphInternal(
    graph: { nodes: unknown[]; edges: unknown[] },
    params: Record<string, unknown>,
    options: AdHocRunOptions
  ): Promise<RunRecord> {
    const ref: WorkflowRef = {
      id: options.id ?? `adhoc-${Date.now()}`,
      name: options.name ?? "ad-hoc graph",
      file: "",
      params,
      source: "custom"
    };
    const rec = emptyRecord(ref);
    const startedAt = Date.now();
    rec.status = "running";
    rec.startedAt = startedAt;

    // Render the graph on the canvas and surface it in the sidebar/state.
    // stage 1 marks the initial render before any node has reported.
    this.setState({
      state: "running",
      adHocGraph: graph,
      adHocNonce: this.state.adHocNonce + 1,
      nodeStatus: {},
      records: [rec],
      currentIndex: 0,
      stage: 1
    });

    const ws = new HarnessWsClient();
    try {
      await ws.connect();
    } catch (err) {
      rec.status = "error";
      rec.finishedAt = Date.now();
      rec.durationMs = rec.finishedAt - startedAt;
      rec.error = err instanceof Error ? err.message : String(err);
      this.setState({ records: [rec], state: "done" });
      return rec;
    }

    const nodeStatus: Record<string, string> = {};
    const timeoutMs = options.timeoutMs ?? RUN_TIMEOUT_MS;

    await new Promise<void>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => finish("timeout"), timeoutMs);

      const finish = (status: RunStatus, error?: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribe();
        unsubscribeClose();
        // A timed-out job keeps running server-side after we drop the socket;
        // best-effort ask the backend to stop it first.
        if (status === "timeout" && rec.jobId) {
          try {
            ws.send({ command: "stop", data: { job_id: rec.jobId } });
          } catch {
            // best-effort; the socket may already be gone
          }
        }
        ws.close();
        rec.status = status;
        rec.finishedAt = Date.now();
        rec.durationMs = rec.finishedAt - startedAt;
        if (error && !rec.error) rec.error = error;
        finalizeCounts(rec);
        this.setState({ records: [rec], state: "done", stage: this.state.stage + 1 });
        resolve();
      };

      const unsubscribe = ws.onMessage((msg: WsEvent) => {
        const terminal = reduceRecordEvent(rec, msg, nodeStatus);
        // A node starting/finishing or a job status change is a new visual
        // stage worth a screenshot; chunks/edges/logs are not.
        const advances = msg.type === "node_update" || msg.type === "job_update";
        this.setState({
          records: [rec],
          nodeStatus: { ...nodeStatus },
          ...(advances ? { stage: this.state.stage + 1 } : {})
        });
        if (terminal) queueMicrotask(() => finish(terminal.status, terminal.error));
      });
      const unsubscribeClose = ws.onClose(() =>
        finish("error", "WebSocket connection closed unexpectedly")
      );

      try {
        ws.send({ command: "run_job", data: { graph, params } });
      } catch (err) {
        finish("error", err instanceof Error ? err.message : String(err));
      }
    });

    return rec;
  }

  /** Live view of the in-flight ad-hoc run, for staged screenshot capture. */
  snapshot(): RunSnapshot {
    const rec = this.state.records[0];
    return {
      settled: this.state.state === "done",
      stage: this.state.stage,
      status: rec?.status ?? this.state.state,
      nodeStatus: this.state.nodeStatus
    };
  }

  controller(): E2EController {
    return {
      ready: Promise.resolve(),
      manifest: () => this.state.manifest,
      results: () => this.state.records,
      state: () => this.state.state,
      runNext: () => this.runNext(),
      runAll: () => this.runAll(),
      currentIndex: () => this.state.currentIndex,
      runGraph: (graph, params, options) => this.runGraph(graph, params, options),
      snapshot: () => this.snapshot()
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}
