import type {
  RealtimeSessionIceCandidate,
  RealtimeSessionRecord,
  RealtimeSessionSignal,
  RealtimeSessionSignalDescription,
  RealtimeSignalPeer,
  RealtimeSignalType
} from "@nodetool/protocol";

export type WorkflowGraphPayload = {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
};

export interface RealtimeRunJobRequest {
  job_id: string;
  workflow_id: string;
  graph?: WorkflowGraphPayload;
  params: Record<string, unknown>;
}

export interface ActiveRealtimeJob {
  runner: {
    pushInputValue(
      inputName: string,
      value: unknown,
      sourceHandle?: string
    ): Promise<void>;
    finishInputStream?(inputName: string, sourceHandle?: string): void;
    pushParameter?(
      name: string,
      value: unknown
    ): Promise<{ routed: boolean; nodeIds: string[] }>;
  };
}

export type NormalizedRealtimeSignal = {
  signal_type: RealtimeSignalType;
  source: RealtimeSignalPeer;
  target: RealtimeSignalPeer;
  description?: RealtimeSessionSignalDescription;
  candidate?: RealtimeSessionIceCandidate;
};

export interface RealtimeWebRTCServerDependency {
  handleSignal(
    session: RealtimeSessionRecord,
    signal: NormalizedRealtimeSignal
  ): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  getSessionState?(sessionId: string): string;
}

export interface RealtimeCommandHandlerDependencies {
  getUserId: () => string;
  runRealtimeJob: (
    request: RealtimeRunJobRequest,
    session: RealtimeSessionRecord
  ) => Promise<void>;
  cancelJob: (jobId: string, workflowId?: string) => Promise<void>;
  getActiveJob: (jobId: string) => ActiveRealtimeJob | undefined;
  trackSessionJob: (sessionId: string, jobId: string) => void;
  clearSessionTracking: (sessionId: string, jobId?: string | null) => void;
  failSessionStartup: (
    sessionId: string,
    jobId: string,
    reason: string
  ) => Promise<void>;
  emitSessionStarted: (session: RealtimeSessionRecord) => Promise<void>;
  emitSessionUpdated: (session: RealtimeSessionRecord) => Promise<void>;
  emitSessionStopped: (
    session: RealtimeSessionRecord,
    reason: string
  ) => Promise<void>;
  emitSessionSignal: (signal: RealtimeSessionSignal) => Promise<void>;
  realtimeWebRTCServer?: RealtimeWebRTCServerDependency;
}
