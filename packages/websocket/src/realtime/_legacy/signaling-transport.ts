import type { RealtimeSessionSignalingState } from "@nodetool/protocol";
import { realtimeSessionManager } from "../session-manager.js";
import type { RealtimeCommandHandlerDependencies } from "../command-handler-types.js";
import { normalizeSignal } from "../command-normalization.js";

export class RealtimeSignalingTransport {
  constructor(private readonly dependencies: RealtimeCommandHandlerDependencies) {}

  private getUserId(): string {
    return this.dependencies.getUserId();
  }

  async handleSignal(data: Record<string, unknown>): Promise<Record<string, unknown>> {
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

    const signal = normalizeSignal(data.signal);
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
      if (
        session.transport === "webrtc" &&
        this.dependencies.realtimeWebRTCServer
      ) {
        await this.dependencies.realtimeWebRTCServer.handleSignal(
          session,
          signal
        );
      } else {
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
}
