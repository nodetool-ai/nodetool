/**
 * Direct-construction harness for {@link ChatTurnHandler}: a
 * {@link FakeClientSession} instead of a socket, real {@link ToolBridge}
 * instances (they hold no socket either), and a recording {@link ChatJobAccess}
 * so a suite can assert the register/drop/release accounting a workflow-bound
 * chat run performs.
 */
import type { HydratedGraphData } from "@nodetool-ai/protocol";
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  ChatTurnHandler,
  type ChatJobAccess,
  type ChatTurnDeps
} from "../src/session/chat-turn.js";
import type { ActiveJob } from "../src/session/job-execution.js";
import { ToolBridge } from "../src/websocket-client-session.js";
import {
  FakeClientSession,
  type FakeClientSessionOptions
} from "./fake-client-session.js";

/** One job-accounting call, in the order the handler made it. */
export interface JobAccessCall {
  op: "register" | "drop" | "release";
  jobId: string;
}

export class RecordingJobs implements ChatJobAccess {
  readonly calls: JobAccessCall[] = [];
  readonly active = new Map<string, ActiveJob>();
  readonly costEvents: Array<Record<string, unknown>> = [];

  registerJob(jobId: string, job: ActiveJob): void {
    this.calls.push({ op: "register", jobId });
    this.active.set(jobId, job);
  }

  dropJob(jobId: string): void {
    this.calls.push({ op: "drop", jobId });
    this.active.delete(jobId);
  }

  releaseJob(jobId: string): void {
    this.calls.push({ op: "release", jobId });
    this.active.delete(jobId);
  }

  handleNodeProviderCost(
    _active: ActiveJob,
    outbound: Record<string, unknown>
  ): void {
    this.costEvents.push(outbound);
  }

  runMeasuredCost(): number | null {
    return null;
  }

  ops(): string[] {
    return this.calls.map((c) => c.op);
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The minimal hydration the tests need: `data` moved to `properties`, the
 * behavior flags explicitly off. Matches what `JobExecutionManager.hydrateGraph`
 * produces for a plain saved graph with no registry resolver.
 */
export async function minimalHydrateGraph(graph: {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}): Promise<HydratedGraphData> {
  return {
    nodes: graph.nodes.map((n) => ({
      id: String(n.id ?? ""),
      type: String(n.type ?? ""),
      properties: isRecordValue(n.data)
        ? n.data
        : isRecordValue(n.properties)
          ? n.properties
          : {},
      dynamic_properties: {},
      is_streaming_input: false,
      is_streaming_output: false,
      is_controlled: false,
      is_join_node: false,
      retry_safe: false
    })),
    edges: graph.edges.map((e) => ({
      id: String(e.id ?? ""),
      source: String(e.source ?? ""),
      sourceHandle: String(e.sourceHandle ?? ""),
      target: String(e.target ?? ""),
      targetHandle: String(e.targetHandle ?? "")
    }))
  };
}

export interface ChatTurnHarness {
  handler: ChatTurnHandler;
  session: FakeClientSession;
  jobs: RecordingJobs;
  toolBridge: ToolBridge;
  approvalBridge: ToolBridge;
  deps: ChatTurnDeps;
}

export function makeChatTurnHarness(
  overrides: {
    session?: FakeClientSessionOptions;
    deps?: Partial<ChatTurnDeps>;
  } = {}
): ChatTurnHarness {
  const session = new FakeClientSession(overrides.session);
  const jobs = new RecordingJobs();
  const toolBridge = new ToolBridge();
  const approvalBridge = new ToolBridge();
  const deps: ChatTurnDeps = {
    jobs,
    toolBridge,
    approvalBridge,
    clientTools: () => ({}),
    authToken: () => null,
    defaults: { provider: "", model: "" },
    hydrateGraph: minimalHydrateGraph,
    configuredProviders: async () => ({}),
    entityRefResolver: () => ({ getAssetInfo: async () => null }),
    resolveEntityReferenceImages: async () => [],
    resolveSourceImageBytes: async () => null,
    ...overrides.deps
  };
  const handler = new ChatTurnHandler(session, deps);
  return { handler, session, jobs, toolBridge, approvalBridge, deps };
}

/** What a chat-turn provider double may implement. All members optional. */
export interface FakeProviderShape {
  provider?: string;
  cost?: number;
  unpricedReason?: string | null;
  setMessageEmitter?: (emit: (msg: unknown) => void) => void;
  generateLoop?: (args: GenerateLoopArgs) => AsyncGenerator<unknown>;
  textToImages?: (...args: unknown[]) => Promise<Uint8Array[]>;
  imageToImages?: (...args: unknown[]) => Promise<Uint8Array[]>;
  textToVideo?: (...args: unknown[]) => Promise<Uint8Array>;
  imageToVideo?: (...args: unknown[]) => Promise<Uint8Array>;
  textToSpeechEncoded?: (
    ...args: unknown[]
  ) => Promise<{ data: Uint8Array; mimeType: string } | null>;
  textToSpeech?: (
    ...args: unknown[]
  ) => AsyncGenerator<{ samples: Int16Array; sampleRate?: number }>;
}

/** The slice of the provider `generateLoop` contract the fakes read. */
export interface GenerateLoopArgs {
  messages: Array<{ role: string; content: unknown }>;
  signal?: AbortSignal;
  providerSession?: unknown;
  loadFullHistory?: () => Promise<Array<{ role: string; content: unknown }>>;
  executeTool?: (toolCall: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }) => Promise<unknown>;
}

/**
 * Build a provider double. The handler reads only the members a given path
 * touches, so the cast is over a structurally honest partial.
 */
export function fakeProvider(shape: FakeProviderShape): BaseProvider {
  const base: FakeProviderShape = {
    provider: "mock",
    cost: 0,
    setMessageEmitter: () => {},
    ...shape
  };
  // SAFETY: BaseProvider is a class with many members; the chat turn reads
  // only the ones the double provides, and a missing one fails the test loudly.
  return base as unknown as BaseProvider;
}
