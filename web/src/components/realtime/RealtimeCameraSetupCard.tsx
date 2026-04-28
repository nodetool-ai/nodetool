import {
  Card,
  Caption,
  FlexColumn,
  StatusIndicator,
  Text,
  TextInput
} from "../ui_primitives";
import Select from "../inputs/Select";
import {
  VIDEO_CAPTURE_RESOLUTION_PRESETS,
  type VideoCaptureResolutionPreset
} from "../../hooks/browser/useVideoCapture";
import type { RealtimeCameraFramePublisherStatus } from "../../hooks/realtime/useRealtimeCameraFramePublisher";
import {
  realtimeCardSx,
  realtimeTextInputSx
} from "./realtimeStyles";

interface RealtimeCameraSetupCardProps {
  selectedVideoResolution: VideoCaptureResolutionPreset;
  videoTrackSettings: MediaTrackSettings | null;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  videoTargetSourceHandle: string;
  ingressMode: "frame-push" | "webrtc";
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  onVideoResolutionChange: (resolution: VideoCaptureResolutionPreset) => void;
  onVideoTargetNodeIdChange: (nodeId: string) => void;
  onVideoTargetInputNameChange: (inputName: string) => void;
}

export const RealtimeCameraSetupCard = ({
  selectedVideoResolution,
  videoTrackSettings,
  videoTargetNodeId,
  videoTargetInputName,
  videoTargetSourceHandle,
  ingressMode,
  cameraPublisherStatus,
  onVideoResolutionChange,
  onVideoTargetNodeIdChange,
  onVideoTargetInputNameChange
}: RealtimeCameraSetupCardProps) => {
  const resolutionOptions = Object.entries(VIDEO_CAPTURE_RESOLUTION_PRESETS).map(
    ([value, preset]) => ({
      value,
      label: preset.label
    })
  );
  const actualMode = videoTrackSettings
    ? `${videoTrackSettings.width ?? "?"}x${videoTrackSettings.height ?? "?"}${
        videoTrackSettings.frameRate
          ? ` @ ${Math.round(videoTrackSettings.frameRate)}fps`
          : ""
      }`
    : "Waiting for preview";
  const route =
    cameraPublisherStatus.nodeId && cameraPublisherStatus.inputName
      ? `${cameraPublisherStatus.nodeId}.${cameraPublisherStatus.inputName}`
      : `${videoTargetNodeId}.${videoTargetInputName}`;

  return (
    <Card padding="normal" variant="outlined" sx={realtimeCardSx}>
      <FlexColumn gap={1.5}>
        <Text weight={600}>Camera Setup</Text>
        <Select
          options={resolutionOptions}
          value={selectedVideoResolution}
          onChange={(value) =>
            onVideoResolutionChange(value as VideoCaptureResolutionPreset)
          }
          placeholder="Resolution"
          label="Resolution"
          sharp
        />
        <Caption>Actual: {actualMode}</Caption>
        <TextInput
          label="Target node id"
          value={videoTargetNodeId}
          onChange={(event) => onVideoTargetNodeIdChange(event.target.value)}
          sx={realtimeTextInputSx}
          compact
        />
        <TextInput
          label="Target input name"
          value={videoTargetInputName}
          onChange={(event) => onVideoTargetInputNameChange(event.target.value)}
          sx={realtimeTextInputSx}
          compact
        />
        <Caption>
          {ingressMode === "webrtc" ? "WebRTC" : "Frame push"} route: {route}
        </Caption>
        <Caption>
          Source: {cameraPublisherStatus.sourceHandle ?? videoTargetSourceHandle}
        </Caption>
        <StatusIndicator
          status={cameraPublisherStatus.active ? "success" : "pending"}
          label={cameraPublisherStatus.active ? "Camera active" : "Camera waiting"}
          pulse={cameraPublisherStatus.active}
        />
        <Caption>
          {cameraPublisherStatus.framesPublished.toLocaleString()} frames pushed
          at {cameraPublisherStatus.targetFps.toLocaleString()} fps
        </Caption>
        {cameraPublisherStatus.skippedReason ? (
          <Caption color="warning">{cameraPublisherStatus.skippedReason}</Caption>
        ) : null}
        {cameraPublisherStatus.lastError ? (
          <Caption color="error">{cameraPublisherStatus.lastError}</Caption>
        ) : null}
      </FlexColumn>
    </Card>
  );
};
