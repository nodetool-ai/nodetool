import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool/config";
import { Job } from "@nodetool/models";
import type {
  RealtimeMediaTrackKind,
  RealtimeMediaTrackMapping,
  RealtimeSessionIceCandidate,
  RealtimeSessionRecord,
  RealtimeSessionSignal,
  RealtimeSessionSignalDescription,
  RealtimeSessionSignalingState,
  RealtimeSessionTransport,
  RealtimeSignalPeer,
  RealtimeSignalType
} from "@nodetool/protocol";
import { realtimeSessionManager } from "./session-manager.js";

const log = createLogger("nodetool.websocket.realtime-handler");

type WorkflowGraphPayload = {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
};

interface RealtimeRunJobRequest {
  job_id: string;
  workflow_id: string;
  graph?: WorkflowGraphPayload;
  params: Record<string, unknown>;
}

interface ActiveRealtimeJob {
  runner: {
    pushInputValue(inputName: string, value: unknown): Promise<void>;
    pushParameter?(
      name: string,
      value: unknown
    ): Promise<{ routed: boolean; nodeIds: string[] }>;
  };
}

export interface RealtimeCommandHandlerDependencies {
  getUserId: () => string;
  runJob: (request: RealtimeRunJobRequest) => Promise<void>;
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
}

/**
 * Handles realtime websocket session commands behind a narrow dependency
 * interface so session mutation and runner orchestration stay out of the
 * unified websocket runner god-class.
 */
export class RealtimeCommandHandler {
  constructor(private readonly dependencies: RealtimeCommandHandlerDependencies) {}

  private getUserId(): string {
    return this.dependencies.getUserId();
  }

  private normalizeParameters(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private normalizeTransport(value: unknown): RealtimeSessionTransport {
    return value === "webrtc" ? "webrtc" : "websocket";
  }

  private normalizeMediaTracks(value: unknown): RealtimeMediaTrackMapping[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalizedTracks: RealtimeMediaTrackMapping[] = [];
    for (const track of value) {
      if (!track || typeof track !== "object" || Array.isArray(track)) {
        continue;
      }

      const record = track as Record<string, unknown>;
      const trackId =
        typeof record.track_id === "string" ? record.track_id.trim() : "";
      const nodeId =
        typeof record.node_id === "string" ? record.node_id.trim() : "";
      const inputName =
        typeof record.input_name === "string" ? record.input_name.trim() : "";
      const kind: RealtimeMediaTrackKind =
        record.kind === "audio" ? "audio" : "video";

      if (!trackId || !nodeId || !inputName) {
        continue;
      }

      normalizedTracks.push({
        track_id: trackId,
        kind,
        node_id: nodeId,
        input_name: inputName,
        label: typeof record.label === "string" ? record.label : null,
        enabled: record.enabled !== false
      });
    }

    return normalizedTracks;
  }

  private normalizeSignalingState(
    value: unknown
  ): Partial<RealtimeSessionSignalingState> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const status = record.status;
    const validStatus =
      status === "idle" ||
      status === "negotiating" ||
      status === "connected" ||
      status === "failed"
        ? status
        : undefined;

    const signaling: Partial<RealtimeSessionSignalingState> = {};
    if (validStatus) {
      signaling.status = validStatus;
    }
    if (
      record.last_signal_type === "offer" ||
      record.last_signal_type === "answer" ||
      record.last_signal_type === "ice_candidate"
    ) {
      signaling.last_signal_type = record.last_signal_type;
    }
    if (typeof record.last_signal_at === "string") {
      signaling.last_signal_at = record.last_signal_at;
    }
    if (typeof record.error === "string" || record.error === null) {
      signaling.error = record.error;
    }

    return Object.keys(signaling).length > 0 ? signaling : undefined;
  }

  private normalizeSignal(
    value: unknown
  ):
    | {
        signal_type: RealtimeSignalType;
        source: RealtimeSignalPeer;
        target: RealtimeSignalPeer;
        description?: RealtimeSessionSignalDescription;
        candidate?: RealtimeSessionIceCandidate;
      }
    | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const signalType = record.signal_type;
    if (
      signalType !== "offer" &&
      signalType !== "answer" &&
      signalType !== "ice_candidate"
    ) {
      return undefined;
    }

    const source: RealtimeSignalPeer =
      record.source === "runtime" ? "runtime" : "operator";
    const target: RealtimeSignalPeer =
      record.target === "operator" ? "operator" : "runtime";

    const normalizedSignal: {
      signal_type: RealtimeSignalType;
      source: RealtimeSignalPeer;
      target: RealtimeSignalPeer;
      description?: RealtimeSessionSignalDescription;
      candidate?: RealtimeSessionIceCandidate;
    } = {
      signal_type: signalType,
      source,
      target
    };

