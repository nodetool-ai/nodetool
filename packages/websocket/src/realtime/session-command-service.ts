import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool/config";
import { Job } from "@nodetool/models";
import { realtimeSessionManager } from "./session-manager.js";
import type { RealtimeCommandHandlerDependencies } from "./command-handler-types.js";
import {
  normalizeGraph,
  normalizeMediaTracks,
  normalizeParameters,
  normalizeSignalingState,
  normalizeTransport
} from "./command-normalization.js";

const log = createLogger("nodetool.websocket.realtime-session-commands");

export class RealtimeSessionCommandService {
  constructor(private readonly dependencies: RealtimeCommandHandlerDependencies) {}

  private getUserId(): string {
    return this.dependencies.getUserId();
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
    const parameters = normalizeParameters(data.parameters);
    const transport = normalizeTransport(data.transport);
    const mediaTracks = normalizeMediaTracks(data.media_tracks);
    const signaling = normalizeSignalingState(data.signaling);
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
      const graph = normalizeGraph(data.graph);
      await this.dependencies.runRealtimeJob(
        {
          job_id: jobId,
          workflow_id: workflowId,
          graph,
          params: parameters
        },
        session
      );
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
      log.error("realtime metadata persistence failed", {
        error: error instanceof Error ? error.message : String(error),
        jobId,
        sessionId: session.session_id
      });
    }

    await this.dependencies.emitSessionStarted(session);

    const shouldWaitForTransportReadiness = session.transport === "webrtc";
    const readySession = shouldWaitForTransportReadiness
      ? session
      : realtimeSessionManager.updateSession(session.session_id, userId, {
          status: "running"
        });
    if (readySession && !shouldWaitForTransportReadiness) {
      await this.dependencies.emitSessionUpdated(readySession);
    }

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "start",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: jobId,
      status: readySession?.status ?? session.status
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

    await this.dependencies.realtimeWebRTCServer?.stopSession(session.session_id);
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
