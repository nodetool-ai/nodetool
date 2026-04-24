import { useEffect, useState } from "react";
import log from "loglevel";
import type { RealtimeSignalingStatus } from "@nodetool/protocol";

import { realtimeSessionClient } from "../../lib/websocket/RealtimeSessionClient";

interface UseRealtimeSessionWebRTCOptions {
  sessionId: string | null;
  workflowId: string | null;
  localStream: MediaStream | null;
  enabled: boolean;
}

interface UseRealtimeSessionWebRTCResult {
  remoteStream: MediaStream | null;
  signalingStatus: RealtimeSignalingStatus;
  connectionState: RTCPeerConnectionState | "closed";
  error: string | null;
}

export const useRealtimeSessionWebRTC = ({
  sessionId,
  workflowId,
  localStream,
  enabled
}: UseRealtimeSessionWebRTCOptions): UseRealtimeSessionWebRTCResult => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [signalingStatus, setSignalingStatus] =
    useState<RealtimeSignalingStatus>("idle");
  const [connectionState, setConnectionState] = useState<
    RTCPeerConnectionState | "closed"
  >("closed");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId || !workflowId || !localStream) {
      setRemoteStream(null);
      setSignalingStatus("idle");
      setConnectionState("closed");
      setError(null);
      return;
    }

    let disposed = false;
    const operatorPeer = new RTCPeerConnection();
    const runtimePeer = new RTCPeerConnection();
    const nextRemoteStream = new MediaStream();
    setRemoteStream(nextRemoteStream);
    setSignalingStatus("negotiating");
    setConnectionState("new");
    setError(null);

    const publishStatus = (
      status: RealtimeSignalingStatus,
      nextError?: string | null
    ) => {
      if (disposed) {
        return;
      }

      setSignalingStatus(status);
      setError(nextError ?? null);
      void realtimeSessionClient
        .signalSession(sessionId, workflowId, {
          signalingStatus: status,
          error: nextError ?? null
        })
        .catch((statusError) => {
          log.warn("Failed to publish realtime signaling status", statusError);
        });
    };

    const syncConnectionState = () => {
      if (disposed) {
        return;
      }

      const states = [operatorPeer.connectionState, runtimePeer.connectionState];
      const nextState = states.includes("failed")
        ? "failed"
        : states.includes("connected")
          ? "connected"
          : states.includes("connecting")
            ? "connecting"
            : states.includes("disconnected")
              ? "disconnected"
              : states.includes("closed")
                ? "closed"
                : "new";
      setConnectionState(nextState);

      if (nextState === "connected") {
        publishStatus("connected");
      } else if (nextState === "failed") {
        publishStatus("failed", "WebRTC transport failed");
      }
    };

    operatorPeer.onconnectionstatechange = syncConnectionState;
    runtimePeer.onconnectionstatechange = syncConnectionState;

    runtimePeer.ontrack = (event) => {
      const sourceStream = event.streams[0];
      if (sourceStream) {
        sourceStream.getTracks().forEach((track) => {
          nextRemoteStream.addTrack(track);
        });
        return;
      }

      nextRemoteStream.addTrack(event.track);
    };

    operatorPeer.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      void realtimeSessionClient
        .signalSession(sessionId, workflowId, {
          signal: {
            signal_type: "ice_candidate",
            source: "operator",
            target: "runtime",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex
            }
          }
        })
        .catch((signalError) => {
          log.warn("Failed to relay operator ICE candidate", signalError);
        });
    };

    runtimePeer.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      void realtimeSessionClient
        .signalSession(sessionId, workflowId, {
          signal: {
            signal_type: "ice_candidate",
            source: "runtime",
            target: "operator",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex
            }
          }
        })
        .catch((signalError) => {
          log.warn("Failed to relay runtime ICE candidate", signalError);
        });
    };

    const unsubscribe = realtimeSessionClient.subscribeToSignals(
      sessionId,
      (message) => {
        void (async () => {
          try {
            if (disposed) {
              return;
            }

            if (message.target === "runtime") {
              if (
                message.signal_type === "offer" &&
                message.description?.type === "offer"
              ) {
                await runtimePeer.setRemoteDescription(message.description);
                const answer = await runtimePeer.createAnswer();
                await runtimePeer.setLocalDescription(answer);
                if (disposed) {
                  return;
                }
                if (!answer.sdp) {
                  throw new Error("Realtime runtime peer produced an empty answer");
                }
                await realtimeSessionClient.signalSession(sessionId, workflowId, {
                  signal: {
                    signal_type: "answer",
                    source: "runtime",
                    target: "operator",
                    description: {
                      type: "answer",
                      sdp: answer.sdp
                    }
                  }
                });
                return;
              }

              if (
                message.signal_type === "ice_candidate" &&
                message.candidate?.candidate
              ) {
                await runtimePeer.addIceCandidate(message.candidate);
              }
              return;
            }

            if (message.target !== "operator") {
              return;
            }

            if (
              message.signal_type === "answer" &&
              message.description?.type === "answer"
            ) {
              await operatorPeer.setRemoteDescription(message.description);
              return;
            }

            if (
              message.signal_type === "ice_candidate" &&
              message.candidate?.candidate
            ) {
              await operatorPeer.addIceCandidate(message.candidate);
            }
          } catch (signalError) {
            const messageText =
              signalError instanceof Error
                ? signalError.message
                : "Realtime WebRTC signaling failed";
            publishStatus("failed", messageText);
          }
        })();
      }
    );

    localStream.getTracks().forEach((track) => {
      operatorPeer.addTrack(track, localStream);
    });

    void (async () => {
      try {
        const offer = await operatorPeer.createOffer();
        await operatorPeer.setLocalDescription(offer);
        if (disposed) {
          return;
        }
        if (!offer.sdp) {
          throw new Error("Realtime operator peer produced an empty offer");
        }

        await realtimeSessionClient.signalSession(sessionId, workflowId, {
          signalingStatus: "negotiating",
          signal: {
            signal_type: "offer",
            source: "operator",
            target: "runtime",
            description: {
              type: "offer",
              sdp: offer.sdp
            }
          }
        });
      } catch (negotiationError) {
        const messageText =
          negotiationError instanceof Error
            ? negotiationError.message
            : "Failed to start realtime WebRTC negotiation";
        publishStatus("failed", messageText);
      }
    })();

    return () => {
      disposed = true;
      unsubscribe();
      operatorPeer.close();
      runtimePeer.close();
      nextRemoteStream.getTracks().forEach((track) => track.stop());
      setConnectionState("closed");
    };
  }, [enabled, localStream, sessionId, workflowId]);

  return {
    remoteStream,
    signalingStatus,
    connectionState,
    error
  };
};
