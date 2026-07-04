/**
 * DemoEngine — deterministic, backend-free replay of a cast.
 *
 * The engine owns a real NodeStore (so the genuine BaseNode renders the graph)
 * and drives the production update reducer (`handleUpdate`) with the cast's
 * recorded protocol messages. State is a pure function of elapsed time:
 * `seekToTime(t)` makes the global execution stores reflect exactly the events
 * with `event.t <= t`. Seeking forward applies the new events incrementally;
 * seeking backward resets and replays from the start. That determinism is what
 * lets a frame renderer (Remotion) scrub the timeline and capture a video.
 *
 * The engine deliberately does NOT import any React node components, so it can
 * be unit-tested in isolation. Node-type → component wiring lives in the player.
 */
import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";

import useMetadataStore from "../stores/MetadataStore";
import type { NodeData } from "../stores/NodeData";
import useResultsStore from "../stores/ResultsStore";
import useStatusStore from "../stores/StatusStore";
import useWorkflowRunsStore from "../stores/WorkflowRunsStore";
import { useNotificationStore, type Notification } from "../stores/NotificationStore";
import useAuth from "../stores/useAuth";
import useSecretsStore from "../stores/SecretsStore";
import { createNodeStore, type NodeStore } from "../stores/NodeStore";
import {
  handleUpdate,
  flushPendingNodeStreams,
  type MsgpackData
} from "../stores/workflowUpdates";
import type { WorkflowRunner, WorkflowRunnerStore } from "../stores/WorkflowRunner";
import type {
  NodeMetadata,
  SecretResponse,
  WorkflowAttributes,
} from "../stores/ApiTypes";

import type { CastEvent, DemoCast } from "./castTypes";
import { resolveAssetUrls } from "./assetSubstitution";

/**
 * Minimal stand-in for the WorkflowRunner store. The reducer only reads/writes
 * a handful of runner fields (state, job_id, queuePosition, statusMessage) and
 * calls `addNotification`; this provides exactly those, forwarding toasts to
 * the real NotificationStore so the demo behaves like production. Cast to the
 * full `WorkflowRunnerStore` at the single call site below.
 */
interface DemoRunnerState {
  state: WorkflowRunner["state"];
  job_id: string | null;
  queuePosition: number | null;
  statusMessage: string | null;
  addNotification: (n: Omit<Notification, "id" | "timestamp">) => void;
  setStatusMessage: (m: string | null) => void;
}

const IDLE_RUNNER: Pick<
  DemoRunnerState,
  "state" | "job_id" | "queuePosition" | "statusMessage"
> = {
  state: "idle",
  job_id: null,
  queuePosition: null,
  statusMessage: null,
};

/** Merge a cast's recorded metadata into the shared MetadataStore (no clobber). */
export function seedCastMetadata(metadata: Record<string, NodeMetadata>): void {
  const store = useMetadataStore.getState();
  store.setMetadata({ ...store.metadata, ...metadata });
}

/**
 * Seed a placeholder logged-in user. Output/asset components (e.g. AssetViewer
 * via useAssets) throw when no user is present; the demo has no real auth.
 */
function seedDemoAuth(): void {
  if (useAuth.getState().user === null) {
    useAuth.setState({ user: { id: "demo" }, state: "logged_in" });
  }
}

/**
 * Provider keys the replayed nodes might require (utils/nodeProvider.ts maps
 * node namespaces to these). Seeded as present-and-configured so provider
 * nodes never flash their "API key is missing" banner mid-replay — with no
 * backend, the real secrets query settles empty at a nondeterministic frame.
 */
const DEMO_SECRET_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "FAL_API_KEY",
  "KIE_API_KEY",
  "REPLICATE_API_TOKEN",
  "ELEVENLABS_API_KEY",
  "HF_TOKEN",
] as const;

function seedDemoSecrets(): void {
  const seeded: SecretResponse[] = DEMO_SECRET_KEYS.map((key) => ({
    id: `demo-${key}`,
    user_id: "demo",
    key,
    description: null,
    created_at: null,
    updated_at: null,
    is_configured: true,
  }));
  useSecretsStore.setState({
    secrets: seeded,
    isLoading: false,
    // `useSecrets` goes through a react-query queryFn that calls this action;
    // resolve from the seeds so nothing hits the (absent) backend.
    fetchSecrets: async () => seeded,
  });
}

