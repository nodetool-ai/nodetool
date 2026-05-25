/** @jsxImportSource @emotion/react */
/**
 * VideoPlayer
 *
 * Embeddable video player with custom controls — play/pause, seek,
 * timestamp readout, and playback-speed selector. Used by ContentCardBody
 * (video variant) and anywhere else a compact in-node video preview is needed.
 *
 * Controls auto-hide after a short delay of mouse inactivity over the surface
 * and re-appear on hover/movement.
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { IconButton } from "@mui/material";

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
const CONTROLS_HIDE_DELAY_MS = 1800;

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) {return "0:00";}
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const styles = (theme: Theme, controlsVisible: boolean) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.common.black,
    overflow: "hidden",
    borderRadius: "var(--rounded-sm)",
    video: {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "contain"
    },
    ".controls": {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "6px 8px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      background:
        "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
      color: theme.vars.palette.common.white,
      opacity: controlsVisible ? 1 : 0,
      transition: "opacity 0.2s ease",
      pointerEvents: controlsVisible ? "auto" : "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall
    },
    ".play-button": {
      width: 28,
      height: 28,
      padding: 0,
      color: theme.vars.palette.common.white,
      "& svg": { fontSize: 20 },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.14)"
      }
    },
    ".seek": {
      flex: 1,
      height: 4,
      appearance: "none",
      background: "rgba(255, 255, 255, 0.25)",
      borderRadius: 2,
      cursor: "pointer",
      "&::-webkit-slider-thumb": {
        appearance: "none",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        cursor: "pointer"
      },
      "&::-moz-range-thumb": {
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        border: "none",
        cursor: "pointer"
      }
    },
    ".timestamp": {
      fontVariantNumeric: "tabular-nums",
      minWidth: 70,
      textAlign: "right",
      opacity: 0.9
    },
    ".speed-select": {
      appearance: "none",
      background: "rgba(255, 255, 255, 0.1)",
      color: theme.vars.palette.common.white,
      border: `1px solid rgba(255, 255, 255, 0.2)`,
      borderRadius: 4,
      padding: "2px 6px",
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily1,
      cursor: "pointer",
      "&:hover": {
        background: "rgba(255, 255, 255, 0.18)"
      }
    }
  });

export interface VideoPlayerProps {
  /** Video source URL */
  src: string;
  /** Optional poster image */
  poster?: string;
  /** Autoplay (typically requires muted=true to satisfy browser policies) */
  autoplay?: boolean;
  /** Loop playback */
  loop?: boolean;
  /** Start muted */
  muted?: boolean;
  /** Called on every timeupdate with currentTime in seconds */
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

const VideoPlayerInner: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  autoplay = false,
  loop = false,
  muted = false,
  onTimeUpdate,
  className
}) => {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) {clearTimeout(hideTimerRef.current);}
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) {clearTimeout(hideTimerRef.current);}
    },
    []
  );

  const handleTogglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) {return;}
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {setDuration(videoRef.current.duration);}
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) {return;}
    setCurrentTime(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  }, [onTimeUpdate]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) {return;}
    const newTime = Number(e.target.value);
    v.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSpeed = Number(e.target.value);
      setSpeed(newSpeed);
      if (videoRef.current) {videoRef.current.playbackRate = newSpeed;}
    },
    []
  );

  const cssStyles = useMemo(
    () => styles(theme, controlsVisible),
    [theme, controlsVisible]
  );

  return (
    <div
      css={cssStyles}
      className={`video-player ${className ?? ""}`}
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onMouseLeave={() => setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        playsInline
        onPlay={handlePlay}
        onPause={handlePause}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleVideoTimeUpdate}
        onClick={handleTogglePlay}
      />
      <div className="controls">
        <IconButton
          className="play-button"
          size="small"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <input
          type="range"
          className="seek"
          min={0}
          max={duration || 0}
          step={0.05}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Seek"
        />
        <span className="timestamp">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <select
          className="speed-select"
          value={speed}
          onChange={handleSpeedChange}
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export const VideoPlayer = memo(VideoPlayerInner);
VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
