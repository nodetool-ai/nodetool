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
import { useVideoCapture } from "../../hooks/browser/useVideoCapture";
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

const VideoSourceNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, type, data, selected } = props;
  const theme = useTheme();
  const metadata = useMetadataStore((state) => state.getMetadata(type));
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const setOutputResult = useResultsStore((state) => state.setOutputResult);
  const {
    error,
    videoRef,
    isPreviewing,
    isLoading,
    videoInputDevices,
    selectedVideoDeviceId,
    startPreview,
    stopPreview,
    refreshDevices,
    handleVideoDeviceChange
  } = useVideoCapture({ includeAudio: false, autoFetchDevices: false });

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
            disabled={!isPreviewing}
          >
            Capture Still
          </EditorButton>
        </FlexRow>

        <div className="video-source-select">
          <Select
            options={options}
            value={selectedVideoDeviceId}
            onChange={handleVideoDeviceChange}
            placeholder="System default camera"
            label="Camera"
          />
        </div>

        {error ? <Text color="error">{error}</Text> : null}

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
