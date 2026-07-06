/** @jsxImportSource @emotion/react */
/**
 * ExtractVideoFrameBody — bespoke body for `nodetool.video.ExtractFrame`.
 *
 * Top: a realtime video preview. The frame currently shown in the `<video>`
 * element IS the frame the node will extract — scrubbing the timeline, stepping
 * frame-by-frame, or typing a frame number seeks the preview and writes the
 * node's `time` (seconds) property, so the editor preview and the extracted
 * output stay in lockstep.
 *
 * Bottom: transport controls (step / play / mute) and a Frame + Timecode
 * footer. Frame is the editable extraction selector; Timecode mirrors it
 * read-only (SMPTE-style HH:MM:SS:FF derived from the detected frame rate).
 *
 * Frame rate is estimated from `requestVideoFrameCallback` presentation deltas
 * during playback (default 30fps until refined); the extracted point itself is
 * always stored in seconds, so the frame number is purely a UI convenience.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import MovieIcon from "@mui/icons-material/Movie";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";

import {
  CheckerDropzone,
  ToolbarIconButton,
  BORDER_RADIUS
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import NumberInput from "../../inputs/NumberInput";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useUpstreamValue } from "../../../hooks/nodes/useNodeIO";
import { useMediaSrc } from "../../../hooks/nodes/useMediaSrc";

export const EXTRACT_VIDEO_FRAME_NODE_TYPE = "nodetool.video.ExtractFrame";

const DEFAULT_FPS = 30;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const frameOf = (seconds: number, fps: number): number =>
  Math.max(0, Math.round(seconds * fps));

/** SMPTE-style timecode: HH:MM:SS:FF (hours dropped when zero). */
const formatTimecode = (seconds: number, fps: number): string => {
  if (!isFinite(seconds) || seconds < 0) {
    return "00:00:00";
  }
  const totalFrames = frameOf(seconds, fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hh > 0
    ? `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(frames)}`
    : `${pad(mm)}:${pad(ss)}:${pad(frames)}`;
};

/**
 * `requestVideoFrameCallback` surface — feature-detected and cast locally so we
 * don't depend on its presence in the ambient DOM lib typings.
 */
interface VideoFrameMeta {
  mediaTime: number;
}
type VideoFrameCallback = (now: number, metadata: VideoFrameMeta) => void;
interface RVFCVideo {
  requestVideoFrameCallback?: (cb: VideoFrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

const styles = (theme: Theme) =>
  css({
    "&.extract-video-frame-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: theme.spacing(0)
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 140,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.common.black,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".preview-area video": {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      cursor: "pointer"
    },
    ".scrubber": {
      flex: "0 0 auto",
      width: "100%",
      height: 4,
      appearance: "none",
      background: theme.vars.palette.grey[700],
      borderRadius: BORDER_RADIUS.xs,
      cursor: "pointer",
      margin: `${theme.spacing(0.25)} 0`,
      "&::-webkit-slider-thumb": {
        appearance: "none",
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        cursor: "pointer"
      },
      "&::-moz-range-thumb": {
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        border: "none",
        cursor: "pointer"
      }
    },
    ".transport": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".time-display": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.grey[200],
      whiteSpace: "nowrap"
    },
    ".transport-buttons": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.25),
      margin: "0 auto"
    },
    ".footer": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      paddingTop: theme.spacing(0.25)
    },
    ".field": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      minWidth: 0
    },
    ".field-label": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 0.4
    },
    ".frame-field": {
      width: 76
    },
    ".timecode-readout": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.grey[100],
      padding: `${theme.spacing(0.25)} ${theme.spacing(0.75)}`,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

