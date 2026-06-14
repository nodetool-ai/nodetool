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
  CapturedArtifact,
  E2EController,
  Manifest,
  RunRecord,
  RunStatus,
  WorkflowRef,
  WsEvent
} from "./types";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "error"]);
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
    if (uri || data) {
      const contentType =
        type === "image"
          ? "image/png"
          : type === "audio"
            ? "audio/mpeg"
            : type === "video"
              ? "video/mp4"
              : "application/octet-stream";
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

export class Harness {
  private listeners = new Set<Listener>();
  private state: HarnessState = {
    manifest: [],
    records: [],
    state: "loading",
    currentIndex: -1,
    nodeStatus: {}
  };
  private secretsAvailable: string[] = [];
  private graphCache = new Map<string, { nodes: unknown[]; edges: unknown[] }>();

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

  private updateRecord(index: number, mutate: (rec: RunRecord) => void): void {
    const records = this.state.records.slice();
    const rec = { ...records[index] };
    mutate(rec);
    records[index] = rec;
    this.setState({ records });
  }

  /** Run the next pending workflow. Resolves with its record once settled. */
  async runNext(): Promise<RunRecord | null> {
    const nextIndex = this.state.records.findIndex(
      (r) => r.status === "pending"
    );
    if (nextIndex === -1) {
      this.setState({ state: "done" });
      return null;
    }
    return this.runAt(nextIndex);
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
      return this.state.records[index];
    }

    await new Promise<void>((resolve) => {
      const nodeStatus: Record<string, string> = {};
      let settled = false;
      const timer = window.setTimeout(() => finish("timeout"), RUN_TIMEOUT_MS);

      const finish = (status: RunStatus, error?: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribe();
        ws.close();
        const finishedAt = Date.now();
        this.updateRecord(index, (rec) => {
          rec.status = status;
          rec.finishedAt = finishedAt;
          rec.durationMs = finishedAt - startedAt;
          if (error && !rec.error) rec.error = error;
          rec.counts = {
            nodes: Object.keys(rec.nodeIO).length,
            outputs: rec.outputs.length,
            errors: Object.values(rec.nodeIO).filter((n) => n.error).length,
            edgeUpdates: rec.events.filter((e) => e.type === "edge_update").length
          };
          this.applyExpectations(rec, ref);
        });
        resolve();
      };

      const unsubscribe = ws.onMessage((msg: WsEvent) => {
        this.handleEvent(index, msg, nodeStatus, finish);
      });

      try {
        ws.send({ command: "run_job", data: { graph, params: ref.params } });
      } catch (err) {
        finish("error", err instanceof Error ? err.message : String(err));
      }
    });

    return this.state.records[index];
  }

  private handleEvent(
    index: number,
    msg: WsEvent,
    nodeStatus: Record<string, string>,
    finish: (status: RunStatus, error?: string) => void
  ): void {
    this.updateRecord(index, (rec) => {
      rec.events.push(msg);
      switch (msg.type) {
        case "job_update": {
          if (typeof msg.job_id === "string" && msg.job_id) rec.jobId = msg.job_id;
          const status = String(msg.status ?? "");
          if (typeof msg.error === "string" && msg.error) rec.error = msg.error;
          if (TERMINAL_STATUSES.has(status)) {
            // Defer finish() until after this record mutation is committed.
            queueMicrotask(() =>
              finish(status as RunStatus, typeof msg.error === "string" ? msg.error : undefined)
            );
          }
          break;
        }
        case "node_update": {
          const nodeId = String(msg.node_id ?? "");
          if (nodeId) {
            const status = String(msg.status ?? "");
            nodeStatus[nodeId] = status;
            rec.nodeIO[nodeId] = {
              node_type: typeof msg.node_type === "string" ? msg.node_type : undefined,
              status,
              result: (msg as { result?: unknown }).result ?? rec.nodeIO[nodeId]?.result,
              error: typeof msg.error === "string" ? msg.error : null
            };
          }
          break;
        }
        case "output_update": {
          const output = {
            node_id: typeof msg.node_id === "string" ? msg.node_id : undefined,
            node_name: typeof msg.node_name === "string" ? msg.node_name : undefined,
            output_name:
              typeof msg.output_name === "string" ? msg.output_name : undefined,
            output_type:
              typeof msg.output_type === "string" ? msg.output_type : undefined,
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
        default:
          break;
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
      const haystack = asString(rec.outputs.map((o) => o.value));
      if (!haystack.includes(expect.outputContains)) {
        failures.push(`outputs did not contain "${expect.outputContains}"`);
      }
    }
    rec.expectationFailures = failures;
  }

  controller(): E2EController {
    return {
      ready: Promise.resolve(),
      manifest: () => this.state.manifest,
      results: () => this.state.records,
      state: () => this.state.state,
      runNext: () => this.runNext(),
      runAll: () => this.runAll(),
      currentIndex: () => this.state.currentIndex
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}
