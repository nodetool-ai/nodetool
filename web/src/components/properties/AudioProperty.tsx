/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import { isEqual } from "lodash";
import { Button } from "@mui/material";
import { useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import AudioVisualizer from "../common/AudioVisualizer";
import { useRealtimeAudioStream } from "../../hooks/useRealtimeAudioStream";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    },
    "& .toggle-url-button": {
      top: "-2.5em",
      right: "0"
    },
    "& .dropzone": {
      width: "100%"
    },
    "& .url-input": {
      width: "100%"
    }
  });

const AudioProperty = (props: PropertyProps) => {
  const id = `audio-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ audio: props.value });
  const showRecorder =
    props.nodeType === "nodetool.input.AudioInput" ||
    props.nodeType === "nodetool.constant.Audio";
  const isRealtime = props.nodeType === "nodetool.input.RealtimeAudioInput";
  const theme = useTheme();
  const { findNode } = useNodes((state) => ({ findNode: state.findNode }));
  const rfNode = findNode(props.nodeId);
  const inputNodeName = (rfNode?.data as any)?.properties?.name as
    | string
    | undefined;
  const { isStreaming, toggle, stream, version } =
    useRealtimeAudioStream(inputNodeName);

  // Visualizer moved to AudioVisualizer component
  return (
    <div className="audio-property" css={styles(theme)}>
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
          <Button size="small" variant="outlined" onClick={toggle}>
            {isStreaming ? "Stop Realtime" : "Realtime Mic"}
          </Button>
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
