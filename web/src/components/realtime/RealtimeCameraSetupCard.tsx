import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  StatusIndicator,
  Text,
  TextInput
} from "../ui_primitives";
import Select from "../inputs/Select";
import {
  VIDEO_CAPTURE_RESOLUTION_PRESETS,
  type VideoCaptureResolutionPreset
} from "../../hooks/browser/useVideoCapture";
import {
  DEFAULT_REALTIME_FRAME_MAX_WIDTH,
  type RealtimeCameraFramePublisherStatus
} from "../../hooks/realtime/useRealtimeCameraFramePublisher";
import {
  realtimeCardSx,
  realtimeTextInputSx
} from "./realtimeStyles";

interface RealtimeCameraSetupCardProps {
  videoInputDevices: Array<{ deviceId: string; label: string }>;
  selectedVideoDeviceId: string;
  selectedVideoResolution: VideoCaptureResolutionPreset;
  videoTrackSettings: MediaTrackSettings | null;
  unavailableVideoDeviceLabel: string | null;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  videoTargetSourceHandle: string;
  ingressMode: "frame-push" | "webrtc";
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  onRefreshDevices: () => void;
  onVideoDeviceChange: (deviceId: string) => void;
  onVideoResolutionChange: (resolution: VideoCaptureResolutionPreset) => void;
  onVideoTargetNodeIdChange: (nodeId: string) => void;
  onVideoTargetInputNameChange: (inputName: string) => void;
}

export const RealtimeCameraSetupCard = ({
  videoInputDevices,
  selectedVideoDeviceId,
  selectedVideoResolution,
  videoTrackSettings,
  unavailableVideoDeviceLabel,
  videoTargetNodeId,
  videoTargetInputName,
  videoTargetSourceHandle,
  ingressMode,
  cameraPublisherStatus,
  onRefreshDevices,
  onVideoDeviceChange,
  onVideoResolutionChange,
  onVideoTargetNodeIdChange,
  onVideoTargetInputNameChange
}: RealtimeCameraSetupCardProps) => {
  const cameraOptions = videoInputDevices.some((device) => device.deviceId === "")
    ? videoInputDevices.map((device) => ({
        value: device.deviceId,
        label: device.label
      }))
    : [
        { value: "", label: "System default camera" },
        ...videoInputDevices.map((device) => ({
          value: device.deviceId,
          label: device.label
        }))
      ];
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
        <FlexRow gap={1} align="center" fullWidth>
          <EditorButton
            onClick={onRefreshDevices}
            variant="text"
            density="compact"
          >
            Load Cameras
          </EditorButton>
        </FlexRow>
        <Select
          options={cameraOptions}
          value={selectedVideoDeviceId}
          onChange={onVideoDeviceChange}
          placeholder="System default camera"
          label="Camera"
          sharp
        />
        {unavailableVideoDeviceLabel ? (
          <Caption color="warning">
            Stored camera unavailable: {unavailableVideoDeviceLabel}. Using
            system default.
          </Caption>
        ) : null}
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
        <Caption>
          Requested: {VIDEO_CAPTURE_RESOLUTION_PRESETS[selectedVideoResolution].label}
        </Caption>
        <Caption>Actual: {actualMode}</Caption>
        <Caption>
          Frame feed: downscaled to max {DEFAULT_REALTIME_FRAME_MAX_WIDTH}px wide
        </Caption>
        <FlexColumn gap={1.25} sx={{ pt: 1.5 }}>
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
        </FlexColumn>
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
