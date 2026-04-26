import { realtimeSessionManager } from "./session-manager.js";
import type { RealtimeCommandHandlerDependencies } from "./command-handler-types.js";
import { RealtimeSessionCommandService } from "./session-command-service.js";
import { RealtimeSignalingTransport } from "./signaling-transport.js";
import {
  normalizeMediaTracks,
  normalizeParameters,
  normalizeSignalingState,
  normalizeTransport
} from "./command-normalization.js";
import { routeRealtimeParameterUpdates } from "./runner-parameter-routing.js";

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

  async handleStop(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.sessionCommands.handleStop(data);
  }
}