export interface ExtractVideoFrameBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ExtractVideoFrameBodyInner: React.FC<ExtractVideoFrameBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const properties = nodeMetadata.properties ?? [];
  const videoProperty = useMemo(
    () => properties.filter((p) => p.name === "video"),
    [properties]
  );

  const videoValue = useUpstreamValue(
    workflowId,
    id,
    "video",
    data.properties?.video
  );
  const videoSrc = useMediaSrc(videoValue, "video");

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  // Latest stored extraction point — read on metadata load to position the
  // preview without re-running this effect on every keystroke.
  const storedTime = Number(data.properties?.time ?? 0) || 0;
  const storedTimeRef = useRef(storedTime);
  storedTimeRef.current = storedTime;

  const [currentTime, setCurrentTime] = useState(storedTime);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fps, setFps] = useState(DEFAULT_FPS);

  // Estimate frame rate from presentation-time deltas while frames advance.
  const fpsSamplesRef = useRef<{ last: number; deltas: number[] }>({
    last: -1,
    deltas: []
  });
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & RVFCVideo) | null;
    if (!video || typeof video.requestVideoFrameCallback !== "function") {
      return;
    }
    fpsSamplesRef.current = { last: -1, deltas: [] };
    let cancelled = false;
    let handle = 0;
    const onFrame: VideoFrameCallback = (_now, metadata) => {
      const sample = fpsSamplesRef.current;
      const prev = sample.last;
      sample.last = metadata.mediaTime;
      if (prev >= 0) {
        const dt = metadata.mediaTime - prev;
        if (dt > 0.005 && dt < 0.2) {
          sample.deltas.push(dt);
          if (sample.deltas.length > 12) {
            sample.deltas.shift();
          }
          const sorted = [...sample.deltas].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const estimate = Math.round(1 / median);
          if (estimate >= 1 && estimate <= 240) {
            setFps((current) => (current === estimate ? current : estimate));
          }
        }
      }
      if (!cancelled) {
        handle = video.requestVideoFrameCallback!(onFrame);
      }
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => {
      cancelled = true;
      video.cancelVideoFrameCallback?.(handle);
    };
  }, [videoSrc]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const max = video.duration || 0;
    const next = clamp(time, 0, max || time);
    video.currentTime = next;
    setCurrentTime(next);
  }, []);

  const commit = useCallback(
    (time: number) => {
      setProperty("time", time);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  // Commit the live position straight off the element, so drag-end / blur
  // handlers don't depend on the `currentTime` state having flushed yet.
  const commitCurrent = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      commit(video.currentTime);
    }
  }, [commit]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setDuration(video.duration || 0);
    const start = clamp(storedTimeRef.current, 0, video.duration || 0);
    video.currentTime = start;
    setCurrentTime(start);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    const video = videoRef.current;
    // Pausing fixes the extraction point at the frame the user landed on.
    if (video) {
      commit(video.currentTime);
    }
  }, [commit]);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      seekTo(next);
      // setProperty debounces the auto-run; the final value is committed on
      // pointer release below.
      setProperty("time", next);
    },
    [seekTo, setProperty]
  );

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      if (!video.paused) {
        video.pause();
      }
      const next = clamp(
        video.currentTime + direction / fps,
        0,
        video.duration || video.currentTime
      );
      seekTo(next);
      commit(next);
    },
    [fps, seekTo, commit]
  );

  const handleFrameChange = useCallback(
    (value: number) => {
      seekTo(value / fps);
      setProperty("time", value / fps);
    },
    [fps, seekTo, setProperty]
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  }, []);

  const isRunning = status === "running";
  const frame = frameOf(currentTime, fps);
  const maxFrame = frameOf(duration, fps);

  return (
    <div
      css={cssStyles}
      className="extract-video-frame-body"
      data-bespoke-body="ExtractVideoFrame"
    >
      <HandleColumn id={id} properties={videoProperty} />

      <div className="preview-area">
        {videoSrc ? (
          <video
            ref={videoRef}
            className="nodrag nopan"
            src={videoSrc}
            muted={muted}
            playsInline
            aria-label="Video frame preview"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onClick={handleTogglePlay}
          />
        ) : (
          <CheckerDropzone
            message="Connect a video"
            icon={<MovieIcon />}
          />
        )}
      </div>

      <input
        type="range"
        className="scrubber nodrag nopan"
        min={0}
        max={duration || 0}
        step={0.01}
        value={currentTime}
        onChange={handleScrub}
        onPointerUp={commitCurrent}
        disabled={!videoSrc}
        aria-label="Seek video"
      />

      <div className="transport">
        <span className="time-display">
          {formatTimecode(currentTime, fps)} / {formatTimecode(duration, fps)}
        </span>
        <div className="transport-buttons">
          <ToolbarIconButton
            icon={<SkipPreviousIcon />}
            tooltip="Previous frame"
            ariaLabel="Previous frame"
            disabled={!videoSrc}
            onClick={() => stepFrame(-1)}
          />
          <ToolbarIconButton
            icon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            tooltip={isPlaying ? "Pause" : "Play"}
            ariaLabel={isPlaying ? "Pause" : "Play"}
            disabled={!videoSrc}
            onClick={handleTogglePlay}
          />
          <ToolbarIconButton
            icon={<SkipNextIcon />}
            tooltip="Next frame"
            ariaLabel="Next frame"
            disabled={!videoSrc}
            onClick={() => stepFrame(1)}
          />
        </div>
        <ToolbarIconButton
          icon={muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
          tooltip={muted ? "Unmute" : "Mute"}
          ariaLabel={muted ? "Unmute" : "Mute"}
          disabled={!videoSrc}
          onClick={handleToggleMute}
        />
      </div>

      <div className="footer">
        <div className="field">
          <span className="field-label">Frame</span>
          <div className="frame-field">
            <NumberInput
              id={`extract-frame-${id}`}
              nodeId={id}
              name="frame"
              description="Frame to extract"
              value={frame}
              onChange={(_, v) => handleFrameChange(Math.round(v))}
              onChangeComplete={commitCurrent}
              min={0}
              max={maxFrame > 0 ? maxFrame : undefined}
              inputType="int"
              showSlider={false}
              hideLabel
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">Timecode</span>
          <span className="timecode-readout">
            {formatTimecode(currentTime, fps)}
          </span>
        </div>
      </div>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {isRunning && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ExtractVideoFrameBody = memo(ExtractVideoFrameBodyInner);
ExtractVideoFrameBody.displayName = "ExtractVideoFrameBody";

export default ExtractVideoFrameBody;
