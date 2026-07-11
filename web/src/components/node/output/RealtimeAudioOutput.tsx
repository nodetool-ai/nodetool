/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  EditorButton,
  ButtonGroup,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { Chunk } from "../../../stores/ApiTypes";
import AudioVisualizer from "../../common/AudioVisualizer";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import { useRealtimeAudioPlayback } from "../../../hooks/browser/useRealtimeAudioPlayback";

type Props = {
  /**
   * Buffer accessor + change signal instead of the array itself: large chunk
   * arrays passed as props get deep-serialized per commit by react-dom's
   * dev performance instrumentation (see useRealtimeAudioPlayback).
   */
  getChunks: () => Chunk[];
  chunksVersion: number;
  sampleRate?: number;
  channels?: number;
  nodeId?: string;
  /** Live-monitoring mode: bound scheduling lead, drop stale chunks. */
  live?: boolean;
};

const styles = (theme: Theme) =>
  css({
    ".controls": {
      display: "flex",
      gap: "0.5em",
      marginBottom: getSpacingPx(SPACING.sm)
    },
    ".time": {
      color: theme.vars.palette.grey[300],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      marginBottom: getSpacingPx(SPACING.xs)
    }
  });

const RealtimeAudioOutput: React.FC<Props> = ({
  getChunks,
  chunksVersion,
  sampleRate = 22000,
  channels = 1,
  nodeId,
  live = false
}) => {
  const theme = useTheme();
  const workflowState = useWebsocketRunner((s) => s.state);

  const {
    isPlaying,
    isQueued,
    queuePosition,
    start,
    stop,
    restart,
    stream,
    visualizerVersion
  } = useRealtimeAudioPlayback({
    getChunks,
    chunksVersion,
    sampleRate,
    channels,
    nodeId,
    live
  });

  React.useEffect(() => {
    if (workflowState !== "running" && workflowState !== "idle" && isPlaying) {
      stop();
    }
  }, [workflowState, isPlaying, stop]);

  return (
    <div css={styles(theme)}>
      <div className="controls">
        <ButtonGroup size="small">
          <EditorButton onClick={isPlaying ? stop : start}>
            {isPlaying ? "Stop" : "Start"}
          </EditorButton>
          <EditorButton onClick={restart}>Restart</EditorButton>
        </ButtonGroup>
        {isQueued && queuePosition !== null && (
          <div className="time">Queue position: {queuePosition}</div>
        )}
      </div>
      <AudioVisualizer
        stream={stream}
        version={visualizerVersion}
        height={64}
      />
    </div>
  );
};

export default React.memo(RealtimeAudioOutput);

/**
 * Adapter for call sites that hold a plain chunk array (e.g. OutputRenderer's
 * preview of a completed stream). Converts to the getter+version contract so
 * the array stops at this boundary instead of flowing further down the tree.
 */
export const RealtimeAudioOutputFromChunks: React.FC<
  Omit<Props, "getChunks" | "chunksVersion"> & { chunks: Chunk[] }
> = ({ chunks, ...rest }) => {
  const chunksRef = useRef<Chunk[]>(chunks);
  const versionRef = useRef(0);
  if (chunksRef.current !== chunks) {
    chunksRef.current = chunks;
    versionRef.current++;
  }
  const getChunks = useCallback(() => chunksRef.current, []);
  return (
    <RealtimeAudioOutput
      getChunks={getChunks}
      chunksVersion={versionRef.current}
      {...rest}
    />
  );
};