/** Count of events whose timestamp is `<= timeMs` (events are sorted by `t`). */
function countAppliedAt(events: CastEvent[], timeMs: number): number {
  // Linear scan is fine at demo scale (hundreds–low thousands of events) and
  // keeps forward seeks O(new events). Binary search would not change Big-O of
  // the apply loop that follows.
  let n = 0;
  while (n < events.length && events[n].t <= timeMs) n++;
  return n;
}

export interface DemoEngineOptions {
  /** Maps a pinned asset file name to the URL the host serves it from. */
  resolveAssetUrl: (file: string) => string;
}

export class DemoEngine {
  readonly nodeStore: NodeStore;
  readonly workflow: WorkflowAttributes;
  readonly durationMs: number;
  readonly fps: number;

  private readonly runnerStore: WorkflowRunnerStore;
  private readonly events: CastEvent[];
  /** Snapshot of the pristine graph, restored on backward seek. */
  private readonly pristineNodes: Node<NodeData>[];
  private readonly pristineEdges: Edge[];
  private appliedIndex = 0;

  constructor(cast: DemoCast, opts: DemoEngineOptions) {
    this.workflow = cast.workflow;
    this.durationMs = cast.durationMs;
    this.fps = cast.fps ?? 30;

    // Metadata must be seeded before the node store is built so its graph
    // sanitization sees the real node shapes.
    seedCastMetadata(cast.metadata);
    seedDemoAuth();
    seedDemoSecrets();
    this.nodeStore = createNodeStore(cast.workflow);
    this.pristineNodes = clone(this.nodeStore.getState().nodes);
    this.pristineEdges = clone(this.nodeStore.getState().edges);

    // Resolve pinned asset references to host URLs, then give every distinct
    // recorded job a fresh id. Fresh ids keep the reducer's module-level
    // per-job bookkeeping from colliding across engine instances in one realm.
    const resolved = resolveAssetUrls(cast.events, cast.assets, opts.resolveAssetUrl);
    this.events = remapJobIds(resolved);

    this.runnerStore = create<DemoRunnerState>(() => ({
      ...IDLE_RUNNER,
      addNotification: (n) => useNotificationStore.getState().addNotification(n),
      setStatusMessage: (m) => this.runnerStore.setState({ statusMessage: m }),
    })) as unknown as WorkflowRunnerStore;
  }

  /** Make the execution stores reflect exactly the events with `t <= timeMs`. */
  seekToTime(timeMs: number): void {
    const target = countAppliedAt(this.events, timeMs);
    if (target < this.appliedIndex) {
      this.reset();
    }
    for (let i = this.appliedIndex; i < target; i++) {
      this.applyEvent(this.events[i]);
    }
    this.appliedIndex = target;
    // handleUpdate coalesces stream chunks on a timer; a seek must leave the
    // stores fully settled (Remotion frames never yield to timers).
    flushPendingNodeStreams();
  }

  private applyEvent(event: CastEvent): void {
    handleUpdate(
      this.workflow,
      event.message as unknown as MsgpackData,
      this.runnerStore,
      () => this.nodeStore
    );
  }

  /** Wipe all replayed state back to the pristine, pre-run graph. */
  reset(): void {
    const wf = this.workflow.id;
    useResultsStore.getState().clearResults(wf);
    useResultsStore.getState().clearEdges(wf);
    useStatusStore.getState().clearStatuses(wf);
    useWorkflowRunsStore.getState().clearWorkflow(wf);
    this.runnerStore.setState({ ...IDLE_RUNNER });
    this.nodeStore.setState({
      nodes: clone(this.pristineNodes),
      edges: clone(this.pristineEdges),
    });
    this.appliedIndex = 0;
  }

  /** Drop all global state this engine wrote. Call when unmounting the player. */
  dispose(): void {
    this.reset();
  }
}

/** Replace each message's top-level `job_id` with a per-engine fresh uuid. */
function remapJobIds(events: CastEvent[]): CastEvent[] {
  const map = new Map<string, string>();
  return events.map((e) => {
    const job = e.message.job_id;
    if (typeof job !== "string") return e;
    let fresh = map.get(job);
    if (!fresh) {
      fresh = crypto.randomUUID();
      map.set(job, fresh);
    }
    return { t: e.t, message: { ...e.message, job_id: fresh } };
  });
}

/** Structured deep clone; falls back to JSON for environments without it. */
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
