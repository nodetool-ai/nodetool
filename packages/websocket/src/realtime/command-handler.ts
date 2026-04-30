import type { VideoFrame } from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";
import { realtimeSessionManager } from "./session-manager.js";
import type { RealtimeCommandHandlerDependencies } from "./command-handler-types.js";
import { RealtimeSessionCommandService } from "./session-command-service.js";
import { RealtimeSignalingTransport } from "./signaling-transport.js";
import {
  normalizeMediaTracks,
  normalizeParameters,
  normalizeRealtimeVideoFrame,
  normalizeSignalingState,
  normalizeTransport
} from "./command-normalization.js";
import { routeRealtimeParameterUpdates } from "./runner-parameter-routing.js";
import { FrameRouter } from "./frame-router.js";

const log = createLogger("nodetool.websocket.realtime-command-handler");

export type {
  ActiveRealtimeJob,
  NormalizedRealtimeSignal,
  RealtimeCommandHandlerDependencies,
  RealtimeRunJobRequest,
  RealtimeWebRTCServerDependency,
  WorkflowGraphPayload
} from "./command-handler-types.js";

export class RealtimeCommandHandler {
  private readonly sessionCommands: RealtimeSessionCommandService;
  private readonly signalingTransport: RealtimeSignalingTransport;
  private readonly tempLoggedFrameRoutes = new Set<string>();

  constructor(private readonly dependencies: RealtimeCommandHandlerDependencies) {
    this.sessionCommands = new RealtimeSessionCommandService(dependencies);
    this.signalingTransport = new RealtimeSignalingTransport(dependencies);
  }

  async handleStart(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.sessionCommands.handleStart(data);
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

    const session = realtimeSessionManager.updateSession(
      sessionId,
      this.dependencies.getUserId(),
      {
        parameters: normalizeParameters(data.parameters),
        transport:
          data.transport === undefined
            ? undefined
            : normalizeTransport(data.transport),
        mediaTracks:
          data.media_tracks === undefined
            ? undefined
            : normalizeMediaTracks(data.media_tracks),
        signaling: normalizeSignalingState(data.signaling)
      }
    );

    if (!session) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "update",
        session_id: sessionId,
        error: "Realtime session not found"
      };
    }

    const parameterUpdates = normalizeParameters(data.parameters);
    const routing = session.job_id
      ? await routeRealtimeParameterUpdates({
          activeJob: this.dependencies.getActiveJob(session.job_id),
          jobId: session.job_id,
          parameterUpdates,
          sessionId
        })
      : { routedParameters: [], unroutedParameters: [] };

    await this.dependencies.emitSessionUpdated(session);

    return {
      type: "realtime_session_ack",
      ok: true,
      action: "update",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      status: session.status,
      routed_parameters: routing.routedParameters,
      unrouted_parameters: routing.unroutedParameters
    };
  }

  async handleSignal(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.signalingTransport.handleSignal(data);
  }

  async handlePushFrame(
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const sessionId =
      typeof data.session_id === "string" && data.session_id.length > 0
        ? data.session_id
        : null;
    const trackId =
      typeof data.track_id === "string" && data.track_id.length > 0
        ? data.track_id
        : null;

    if (!sessionId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        error: "session_id is required"
      };
    }
    if (!trackId) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: sessionId,
        error: "track_id is required"
      };
    }

    const session = realtimeSessionManager.getSession(
      sessionId,
      this.dependencies.getUserId()
    );
    if (!session) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: sessionId,
        track_id: trackId,
        error: "Realtime session not found"
      };
    }

    if (!session.job_id) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: sessionId,
        workflow_id: session.workflow_id,
        track_id: trackId,
        error: "Realtime session has no active job"
      };
    }

    const activeJob = this.dependencies.getActiveJob(session.job_id);
    if (!activeJob) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: sessionId,
        workflow_id: session.workflow_id,
        job_id: session.job_id,
        track_id: trackId,
        error: "No active realtime job"
      };
    }

    let frame: VideoFrame;
    try {
      frame = normalizeRealtimeVideoFrame(data.frame);
    } catch (error) {
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: sessionId,
        workflow_id: session.workflow_id,
        job_id: session.job_id,
        track_id: trackId,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    const router =
      typeof activeJob.getFrameRouter === "function"
        ? activeJob.getFrameRouter(session)
        : new FrameRouter(session, activeJob.runner);
    let routed: boolean;
    try {
      routed = await router.routeFrame(trackId, frame);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.dependencies.realtimeWebRTCServer?.recordFramePushResult?.(
        session.session_id,
        false
      );
      log.warn("Realtime pushed frame routing failed", {
        sessionId,
        workflowId: session.workflow_id,
        jobId: session.job_id,
        trackId,
        error: message
      });
      return {
        type: "realtime_session_ack",
        ok: false,
        action: "push_frame",
        session_id: session.session_id,
        workflow_id: session.workflow_id,
        job_id: session.job_id,
        track_id: trackId,
        routed: false,
        error: message,
        metrics: router.metrics()
      };
    }
    this.dependencies.realtimeWebRTCServer?.recordFramePushResult?.(
      session.session_id,
      routed
    );
    const logKey = `${session.session_id}:${trackId}`;
    if (!this.tempLoggedFrameRoutes.has(logKey)) {
      this.tempLoggedFrameRoutes.add(logKey);
      const track = session.media_tracks.find((candidate) => candidate.track_id === trackId);
      log.debug("Realtime first pushed frame routed", {
        sessionId,
        workflowId: session.workflow_id,
        jobId: session.job_id,
        trackId,
        routed,
        track,
        frame: {
          sequence: frame.sequence,
          width: frame.width,
          height: frame.height,
          pixelFormat: frame.pixel_format,
          stride: frame.stride
        },
        metrics: router.metrics()
      });
    }
    return {
      type: "realtime_session_ack",
      ok: true,
      action: "push_frame",
      session_id: session.session_id,
      workflow_id: session.workflow_id,
      job_id: session.job_id,
      track_id: trackId,
      routed,
      metrics: router.metrics()
    };
  }

  async handleStop(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.sessionCommands.handleStop(data);
  }
}
