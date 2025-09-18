/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button, ButtonGroup } from "@mui/material";
import { Chunk } from "../../../stores/ApiTypes";
import { base64ToUint8Array, int16ToFloat32 } from "./audio";
import AudioVisualizer from "../../common/AudioVisualizer";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";

type Props = {
  chunks: Chunk[];
  sampleRate?: number;
  channels?: number;
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

// no-op helpers removed; we visualize via MediaStream destination

const RealtimeAudioOutput: React.FC<Props> = ({
  chunks,
  sampleRate = 22000,
  channels = 1
}) => {
  const theme = useTheme();
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lastIndexRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [visualizerVersion, setVisualizerVersion] = useState<number>(0);
  const workflowState = useWebsocketRunner((s) => s.state);

  // Initialize AudioContext and routing
  useEffect(() => {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    audioContextRef.current = ctx;
    const streamDest = ctx.createMediaStreamDestination();
    streamDestRef.current = streamDest;
    const gain = ctx.createGain();
    gainRef.current = gain;
    gain.connect(ctx.destination);
    gain.connect(streamDest);
    nextStartTimeRef.current = ctx.currentTime;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      sourcesRef.current.forEach((s) => {
        try {
          s.stop();
          s.disconnect();
        } catch (e) {
          console.debug("Source cleanup failed", e);
        }
      });
      sourcesRef.current = [];
      try {
        ctx.close();
      } catch (e) {
        console.debug("AudioContext close failed", e);
      }
      audioContextRef.current = null;
      streamDestRef.current = null;
      gainRef.current = null;
    };
  }, []);

  const scheduleChunk = useCallback(
    (base64: string) => {
      const ctx = audioContextRef.current;
      const gain = gainRef.current;
      if (!ctx || !gain || !base64) return;
      const u8 = base64ToUint8Array(base64);
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const frameCount = Math.floor(u8.byteLength / 2 / channels);
      const buffer = ctx.createBuffer(channels, frameCount, sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = new Int16Array(frameCount);
        let srcIndex = ch * 2;
        for (let i = 0; i < frameCount; i++) {
          const sample = view.getInt16(srcIndex, true);
          channelData[i] = sample;
          srcIndex += channels * 2;
        }
        const floatData = int16ToFloat32(channelData);
        buffer.copyToChannel(floatData, ch);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
      try {
        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;
      } catch (e) {
        console.debug(
          "BufferSource start with startTime failed, starting now",
          e
        );
        source.start();
        nextStartTimeRef.current = ctx.currentTime + buffer.duration;
      }
      source.onended = () => {
        try {
          source.disconnect();
        } catch (e) {
          console.debug("BufferSource disconnect failed", e);
        }
      };
      sourcesRef.current.push(source);
    },
    [channels, sampleRate]
  );

  // Schedule newly arrived chunks when playing
  useEffect(() => {
    if (!isPlaying) return;
    const audioChunks = chunks.filter(
      (c) => c?.content_type === "audio" && typeof c.content === "string"
    );
    for (let i = lastIndexRef.current; i < audioChunks.length; i++) {
      scheduleChunk(audioChunks[i].content as string);
    }
    lastIndexRef.current = audioChunks.length;
  }, [chunks, isPlaying, scheduleChunk]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
        s.disconnect();
      } catch (e) {
        console.debug("Source stop failed", e);
      }
    });
    sourcesRef.current = [];
    const ctx = audioContextRef.current;
    if (ctx) nextStartTimeRef.current = ctx.currentTime;
  }, []);

  const start = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    try {
      ctx.resume();
    } catch (e) {
      console.debug("AudioContext resume failed", e);
    }
    const audioChunks = chunks.filter((c) => c?.content_type === "audio");
    lastIndexRef.current = audioChunks.length;
    nextStartTimeRef.current = ctx.currentTime;
    setIsPlaying(true);
  }, [chunks]);

  const restart = useCallback(() => {
    stop();
    setVisualizerVersion((v) => v + 1);
    start();
  }, [start, stop]);

  const stream = streamDestRef.current ? streamDestRef.current.stream : null;

  // Stop playback automatically when workflow stops running
  useEffect(() => {
    if (workflowState !== "running" && isPlaying) {
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
