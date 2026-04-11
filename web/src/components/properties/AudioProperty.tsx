/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo, useState } from "react";
import isEqual from "fast-deep-equal";
import { TextField } from "@mui/material";
import { EditorButton } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import AudioVisualizer from "../common/AudioVisualizer";
import { useRealtimeAudioStream } from "../../hooks/useRealtimeAudioStream";
import type { NodeData } from "../../stores/NodeData";

const styles = () =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    },
    "& .dropzone": {
      width: "100%"
    },
    "& .url-input": {
      width: "100%"
    },
    "& .realtime-audio-controls": {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    "& .controls-row": {
      display: "flex",
      gap: "6px",
      alignItems: "center"
    },
    "& .sample-rate-input": {
      width: "80px",
      "& .MuiInputBase-input": {
        fontSize: "0.8em",
        padding: "6px 8px"
      }
    },
    "& .realtime-visualizer": {
      borderRadius: "4px",
      overflow: "hidden",
      background: "rgba(0, 0, 0, 0.4)"
    },
    "& .realtime-idle": {
      height: "140px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "4px",
      background: "rgba(0, 0, 0, 0.2)",
      border: "1px dashed rgba(255, 255, 255, 0.15)",
      color: "rgba(255, 255, 255, 0.4)",
      fontSize: "0.85em",
      cursor: "pointer",
      transition: "all 0.15s ease",
      "&:hover": {
        background: "rgba(0, 0, 0, 0.3)",
        borderColor: "rgba(255, 255, 255, 0.3)",
        color: "rgba(255, 255, 255, 0.6)"
      }
    }
  });

const AudioProperty = (props: PropertyProps) => {
  const id = `audio-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ audio: props.value });
  const showRecorder =
    props.nodeType === "nodetool.input.AudioInput" ||
    props.nodeType === "nodetool.constant.Audio";
  const isRealtime = props.nodeType === "nodetool.input.RealtimeAudioInput";
  // Use direct selector instead of object creation to avoid unnecessary re-renders
  const findNode = useNodes((state) => state.findNode);
  const rfNode = findNode(props.nodeId);
  const inputNodeName =
    ((rfNode?.data as NodeData | undefined)?.properties?.name as string) ||
    props.nodeId;
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const { isStreaming, toggle, stream, version } =
    useRealtimeAudioStream(inputNodeName, sampleRate);

  if (isRealtime) {
    return (
      <div className="audio-property" css={styles()}>
        <div className="realtime-audio-controls">
          {isStreaming ? (
            <div
              className="realtime-visualizer"
              aria-label="Realtime audio visualizer"
            >
              <AudioVisualizer
                stream={stream}
                version={version}
                height={140}
              />
            </div>
          ) : (
            <div className="realtime-idle" onClick={toggle}>
              Click to start microphone
            </div>
          )}
          <div className="controls-row">
            <TextField
              className="sample-rate-input"
              label="Hz"
              type="number"
              size="small"
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              disabled={isStreaming}
              inputProps={{
                min: 8000,
                max: 48000,
                step: 1000
              }}
            />
            <EditorButton
              size="small"
              variant={isStreaming ? "contained" : "outlined"}
              color={isStreaming ? "error" : "primary"}
              onClick={toggle}
              sx={{ flex: 1, minHeight: 36 }}
            >
              {isStreaming ? "Stop" : "Start Mic"}
            </EditorButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="audio-property" css={styles()}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <PropertyDropzone
        asset={asset}
        uri={uri || ""}
        onChange={props.onChange}
        contentType="audio"
        props={props}
        showRecorder={showRecorder}
      />
    </div>
  );
};

export default memo(AudioProperty, isEqual);