    if (
      (signalType === "offer" || signalType === "answer") &&
      record.description &&
      typeof record.description === "object" &&
      !Array.isArray(record.description)
    ) {
      const descriptionRecord = record.description as Record<string, unknown>;
      const sdp =
        typeof descriptionRecord.sdp === "string" ? descriptionRecord.sdp : "";
      const descriptionType = descriptionRecord.type;
      if (
        sdp &&
        ((signalType === "offer" && descriptionType === "offer") ||
          (signalType === "answer" && descriptionType === "answer"))
      ) {
        normalizedSignal.description = {
          type: descriptionType,
          sdp
        };
      }
    }

    if (
      signalType === "ice_candidate" &&
      record.candidate &&
      typeof record.candidate === "object" &&
      !Array.isArray(record.candidate)
    ) {
      const candidateRecord = record.candidate as Record<string, unknown>;
      const iceCandidateValue =
        typeof candidateRecord.candidate === "string"
          ? candidateRecord.candidate
          : "";
      if (iceCandidateValue) {
        normalizedSignal.candidate = {
          candidate: iceCandidateValue,
          sdpMid:
            typeof candidateRecord.sdpMid === "string" ||
            candidateRecord.sdpMid === null
              ? candidateRecord.sdpMid
              : null,
          sdpMLineIndex:
            typeof candidateRecord.sdpMLineIndex === "number"
              ? candidateRecord.sdpMLineIndex
              : null
        };
      }
    }

    if (
      (signalType === "offer" || signalType === "answer") &&
      !normalizedSignal.description
    ) {
      return undefined;
    }

    if (signalType === "ice_candidate" && !normalizedSignal.candidate) {
      return undefined;
    }

