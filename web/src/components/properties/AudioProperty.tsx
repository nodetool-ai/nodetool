/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo, useState } from "react";
import isEqual from "lodash/isEqual";
import { Button, TextField } from "@mui/material";
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
      marginTop: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    "& .controls-row": {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    },
    "& .sample-rate-input": {
      width: "140px"
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
  const inputNodeName = (rfNode?.data as NodeData | undefined)?.properties?.name as
    | string
    | undefined;
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const { isStreaming, toggle, stream, version } =
    useRealtimeAudioStream(inputNodeName, sampleRate);

  // Visualizer moved to AudioVisualizer component
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
      {isRealtime && (
        <div className="realtime-audio-controls">
          <div className="controls-row">
            <TextField
              className="sample-rate-input"
              label="Sample Rate (Hz)"
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
            <Button size="small" variant="outlined" onClick={toggle}>
              {isStreaming ? "Stop Realtime" : "Realtime Mic"}
            </Button>
          </div>
          {isStreaming && (
            <div className="visualizer" aria-label="Realtime audio visualizer">
              <AudioVisualizer stream={stream} version={version} height={64} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(AudioProperty, isEqual);
