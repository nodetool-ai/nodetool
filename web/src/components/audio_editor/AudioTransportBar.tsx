import {
  memo,
  useCallback,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import RepeatIcon from "@mui/icons-material/Repeat";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenOutlinedIcon from "@mui/icons-material/FitScreenOutlined";

import {
  Box,
  Caption,
  CONTROL,
  FlexRow,
  SPACING,
  Slider,
  Text,
  Toolbar,
  ToolbarIconButton,
  TYPOGRAPHY
} from "../ui_primitives";
import { isNumber } from "../../utils/typePredicates";
import type { PlayheadStore } from "./playheadStore";
import { formatEditorTime } from "./formatEditorTime";

interface AudioTransportBarProps {
  isPlaying: boolean;
  loop: boolean;
  playhead: PlayheadStore;
  duration: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Selection readout, hint, or error shown between transport and zoom. */
  status: ReactNode;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomChange: (zoom: number) => void;
}

const ZOOM_SLIDER_MAX = 100;

const zoomToSliderValue = (zoom: number, minZoom: number, maxZoom: number) => {
  const minLog = Math.log(minZoom);
  const maxLog = Math.log(maxZoom);
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, zoom));
  return (
    ((Math.log(clampedZoom) - minLog) / (maxLog - minLog)) * ZOOM_SLIDER_MAX
  );
};

const sliderValueToZoom = (
  sliderValue: number,
  minZoom: number,
  maxZoom: number
) => {
  const minLog = Math.log(minZoom);
  const maxLog = Math.log(maxZoom);
  const ratio = sliderValue / ZOOM_SLIDER_MAX;
  return Math.exp(minLog + ratio * (maxLog - minLog));
};

/** The only editor text that updates during playback. */
const PlaybackClock = memo(function PlaybackClock({
  playhead,
  duration
}: {
  playhead: PlayheadStore;
  duration: number;
}) {
  const { t } = useTranslation();
  const seconds = useSyncExternalStore(
    playhead.subscribe,
    playhead.get,
    playhead.get
  );
  return (
    <FlexRow
      align="baseline"
      gap={SPACING.xs}
      aria-label={t("batch2_16.transport.playbackPosition")}
      sx={{ whiteSpace: "nowrap" }}
    >
      <Text size="small" family="secondary" weight={500}>
        {formatEditorTime(seconds)}
      </Text>
      <Caption color="secondary" sx={TYPOGRAPHY.mono.caption}>
        / {formatEditorTime(duration)}
      </Caption>
    </FlexRow>
  );
});

/**
 * The bar under the waveform: transport and clock on the left, the selection
 * readout in the middle, zoom on the right.
 */
const AudioTransportBar = memo(function AudioTransportBar({
  isPlaying,
  loop,
  playhead,
  duration,
  zoom,
  minZoom,
  maxZoom,
  status,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomChange
}: AudioTransportBarProps) {
  const { t } = useTranslation();
  const handleZoomSliderChange = useCallback(
    (_event: Event, value: number | number[]) => {
      if (isNumber(value)) {
        onZoomChange(sliderValueToZoom(value, minZoom, maxZoom));
      }
    },
    [maxZoom, minZoom, onZoomChange]
  );

  return (
    <Toolbar
      position="bottom"
      sx={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        columnGap: SPACING.lg,
        py: SPACING.xs
      }}
    >
      <FlexRow align="center" gap={SPACING.md}>
        <FlexRow
          role="group"
          aria-label={t("batch2_16.transport.transport")}
          align="center"
          gap={SPACING.micro}
          sx={{
            p: SPACING.micro,
            borderRadius: CONTROL.radius,
            bgcolor: "action.hover",
            border: 1,
            borderColor: "divider"
          }}
        >
          <ToolbarIconButton
            icon={<StopIcon fontSize="small" />}
            tooltip={t("batch2_16.transport.stop")}
            tooltipPlacement="top"
            onClick={onStop}
          />
          <ToolbarIconButton
            icon={
              isPlaying ? (
                <PauseIcon fontSize="small" />
              ) : (
                <PlayArrowIcon fontSize="small" />
              )
            }
            tooltip={isPlaying ? t("batch2_16.transport.pause") : t("batch2_16.transport.play")}
            tooltipPlacement="top"
            onClick={onTogglePlay}
            sx={{
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": {
                bgcolor: "primary.dark",
                color: "primary.contrastText"
              }
            }}
          />
          <ToolbarIconButton
            icon={<RepeatIcon fontSize="small" />}
            tooltip={loop ? t("batch2_16.transport.loopOn") : t("batch2_16.transport.loopOff")}
            ariaLabel={t("batch2_16.transport.loop")}
            tooltipPlacement="top"
            active={loop}
            aria-pressed={loop}
            onClick={onToggleLoop}
          />
        </FlexRow>
        <PlaybackClock playhead={playhead} duration={duration} />
      </FlexRow>

      <FlexRow align="center" justify="center" sx={{ minWidth: 0 }}>
        {status}
      </FlexRow>

      <FlexRow role="group" aria-label={t("batch2_16.transport.zoom")} align="center" gap={SPACING.micro}>
        <ToolbarIconButton
          icon={<ZoomOutIcon fontSize="small" />}
          tooltip={t("batch2_16.transport.zoomOut")}
          tooltipPlacement="top"
          onClick={onZoomOut}
          disabled={zoom <= minZoom}
        />
        <Box sx={{ width: 96, mx: SPACING.xs }}>
          <Slider
            aria-label={t("batch2_16.transport.waveformZoom")}
            density="compact"
            value={zoomToSliderValue(zoom, minZoom, maxZoom)}
            min={0}
            max={ZOOM_SLIDER_MAX}
            step={1}
            onChange={handleZoomSliderChange}
          />
        </Box>
        <ToolbarIconButton
          icon={<ZoomInIcon fontSize="small" />}
          tooltip={t("batch2_16.transport.zoomIn")}
          tooltipPlacement="top"
          onClick={onZoomIn}
          disabled={zoom >= maxZoom}
        />
        <ToolbarIconButton
          icon={<FitScreenOutlinedIcon fontSize="small" />}
          tooltip={t("batch2_16.transport.fit")}
          tooltipPlacement="top"
          onClick={onZoomFit}
          disabled={zoom === minZoom}
        />
        <Caption
          color="secondary"
          sx={{
            minWidth: CONTROL.height.xl,
            textAlign: "right",
            ...TYPOGRAPHY.mono.caption
          }}
        >
          {Math.round(zoom * 100)}%
        </Caption>
      </FlexRow>
    </Toolbar>
  );
});

export default AudioTransportBar;
