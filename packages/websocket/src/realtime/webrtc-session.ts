import type {
  RealtimeMetrics,
  RealtimeSessionRecord,
  RealtimeSessionSignal,
  RealtimeSessionSignalDescription,
  RealtimeSessionIceCandidate
} from "@nodetool/protocol";
import {
  RTCPeerConnection,
  type MediaStreamTrack,
  type RtpPacket
} from "werift";
import {
  UnsupportedCodecBridge,
  type CodecBridge
} from "./codec-bridge.js";
import { FrameRouter, type FrameRouterRunner } from "./frame-router.js";

export type IncomingRealtimeSignal = Omit<
  RealtimeSessionSignal,
  "type" | "session_id" | "workflow_id" | "created_at"
>;

export interface RealtimeWebRTCSessionOptions {
  session: RealtimeSessionRecord;
  runner?: FrameRouterRunner;
  codecBridge?: CodecBridge;
  emitSessionSignal: (signal: RealtimeSessionSignal) => Promise<void>;
}

export type RealtimeWebRTCSessionState = "new" | "running" | "closed";

export interface RealtimeWebRTCSessionMetrics {
  peer: RealtimeMetrics["peer"];
  codec: RealtimeMetrics["codec"];
  frames: RealtimeMetrics["frames"];
}

export class RealtimeWebRTCSession {
  private readonly peer = new RTCPeerConnection();
  private readonly codecBridge: CodecBridge;
  private readonly frameRouter?: FrameRouter;
  private state: RealtimeWebRTCSessionState = "new";
  private inboundFrames = 0;
  private outboundFrames = 0;
  private inboundRtpPackets = 0;
  private encodedFrames = 0;
  private unsupportedCodecFrames = 0;
  private codecStatus: RealtimeMetrics["codec"] = {
    status: "unsupported",
    name: null
  };

  constructor(private readonly options: RealtimeWebRTCSessionOptions) {
    this.codecBridge = options.codecBridge ?? new UnsupportedCodecBridge();
    this.frameRouter = options.runner
      ? new FrameRouter(options.session, options.runner)
      : undefined;
    this.attachTrackRouting();
    this.attachIceEmission();
  }

  get sessionId(): string {
    return this.options.session.session_id;
  }

  getState(): RealtimeWebRTCSessionState {
    return this.state;
  }

  metrics(): RealtimeWebRTCSessionMetrics {
    const peerState = this.peer as unknown as {
      connectionState?: string;
      iceConnectionState?: string;
    };
    const routed = this.frameRouter?.metrics() ?? {
      routedFrames: 0,
      unroutedFrames: 0
    };
    return {
      peer: {
        connection_state: peerState.connectionState ?? this.state,
        ice_connection_state: peerState.iceConnectionState ?? null
      },
      codec: this.codecStatus,
      frames: {
        inbound: this.inboundFrames,
        outbound: this.outboundFrames,
        inbound_rtp_packets: this.inboundRtpPackets,
        routed: routed.routedFrames,
        unrouted: routed.unroutedFrames,
        decode_unsupported: this.unsupportedCodecFrames,
        encoded: this.encodedFrames
      }
    };
  }

  async handleSignal(signal: IncomingRealtimeSignal): Promise<void> {
    if (signal.signal_type === "offer") {
      await this.handleOffer(signal.description);
      return;
    }

    if (signal.signal_type === "ice_candidate" && signal.candidate) {
      await this.addIceCandidate(signal.candidate);
    }
  }

  async close(): Promise<void> {
    if (this.state === "closed") {
      return;
    }

    try {
      this.frameRouter?.finish();
    } catch {
      // Teardown must still release peer resources when a saved mapping points
      // at a missing/stale realtime input.
    }

    await Promise.resolve(this.peer.close());
    this.state = "closed";
  }

  private async handleOffer(
    description: RealtimeSessionSignalDescription | undefined
  ): Promise<void> {
    if (!description || description.type !== "offer") {
      throw new Error("WebRTC offer signal requires an offer description");
    }

    await this.peer.setRemoteDescription(description);
    await this.peer.setLocalDescription(await this.peer.createAnswer());
    this.state = "running";

    await this.options.emitSessionSignal({
      type: "realtime_session_signal",
      session_id: this.options.session.session_id,
      workflow_id: this.options.session.workflow_id,
      signal_type: "answer",
      source: "runtime",
      target: "operator",
      description: {
        type: "answer",
        sdp: this.peer.localDescription!.sdp
      },
      created_at: new Date().toISOString()
    });
  }

  private async addIceCandidate(
    candidate: RealtimeSessionIceCandidate
  ): Promise<void> {
    const peerWithIce = this.peer as unknown as {
      addIceCandidate?: (candidate: RealtimeSessionIceCandidate) => Promise<void> | void;
    };
    await peerWithIce.addIceCandidate?.(candidate);
  }

  private attachTrackRouting(): void {
    this.peer.onTrack.subscribe((track: MediaStreamTrack) => {
      const kind = track.kind === "audio" ? "audio" : "video";
      const trackId = this.resolveTrackId(track, kind);
      track.onReceiveRtp.subscribe((rtp: RtpPacket) => {
        void this.routeRtp(trackId, kind, rtp);
      });
    });
  }

  private attachIceEmission(): void {
    const peerWithIceEvents = this.peer as unknown as {
      onIceCandidate?: {
        subscribe(callback: (candidate: RealtimeSessionIceCandidate | undefined) => void): void;
      };
    };

    peerWithIceEvents.onIceCandidate?.subscribe((candidate) => {
      if (!candidate) {
        return;
      }
      void this.options.emitSessionSignal({
        type: "realtime_session_signal",
        session_id: this.options.session.session_id,
        workflow_id: this.options.session.workflow_id,
        signal_type: "ice_candidate",
        source: "runtime",
        target: "operator",
        candidate,
        created_at: new Date().toISOString()
      });
    });
  }

  private async routeRtp(
    trackId: string,
    kind: "audio" | "video",
    rtp: RtpPacket
  ): Promise<void> {
    this.inboundRtpPackets += 1;
    const result = await this.codecBridge.decode({ trackId, kind, rtp });
    if (result.status === "decoded") {
      this.codecStatus = {
        status: "active",
        name: "custom"
      };
      await this.frameRouter?.routeFrame(trackId, result.frame);
      this.inboundFrames += 1;
      return;
    }
    this.unsupportedCodecFrames += 1;
  }

  private resolveTrackId(track: MediaStreamTrack, kind: "audio" | "video"): string {
    const trackWithId = track as MediaStreamTrack & { id?: string };
    if (trackWithId.id) {
      return trackWithId.id;
    }

    const firstMappedTrack = this.options.session.media_tracks.find(
      (mappedTrack) => mappedTrack.kind === kind && mappedTrack.enabled !== false
    );
    return firstMappedTrack?.track_id ?? kind;
  }
}
