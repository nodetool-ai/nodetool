/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button, ButtonGroup } from "@mui/material";
import { Chunk } from "../../../stores/ApiTypes";
import AudioVisualizer from "../../common/AudioVisualizer";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import { useRealtimeAudioPlayback } from "../../../hooks/browser/useRealtimeAudioPlayback";

type Props = {
  chunks: Chunk[];
  sampleRate?: number;
  channels?: number;
  nodeId?: string;
};

const styles = (theme: Theme) =>
  css({
    ".controls": {
      display: "flex",
      gap: "0.5em",
      marginBottom: "6px"
    },
    ".time": {
      color: theme.vars.palette.grey[300],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      marginBottom: "4px"
    }
  });

const RealtimeAudioOutput: React.FC<Props> = ({
  chunks,
  sampleRate = 22000,
  channels = 1,
  nodeId
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
    chunks,
    sampleRate,
    channels,
    nodeId
  });

  // Stop playback when workflow stops
  React.useEffect(() => {
    if (workflowState !== "running" && workflowState !== "idle" && isPlaying) {
      stop();
    }
  }, [workflowState, isPlaying, stop]);

  return (
    <div css={styles(theme)}>
      <div className="controls">
        <ButtonGroup size="small">
          <Button onClick={isPlaying ? stop : start}>
            {isPlaying ? "Stop" : "Start"}
          </Button>
          <Button onClick={restart}>Restart</Button>
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
