/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo, useMemo, useState } from "react";
import isEqual from "fast-deep-equal";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { EditorButton, NodeTextField, MOTION, SPACING, BORDER_RADIUS, getSpacingPx } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import AudioVisualizer from "../common/AudioVisualizer";
import { useRealtimeAudioStream } from "../../hooks/useRealtimeAudioStream";
import type { NodeData } from "../../stores/NodeData";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: theme.spacing(SPACING.sm)
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
      gap: getSpacingPx(SPACING.sm)
    },
    "& .controls-row": {
      display: "flex",
      gap: getSpacingPx(SPACING.sm),
      alignItems: "center"
    },
    "& .sample-rate-input": {
      width: "80px",
      "& .MuiInputBase-input": {
        fontSize: "0.8em",
        padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`
      }
    },
    "& .realtime-visualizer": {
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      background: theme.vars.palette.c_scrim
    },
    "& .realtime-idle": {
      height: "140px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.c_scrim_soft,
      border: `1px dashed ${theme.vars.palette.c_overlay_strong}`,
      color: theme.vars.palette.text.disabled,
      fontSize: "0.85em",
      cursor: "pointer",
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        background: theme.vars.palette.c_scrim_soft,
        borderColor: theme.vars.palette.c_overlay_strong,
        color: theme.vars.palette.text.secondary
      }
    }
  });

const AudioProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
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
      <div className="audio-property" css={cssStyles}>
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
            <div
              role="button"
              tabIndex={0}
              className="realtime-idle"
              onClick={toggle}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
            >
              Click to start microphone
            </div>
          )}
          <div className="controls-row">
            <NodeTextField
              className="sample-rate-input"
              label="Hz"
              type="number"
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
    <div className="audio-property" css={cssStyles}>
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
