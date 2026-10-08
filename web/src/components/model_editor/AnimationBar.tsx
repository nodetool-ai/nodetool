import { memo, useCallback, useEffect, useRef, useState } from "react";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";

import {
  Caption,
  FlexRow,
  SelectField,
  Slider,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
import type { AnimationPreview } from "./animationPreview";

interface AnimationBarProps {
  preview: AnimationPreview;
  /** Called when the preview starts or stops changing the scene. */
  onActiveChange: (active: boolean) => void;
  className?: string;
}

const formatSeconds = (seconds: number): string => seconds.toFixed(2);

/**
 * Play, pause and scrub the model's glTF animation clips. Stop returns every
 * object to the pose it had before playback, which is the pose that is saved.
 */
const AnimationBar = ({ preview, onActiveChange, className }: AnimationBarProps) => {
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [active, setActive] = useState(false);

  const activate = useCallback(() => {
    if (!preview.isActive()) {
      preview.select(clipIndex);
      setActive(true);
      onActiveChange(true);
    }
  }, [preview, clipIndex, onActiveChange]);

  const stop = useCallback(() => {
    preview.stop();
    setPlaying(false);
    setTime(0);
    setActive(false);
    onActiveChange(false);
  }, [preview, onActiveChange]);

  // A new model brings a new preview: reset to its first clip.
  useEffect(() => {
    setClipIndex(0);
    setPlaying(false);
    setTime(0);
    setActive(false);
    return () => preview.stop();
  }, [preview]);

  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setTime(preview.advance(delta));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    };
  }, [playing, preview]);

  const togglePlay = useCallback(() => {
    activate();
    setPlaying((p) => !p);
  }, [activate]);

  const scrub = useCallback(
    (_event: Event, value: number | number[]) => {
      const seconds = Array.isArray(value) ? value[0] : value;
      activate();
      preview.setTime(seconds);
      setTime(seconds);
    },
    [activate, preview]
  );

  const changeClip = useCallback(
    (value: string) => {
      const index = Number(value);
      setClipIndex(index);
      if (preview.isActive()) {
        preview.select(index);
        setTime(preview.time());
      }
    },
    [preview]
  );

  const clip = preview.clips[clipIndex];
  const duration = clip?.duration ?? 0;

  return (
    <FlexRow className={className} align="center" gap={SPACING.sm}>
      <MovieOutlinedIcon fontSize="small" color="action" />
      <ToolbarIconButton
        icon={playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        tooltip={playing ? "Pause animation" : "Play animation"}
        onClick={togglePlay}
        size="small"
      />
      <ToolbarIconButton
        icon={<StopIcon fontSize="small" />}
        tooltip="Stop and return to the rest pose"
        onClick={stop}
        disabled={!active}
        size="small"
      />
      {preview.clips.length > 1 ? (
        <SelectField
          label="Clip"
          hideLabel
          size="small"
          appearance="inspector"
          value={String(clipIndex)}
          onChange={changeClip}
          options={preview.clips.map((c, i) => ({
            value: String(i),
            label: c.name || `Clip ${i + 1}`
          }))}
        />
      ) : (
        <Caption>{clip?.name || "Animation"}</Caption>
      )}
      <Slider
        density="compact"
        aria-label="Animation time"
        min={0}
        max={duration || 1}
        step={0.01}
        value={Math.min(time, duration)}
        onChange={scrub}
        sx={{ flex: 1, minWidth: 120 }}
      />
      <Caption sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {formatSeconds(time)} / {formatSeconds(duration)} s
      </Caption>
    </FlexRow>
  );
};

export default memo(AnimationBar);
