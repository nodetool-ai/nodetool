import type {
  RealtimeMetrics,
  RealtimeSessionRecord,
  RealtimeSignalingStatus
} from "@nodetool/protocol";

import { Card, FlexColumn, Text } from "../ui_primitives";
import type { RealtimeWebRTCRuntimeMode } from "../../hooks/browser/useRealtimeSessionWebRTC";
import { realtimeCardSx } from "./realtimeStyles";

interface RealtimeSessionDetailsCardProps {
  activeSession: RealtimeSessionRecord | null;
  activeMetrics: RealtimeMetrics | null;
  signalingStatus: RealtimeSignalingStatus;
  connectionState: RTCPeerConnectionState | "closed";
  runtimeMode: RealtimeWebRTCRuntimeMode;
  codecStatus: "loopback" | "unsupported";
}

export const RealtimeSessionDetailsCard = ({
  activeSession,
  activeMetrics,
  signalingStatus,
  connectionState,
  runtimeMode,
  codecStatus
}: RealtimeSessionDetailsCardProps) => {
  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={realtimeCardSx}
    >
      <FlexColumn gap={2}>
        <Text weight={600}>Active Session</Text>
        {activeSession ? (
          <>
            <Text>Session id: {activeSession.session_id}</Text>
            <Text>Status: {activeSession.status}</Text>
            <Text>Transport: {activeSession.transport}</Text>
            <Text color="secondary">
              Signaling: {activeSession.signaling.status}
            </Text>
            <Text color="secondary">Peer connection: {connectionState}</Text>
            <Text color="secondary">WebRTC runtime: {runtimeMode}</Text>
            <Text color="secondary">Codec bridge: {codecStatus}</Text>
            <Text color="secondary">
              Metrics codec: {activeMetrics?.codec.status ?? "pending"}
            </Text>
            <Text color="secondary">
              Frames: inbound {activeMetrics?.frames.inbound ?? 0}, routed{" "}
              {activeMetrics?.frames.routed ?? 0}, dropped{" "}
              {activeMetrics?.queues.total_dropped ?? 0}
            </Text>
            <Text color="secondary">
              FPS: inbound {(activeMetrics?.rates.inbound_fps ?? 0).toFixed(1)},
              routed {(activeMetrics?.rates.routed_fps ?? 0).toFixed(1)}
            </Text>
            <Text color="secondary">
              Queue depth: {activeMetrics?.queues.total_depth ?? 0}
            </Text>
            <Text color="secondary">Local hook state: {signalingStatus}</Text>
            <Text color="secondary">Job id: {activeSession.job_id ?? "pending"}</Text>
            <Text color="secondary">
              Started: {new Date(activeSession.created_at).toLocaleString()}
            </Text>
            <Text color="secondary">
              Updated: {new Date(activeSession.updated_at).toLocaleString()}
            </Text>
            <Text color="secondary">
              Parameters: {JSON.stringify(activeSession.parameters)}
            </Text>
            <Text color="secondary">
              Media tracks: {JSON.stringify(activeSession.media_tracks)}
            </Text>
          </>
        ) : (
          <Text color="secondary">
            No active realtime session for this workflow yet.
          </Text>
        )}
      </FlexColumn>
    </Card>
  );
};
