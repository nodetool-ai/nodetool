import React, { useCallback, ReactElement, memo } from "react";
import { useTranslation } from "react-i18next";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import RepeatIcon from "@mui/icons-material/Repeat";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexRow,
  SPACING,
  Slider,
  ToolbarIconButton,
  TYPOGRAPHY
} from "../ui_primitives";
import { getAudioDownloadFilename } from "../../utils/audioFormat";

interface AudioControlsProps {
  /** `normal` draws the larger controls of the asset viewer. */
  fontSize?: "normal" | "small" | "tiny" | undefined;
  isPlaying: boolean;
  zoom: number;
  currentTime?: number;
  duration?: number;
  filename?: string;
  assetUrl?: string;
  mimeType?: string;
  onPlayPause: () => void;
  onZoomChange: (value: number) => void;
  loop: boolean;
  setLoop: React.Dispatch<React.SetStateAction<boolean>>;
  mute: boolean;
  setMute: React.Dispatch<React.SetStateAction<boolean>>;
}

export const formatPlayerTime = (time: number): string => {
  const safe = Math.max(0, time);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = String(Math.floor(safe % 60)).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};

async function download(
  assetUrl: string,
  options: { filename?: string; mimeType?: string }
) {
  if (!assetUrl) {
    console.warn("No url provided for download");
    return;
  }

  try {
    const response = await fetch(assetUrl);

    if (!response.ok) {
      console.warn("Network response was not ok");
      return;
    }

    const blob = await response.blob();

    // What the transfer served beats what the player was told: a blob URL
    // carries the format its bytes were tagged with, and a stored asset
    // carries the backend's own content type.
    const filename = getAudioDownloadFilename({
      filename: options.filename,
      contentType: response.headers.get("content-type") || blob.type,
      mimeType: options.mimeType,
      url: assetUrl
    });

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Failed to download file:", error);
  }
}

/**
 * The control row under the waveform player: play, clock, zoom, loop, mute
 * and download. Narrow hosts (node previews, asset tiles) wrap the toggles
 * onto a second line instead of clipping them.
 */
const AudioControls: React.FC<AudioControlsProps> = memo(
  ({
    fontSize = "tiny",
    isPlaying = false,
    zoom,
    currentTime = 0,
    duration = 0,
    loop,
    setLoop,
    mute,
    setMute,
    filename,
    assetUrl,
    mimeType,
    onPlayPause,
    onZoomChange
  }): ReactElement | null => {
    const { t } = useTranslation();
    const large = fontSize === "normal";
    const buttonSize = large ? "medium" : "small";
    const iconSize = large ? "medium" : "small";

    const handleSliderChange = useCallback(
      (event: Event, newValue: number | number[]): void => {
        event.preventDefault();
        const value = Array.isArray(newValue) ? newValue[0] : newValue;
        onZoomChange(value);
      },
      [onZoomChange]
    );

    const handleToggleLoop = useCallback(() => {
      setLoop(!loop);
    }, [loop, setLoop]);

    const handleToggleMute = useCallback(() => {
      setMute(!mute);
    }, [mute, setMute]);

    const handleDownload = useCallback(() => {
      if (assetUrl) {
        download(assetUrl, { filename, mimeType });
      } else {
        console.warn("No assetUrl provided for download");
      }
    }, [assetUrl, filename, mimeType]);

    if (!assetUrl) {
      return null;
    }

    return (
      <FlexRow
        className="audio-controls nodrag"
        role="group"
        aria-label={t("batch2_15.audio.playbackControls")}
        align="center"
        wrap
        gap={large ? SPACING.md : SPACING.xs}
        sx={{ pt: large ? SPACING.md : SPACING.xs, rowGap: SPACING.micro }}
      >
        <ToolbarIconButton
          className="play-button"
          icon={
            isPlaying ? (
              <PauseIcon fontSize={iconSize} />
            ) : (
              <PlayArrowIcon fontSize={iconSize} />
            )
          }
          tooltip={isPlaying ? t("batch2_15.audio.pause") : t("batch2_15.audio.play")}
          tooltipPlacement="top"
          size={buttonSize}
          onClick={onPlayPause}
          sx={{
            borderRadius: BORDER_RADIUS.circle,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": {
              bgcolor: "primary.dark",
              color: "primary.contrastText"
            }
          }}
        />
        <Caption
          className="audio-time"
          color="secondary"
          sx={{
            ...(large ? TYPOGRAPHY.mono.label : TYPOGRAPHY.mono.caption),
            whiteSpace: "nowrap"
          }}
        >
          {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
        </Caption>
        <FlexRow
          className="audio-zoom"
          align="center"
          gap={SPACING.xs}
          sx={{
            flex: "1 1 0",
            minWidth: large ? 160 : 40,
            maxWidth: large ? 240 : 160,
            mx: SPACING.md,
            color: "text.secondary"
          }}
        >
          {large && <ZoomInIcon fontSize="small" aria-hidden />}
          <Slider
            aria-label={t("batch2_15.audio.zoom")}
            density="compact"
            value={zoom}
            min={1}
            max={100}
            step={1}
            onChange={handleSliderChange}
          />
        </FlexRow>
        <Box sx={{ flexGrow: 1 }} />
        <FlexRow align="center" gap={SPACING.micro}>
          <ToolbarIconButton
            className="loop-button"
            icon={<RepeatIcon fontSize={iconSize} />}
            tooltip={t("batch2_15.audio.loop")}
            tooltipPlacement="top"
            size={buttonSize}
            active={loop}
            aria-pressed={loop}
            onClick={handleToggleLoop}
          />
          <ToolbarIconButton
            className="mute-button"
            icon={
              mute ? (
                <VolumeOffOutlinedIcon fontSize={iconSize} />
              ) : (
                <VolumeUpOutlinedIcon fontSize={iconSize} />
              )
            }
            tooltip={t("batch2_15.audio.mute")}
            tooltipPlacement="top"
            size={buttonSize}
            active={mute}
            aria-pressed={mute}
            onClick={handleToggleMute}
          />
          <ToolbarIconButton
            className="download-audio-button"
            icon={<FileDownloadOutlinedIcon fontSize={iconSize} />}
            tooltip={t("batch2_15.audio.download")}
            tooltipPlacement="top"
            size={buttonSize}
            onClick={handleDownload}
          />
        </FlexRow>
      </FlexRow>
    );
  }
);

AudioControls.displayName = "AudioControls";

export default AudioControls;
