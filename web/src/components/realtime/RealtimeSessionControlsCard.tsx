import type { SyntheticEvent } from "react";

import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  StatusIndicator,
  NodeSlider,
  Text,
  TextInput
} from "../ui_primitives";
import type { RealtimeCameraFramePublisherStatus } from "../../hooks/realtime/useRealtimeCameraFramePublisher";

interface RealtimeSessionControlsCardProps {
  brightness: number;
  isStartSessionDisabled: boolean;
  hasPreviewStream: boolean;
  hasActiveSession: boolean;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  videoTargetSourceHandle: string;
  ingressMode: "frame-push" | "webrtc";
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  previewError: string | null;
  webrtcConfigError: string | null;
  webrtcError: string | null;
  sessionError: string | null;
  onBrightnessChange: (brightness: number) => void;
  onBrightnessCommit: (
    event: Event | SyntheticEvent,
    value: number | number[]
  ) => Promise<void>;
  onVideoTargetNodeIdChange: (nodeId: string) => void;
  onVideoTargetInputNameChange: (inputName: string) => void;
  onStartPreview: () => Promise<void>;
  onStopPreview: () => void;
  onStartSession: () => Promise<void>;
  onStopSession: () => Promise<void>;
}

export const RealtimeSessionControlsCard = ({
  brightness,
  isStartSessionDisabled,
  hasPreviewStream,
  hasActiveSession,
  videoTargetNodeId,
  videoTargetInputName,
  videoTargetSourceHandle,
  ingressMode,
  cameraPublisherStatus,
  previewError,
  webrtcConfigError,
  webrtcError,
  sessionError,
  onBrightnessChange,
  onBrightnessCommit,
  onVideoTargetNodeIdChange,
  onVideoTargetInputNameChange,
  onStartPreview,
  onStopPreview,
  onStartSession,
  onStopSession
}: RealtimeSessionControlsCardProps) => {
  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={(theme) => ({ borderRadius: theme.rounded.xs })}
    >
      <FlexColumn gap={2}>
        <Text weight={600}>Session Controls</Text>
        <FlexRow gap={2} sx={{ flexWrap: "wrap" }}>
          <EditorButton onClick={() => void onStartPreview()}>
            Start Camera Preview
          </EditorButton>
          <EditorButton onClick={onStopPreview} disabled={!hasPreviewStream}>
            Stop Preview
          </EditorButton>
          <EditorButton
            onClick={() => void onStartSession()}
            disabled={isStartSessionDisabled}
          >
            Start Realtime Session
          </EditorButton>
          <EditorButton
            onClick={() => void onStopSession()}
            disabled={!hasActiveSession}
          >
            Stop Session
          </EditorButton>
        </FlexRow>

        <FlexColumn gap={1}>
          <Text weight={600}>Brightness</Text>
          <NodeSlider
            min={0}
            max={200}
            value={brightness}
            onChange={(_event, value) => {
              const nextBrightness = Array.isArray(value) ? value[0] : value;
              onBrightnessChange(nextBrightness);
            }}
            onChangeCommitted={onBrightnessCommit}
          />
          <Text color="secondary">Current value: {brightness}</Text>
        </FlexColumn>

        <FlexColumn gap={1.5}>
          <Text weight={600}>Video Track Mapping</Text>
          <Text color="secondary">
            Ingress: {ingressMode === "webrtc" ? "WebRTC transport" : "frame-push"}
          </Text>
          <Text color="secondary">
            Map the browser camera track to the realtime workflow node input that
            should receive the media stream. WebRTC is an explicit advanced
            transport option; the local MVP uses frame-push by default.
          </Text>
          <TextInput
            label="Target node id"
            value={videoTargetNodeId}
            onChange={(event) => onVideoTargetNodeIdChange(event.target.value)}
            compact
          />
          <TextInput
            label="Target input name"
            value={videoTargetInputName}
            onChange={(event) => onVideoTargetInputNameChange(event.target.value)}
            compact
          />
          <Text color="secondary">Source handle: {videoTargetSourceHandle}</Text>
        </FlexColumn>

        <FlexColumn gap={1}>
          <Text weight={600}>Camera Source Status</Text>
          <StatusIndicator
            status={cameraPublisherStatus.active ? "success" : "pending"}
            label={`Camera source: ${
              cameraPublisherStatus.active ? "active" : "waiting"
            }`}
            pulse={cameraPublisherStatus.active}
          />
          <Caption>
            Route:{" "}
            {cameraPublisherStatus.nodeId && cameraPublisherStatus.inputName
              ? `${cameraPublisherStatus.nodeId}.${cameraPublisherStatus.inputName}`
              : `${videoTargetNodeId}.${videoTargetInputName}`}{" "}
            from{" "}
            {cameraPublisherStatus.sourceHandle ?? videoTargetSourceHandle}
          </Caption>
          <Caption>
            Cadence: {cameraPublisherStatus.targetFps.toLocaleString()} fps
          </Caption>
          <Caption>
            Frames pushed: {cameraPublisherStatus.framesPublished.toLocaleString()}
          </Caption>
          {cameraPublisherStatus.trackId ? (
            <Caption>Track id: {cameraPublisherStatus.trackId}</Caption>
          ) : null}
          {cameraPublisherStatus.skippedReason ? (
            <Caption color="warning">
              Waiting: {cameraPublisherStatus.skippedReason}
            </Caption>
          ) : null}
          {cameraPublisherStatus.lastError ? (
            <Caption color="error">{cameraPublisherStatus.lastError}</Caption>
          ) : null}
        </FlexColumn>

        {previewError ? <Text color="error">{previewError}</Text> : null}
        {webrtcConfigError ? (
          <Text color="error">{webrtcConfigError}</Text>
        ) : null}
        {webrtcError ? <Text color="error">{webrtcError}</Text> : null}
        {sessionError ? <Text color="error">{sessionError}</Text> : null}
      </FlexColumn>
    </Card>
  );
};
