/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "fast-deep-equal";

import { NodeData } from "../../stores/NodeData";
import useMetadataStore from "../../stores/MetadataStore";
import useResultsStore from "../../stores/ResultsStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  useVideoCapture,
  VIDEO_CAPTURE_RESOLUTION_PRESETS,
  type VideoCaptureResolutionPreset
} from "../../hooks/browser/useVideoCapture";
import { NodeHeader } from "../node/NodeHeader";
import { NodeOutputs } from "../node/NodeOutputs";
import NodeResizeHandle from "../node/NodeResizeHandle";
import {
  Container,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text
} from "../ui_primitives";
import Select from "../inputs/Select";
import { captureStillImage } from "./captureStillImage";

const styles = (theme: Theme) =>
  css({
    "&": {
      overflow: "visible",
      minWidth: "260px",
      minHeight: "220px",
      borderRadius: "var(--rounded-node)",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.c_node_bg
    },
    "&.selected": {
      outline: `3px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "-2px"
    },
    ".video-source-body": {
      padding: theme.spacing(1),
      gap: theme.spacing(1)
    },
    ".video-source-preview": {
      width: "100%",
      minHeight: "120px",
      maxHeight: "180px",
      borderRadius: "var(--rounded-sm)",
      objectFit: "contain",
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".video-source-select": {
      width: "100%"
    }
  });

const cameraOptions = (
  devices: Array<{ deviceId: string; label: string }>
): Array<{ value: string; label: string }> => {
  const options = devices.map((device) => ({
    value: device.deviceId,
    label: device.label
  }));
  if (!options.some((option) => option.value === "")) {
    return [{ value: "", label: "System default camera" }, ...options];
  }
  return options;
};

const resolutionOptions: Array<{
  value: VideoCaptureResolutionPreset;
  label: string;
}> = Object.entries(VIDEO_CAPTURE_RESOLUTION_PRESETS).map(
  ([value, preset]) => ({
    value: value as VideoCaptureResolutionPreset,
    label: preset.label
  })
);

const VideoSourceNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, type, data, selected } = props;
  const theme = useTheme();
  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const setOutputResult = useResultsStore((state) => state.setOutputResult);
  const initialVideoDeviceId =
    typeof data.properties.camera_device_id === "string"
      ? data.properties.camera_device_id
      : "";
  const initialVideoDeviceLabel =
    typeof data.properties.camera_device_label === "string"
      ? data.properties.camera_device_label
      : "";
  const initialResolution =
    typeof data.properties.camera_resolution === "string"
      ? (data.properties.camera_resolution as VideoCaptureResolutionPreset)
      : "hd";
  const {
    error,
    videoRef,
    isPreviewing,
    isWarmingUp,
    isPreviewReady,
    isLoading,
    videoInputDevices,
    unavailableVideoDeviceLabel,
    videoTrackSettings,
    selectedVideoDeviceId,
    selectedVideoResolution,
    startPreview,
    stopPreview,
    refreshDevices,
    handleVideoDeviceChange,
    handleVideoResolutionChange
  } = useVideoCapture({
    includeAudio: false,
    autoFetchDevices: false,
    initialVideoDeviceId,
    initialVideoDeviceLabel,
    initialResolution
  });

  const options = useMemo(
    () => cameraOptions(videoInputDevices),
    [videoInputDevices]
  );

  const handleCaptureStill = useCallback(() => {
    if (!videoRef.current) {
      return;
    }

    const image = captureStillImage(videoRef.current);
    if (!image) {
      return;
    }

    updateNodeProperties(id, { image });
    setOutputResult(data.workflow_id, id, image);
  }, [data.workflow_id, id, setOutputResult, updateNodeProperties, videoRef]);

  const handleCameraChange = useCallback(
    (deviceId: string) => {
      const deviceLabel =
        options.find((option) => option.value === deviceId)?.label ?? "";
      handleVideoDeviceChange(deviceId);
      updateNodeProperties(id, {
        camera_device_id: deviceId,
        camera_device_label: deviceLabel
      });
    },
    [handleVideoDeviceChange, id, options, updateNodeProperties]
  );

  const handleResolutionChange = useCallback(
    (resolution: VideoCaptureResolutionPreset) => {
      handleVideoResolutionChange(resolution);
      updateNodeProperties(id, {
        camera_resolution: resolution
      });
    },
    [handleVideoResolutionChange, id, updateNodeProperties]
  );

  if (!metadata) {
    throw new Error("Metadata not loaded for " + type);
  }

  return (
    <Container
      css={styles(theme)}
      className={`base-node video-source-node node-body ${
        selected ? "selected" : ""
      }`}
      padding="none"
    >
      <NodeHeader
        id={id}
        selected={selected}
        data={data}
        backgroundColor={theme.vars.palette.primary.dark}
        metadataTitle={metadata.title}
        iconType="video"
        iconBaseColor={theme.vars.palette.primary.main}
        workflowId={data.workflow_id}
      />

      <FlexColumn className="video-source-body nodrag nopan">
        <FlexRow gap={1} align="center" fullWidth>
          <EditorButton
            onClick={() => void refreshDevices()}
            variant="text"
            density="compact"
          >
            Load Cameras
          </EditorButton>
          {!isPreviewing ? (
            <EditorButton
              onClick={() => void startPreview()}
              variant="text"
              density="compact"
              disabled={isLoading}
            >
              Start
              {isLoading ? <LoadingSpinner size="small" /> : null}
            </EditorButton>
          ) : (
            <EditorButton
              onClick={stopPreview}
              variant="text"
              density="compact"
            >
              Stop
            </EditorButton>
          )}
          <EditorButton
            onClick={handleCaptureStill}
            variant="text"
            density="compact"
            disabled={!isPreviewReady}
          >
            Capture Still
          </EditorButton>
        </FlexRow>

        <div className="video-source-select">
          <Select
            options={options}
            value={selectedVideoDeviceId}
            onChange={handleCameraChange}
            placeholder="System default camera"
            label="Camera"
          />
        </div>

        <div className="video-source-select">
          <Select
            options={resolutionOptions}
            value={selectedVideoResolution}
            onChange={(value) =>
              handleResolutionChange(value as VideoCaptureResolutionPreset)
            }
            placeholder="Resolution"
            label="Resolution"
          />
        </div>

        {error ? <Text color="error">{error}</Text> : null}
        {unavailableVideoDeviceLabel ? (
          <Text size="small" color="warning">
            Stored camera unavailable: {unavailableVideoDeviceLabel}. Using
            system default.
          </Text>
        ) : null}
        {isWarmingUp ? (
          <Text size="small" color="warning">
            Warming up camera...
          </Text>
        ) : null}
        {videoTrackSettings ? (
          <Text size="small" color="secondary">
            Actual: {videoTrackSettings.width ?? "?"}x
            {videoTrackSettings.height ?? "?"}
            {videoTrackSettings.frameRate
              ? ` @ ${Math.round(videoTrackSettings.frameRate)}fps`
              : ""}
          </Text>
        ) : null}

        <video
          ref={videoRef}
          className="video-source-preview"
          autoPlay
          playsInline
          muted
        />
      </FlexColumn>

      <NodeOutputs
        id={id}
        outputs={metadata.outputs}
        isStreamingOutput={metadata.is_streaming_output}
      />
      <NodeResizeHandle minWidth={260} minHeight={220} />
    </Container>
  );
};

export default memo(VideoSourceNode, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.selected === next.selected &&
    prev.dragging === next.dragging &&
    isEqual(prev.data, next.data)
  );
});