    return normalizedSignal;
  }

  private normalizeGraph(value: unknown): WorkflowGraphPayload | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      throw new Error("graph must be an object with nodes and edges arrays");
    }
    if (Array.isArray(value)) {
      throw new Error("graph must be an object, not an array");
    }
    if (typeof value !== "object") {
      throw new Error("graph must be an object with nodes and edges arrays");
    }

    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
      throw new Error("graph must include nodes and edges arrays");
    }

    return {
      nodes: record.nodes.map((node) => ({ ...(node as Record<string, unknown>) })),
      edges: record.edges.map((edge) => ({ ...(edge as Record<string, unknown>) }))
    };
  }

  private async persistRealtimeJobMetadata(
    jobId: string,
    sessionId: string
  ): Promise<void> {
    const job = (await Job.get(jobId)) as Job | null;
    if (!job) {
      return;
    }

    job.metadata_json = {
      ...(job.metadata_json ?? {}),
      realtime_session_id: sessionId,
      execution_mode: "realtime"
    };
    await job.save();
  }

  async handleStart(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const workflowId =
      typeof data.workflow_id === "string" && data.workflow_id.length > 0
        ? data.workflow_id
        : null;

    if (!workflowId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        error: "workflow_id is required"
      };
    }

    const sessionId =
      typeof data.session_id === "string" && data.session_id.length > 0
        ? data.session_id
        : undefined;
    const parameters = this.normalizeParameters(data.parameters);
    const transport = this.normalizeTransport(data.transport);
    const mediaTracks = this.normalizeMediaTracks(data.media_tracks);
    const signaling = this.normalizeSignalingState(data.signaling);
    const jobId = randomUUID();
    const userId = this.getUserId();
    const session = realtimeSessionManager.createSession({
      sessionId,
      userId,
      workflowId,
      jobId,
      parameters,
      transport,
      mediaTracks,
      signaling,
      status: "starting"
    });

    this.dependencies.trackSessionJob(session.session_id, jobId);

    try {
      const graph = this.normalizeGraph(data.graph);
      await this.dependencies.runJob({
        job_id: jobId,
        workflow_id: workflowId,
        graph,
        params: parameters
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start realtime session";
      await this.dependencies.failSessionStartup(session.session_id, jobId, message);
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "start",
        session_id: session.session_id,
        workflow_id: workflowId,
        job_id: jobId,
        error: message
      };
    }

    if (!this.dependencies.getActiveJob(jobId)) {
      const message =
        "Failed to start realtime session: job runner did not stay active";
      await this.dependencies.failSessionStartup(session.session_id, jobId, message);
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "start",
        session_id: session.session_id,
        workflow_id: workflowId,
        job_id: jobId,
        error: message
      };
    }

    try {
      await this.persistRealtimeJobMetadata(jobId, session.session_id);
    } catch (error) {
      // Best effort only: the realtime job still runs, but DB-backed
      // job/session linkage will be missing until persistence succeeds.
      log.error("realtime metadata persistence failed", {
        error: error instanceof Error ? error.message : String(error),
        jobId,
        sessionId: session.session_id
      });
    }

    await this.dependencies.emitSessionStarted(session);

    const runningSession = realtimeSessionManager.updateSession(
      session.session_id,
      userId,
      { status: "running" }
    );
    if (runningSession) {
      await this.dependencies.emitSessionUpdated(runningSession);
    }

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "start",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: jobId,
      status: "running"
    };
  }

  async handleUpdate(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const sessionId =
      typeof data.session_id === "string" && data.session_id.length > 0
        ? data.session_id
        : null;

    if (!sessionId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        error: "session_id is required"
      };
    }

    const session = realtimeSessionManager.updateSession(sessionId, this.getUserId(), {
      parameters: this.normalizeParameters(data.parameters),
      transport:
        data.transport === undefined
          ? undefined
          : this.normalizeTransport(data.transport),
      mediaTracks:
        data.media_tracks === undefined
          ? undefined
          : this.normalizeMediaTracks(data.media_tracks),
      signaling: this.normalizeSignalingState(data.signaling)
    });

    if (!session) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "update",
        session_id: sessionId,
        error: "Realtime session not found"
      };
    }

    const parameterUpdates = this.normalizeParameters(data.parameters);
    const routed_parameters: string[] = [];
    const unrouted_parameters: string[] = [];
    if (session.job_id) {
      const active = this.dependencies.getActiveJob(session.job_id);
      if (active) {
        for (const [inputName, value] of Object.entries(parameterUpdates)) {
          try {
            let didRoute = false;
            const parameterResult = active.runner.pushParameter
              ? await active.runner.pushParameter(inputName, value)
              : { routed: false, nodeIds: [] };
            didRoute = parameterResult.routed;

            if (!didRoute) {
              await active.runner.pushInputValue(inputName, value);
              didRoute = true;
            }

            if (didRoute) {
              routed_parameters.push(inputName);
            }
          } catch (error) {
            log.warn("Failed to route realtime session parameter update", {
              sessionId,
              jobId: session.job_id,
              inputName,
              error: error instanceof Error ? error.message : String(error)
            });
            unrouted_parameters.push(inputName);
          }
        }
      }
    }

    await this.dependencies.emitSessionUpdated(session);

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "update",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      status: session.status,
      routed_parameters,
      unrouted_parameters
    };
  }

  async handleSignal(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const sessionId =
      typeof data.session_id === "string" && data.session_id.length > 0
        ? data.session_id
        : null;

    if (!sessionId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        error: "session_id is required"
      };
    }

    const existingSession = realtimeSessionManager.getSession(
      sessionId,
      this.getUserId()
    );
    if (!existingSession) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "signal",
        session_id: sessionId,
        error: "Realtime session not found"
      };
    }

    const signal = this.normalizeSignal(data.signal);
    const signalingStatus =
      typeof data.signaling_status === "string" ? data.signaling_status : undefined;
    const signalingError =
      typeof data.error === "string" || data.error === null ? data.error : undefined;

    const signalingPatch: Partial<RealtimeSessionSignalingState> = {};
    if (
      signalingStatus === "idle" ||
      signalingStatus === "negotiating" ||
      signalingStatus === "connected" ||
      signalingStatus === "failed"
    ) {
      signalingPatch.status = signalingStatus;
    }
    if (signal) {
      signalingPatch.last_signal_type = signal.signal_type;
      signalingPatch.last_signal_at = new Date().toISOString();
    }
    if (signalingError !== undefined) {
      signalingPatch.error = signalingError;
    }

    const session = realtimeSessionManager.updateSession(
      sessionId,
      this.getUserId(),
      {
        signaling:
          Object.keys(signalingPatch).length > 0 ? signalingPatch : undefined
      }
    );

    if (!session) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "signal",
        session_id: sessionId,
        error: "Realtime session not found"
      };
    }

    if (Object.keys(signalingPatch).length > 0) {
      await this.dependencies.emitSessionUpdated(session);
    }

    if (signal) {
      await this.dependencies.emitSessionSignal({
        type: "realtime_session_signal",
        session_id: session.session_id,
        workflow_id: session.workflow_id,
        signal_type: signal.signal_type,
        source: signal.source,
        target: signal.target,
        description: signal.description,
        candidate: signal.candidate,
        created_at: new Date().toISOString()
      });
    }

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "signal",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      status: session.status,
      signaling_status: session.signaling.status
    };
  }

  async handleStop(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sessionId =
      typeof data.session_id === "string" && data.session_id.length > 0
        ? data.session_id
        : null;

    if (!sessionId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        error: "session_id is required"
      };
    }

    const reason =
      typeof data.reason === "string" && data.reason.length > 0
        ? data.reason
        : "user";
    const existingSession = realtimeSessionManager.getSession(
      sessionId,
      this.getUserId()
    );
    const jobId = existingSession?.job_id ?? null;
    if (jobId) {
      await this.dependencies.cancelJob(
        jobId,
        existingSession?.workflow_id ?? undefined
      );
    }

    const session = realtimeSessionManager.stopSession(sessionId, this.getUserId());
    if (!session) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "stop",
        session_id: sessionId,
        error: "Realtime session not found"
      };
    }

    await this.dependencies.emitSessionStopped(session, reason);
    this.dependencies.clearSessionTracking(sessionId, jobId);

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "stop",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      status: session.status
    };
  }
}
