/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

import React, { useCallback, ReactElement } from "react";
import { Text, ToolbarIconButton } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import SliderBasic from "../inputs/SliderBasic";
import LoopIcon from "@mui/icons-material/Loop";
import { PlaybackButton } from "../ui_primitives/PlaybackButton";
import OffIcon from "@mui/icons-material/VolumeOff";
import UpIcon from "@mui/icons-material/VolumeUp";
import DownloadIcon from "@mui/icons-material/Download";
import { ActionButtonGroup } from "../ui_primitives/ActionButtonGroup";
import type { Theme } from "@mui/material/styles";

interface AudioControlsProps {
  fontSize?: "normal" | "small" | "tiny" | undefined;
  isPlaying: boolean;
  zoom: number;
  filename?: string;
  assetUrl?: string;
  onPlayPause: () => void;
  onZoomChange: (value: number) => void;
  loop: boolean;
  setLoop: React.Dispatch<React.SetStateAction<boolean>>;
  mute: boolean;
  setMute: React.Dispatch<React.SetStateAction<boolean>>;
}

interface ZoomProps {
  fontSize?: "normal" | "small" | "tiny" | undefined;
  zoom: number;
  onSliderChange: (
    event: Event,
    newValue: number | number[],
    activeThumb: number
  ) => void;
}

const styles = (theme: Theme) =>
  css({
    button: {
      width: "25px !important",
      height: "25px !important",
      marginLeft: "0",
      padding: ".1em",
      transition: "border",
      color: theme.vars.palette.grey[100],
      backgroundColor: theme.vars.palette.grey[900]
    },
    "button:hover": {
      backgroundColor: "transparent"
    },
    "button svg": {
      width: "0.7em",
      height: "0.7em",
      opacity: "1"
    },
    ".play-button svg": {
      width: "0.8em",
      height: "0.8em"
    },
    ".loop-button.disabled svg": {
      transition: "opacity 0.1s",
      opacity: "0.5"
    },
    ".mute-button svg": {
      transition: "opacity 0.1s",
      opacity: "0.5"
    },
    ".mute-button.disabled svg": {
      opacity: "1"
    },
    ".normal": {
      fontSize: theme.fontSizeNormal
    },
    ".small": {
      fontSize: theme.fontSizeSmall
    },
    ".tiny": {
      fontSize: theme.fontSizeTiny
    },
    ".zoom": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1em"
    },
    ".zoom-slider": {
      flexGrow: 1
    }
  });

const Zoom: React.FC<ZoomProps> = ({
  zoom,
  onSliderChange,
  fontSize
}): ReactElement => (
  <div className="zoom nodrag" style={{ position: "relative" }}>
    <Text id="zoom" className="slider-value">
      <span className={`${fontSize}`}>ZOOM: </span>
      <span className={`${fontSize} value`} style={{ marginTop: "5px" }}>
        {zoom}
      </span>
    </Text>
    <SliderBasic
      className="zoom-slider nodrag"
      value={zoom}
      min={1}
      max={100}
      step={1}
      size="small"
      color="secondary"
      aria-labelledby="discrete-slider"
      valueLabelDisplay="off"
      onChange={onSliderChange}
    />
  </div>
);

async function download(filename: string, assetUrl: string) {
  if (!assetUrl) {
    console.warn("No url provided for download");
    return;
  }

  try {
    // fetch file from server
    const response = await fetch(assetUrl);

    if (!response.ok) {
      console.warn("Network response was not ok");
      return;
    }

    // create a blob from the response
    const blob = await response.blob();

    // create a download link and click it
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();

    // clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Failed to download file:", error);
  }
}

const AudioControls: React.FC<AudioControlsProps> = ({
  fontSize = "tiny",
  isPlaying = false,
  zoom,
  loop,
  setLoop,
  mute,
  setMute,
  filename,
  assetUrl,
  onPlayPause,
  onZoomChange
}): ReactElement => {
  const theme = useTheme();
  const handleSliderChange = useCallback(
    (event: Event, newValue: number | number[], _activeThumb: number): void => {
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
      download(filename || "audio.mp3", assetUrl);
    } else {
      console.warn("No assetUrl provided for download");
    }
  }, [assetUrl, filename]);

  return (
    <div
      css={styles(theme)}
      className="audio-controls"
      style={{ position: "relative" }}
    >
      {assetUrl && (
        <div className="controls">
          <Zoom
            zoom={zoom}
            fontSize={fontSize}
            onSliderChange={handleSliderChange}
          />
          <ActionButtonGroup
            className="buttons"
            spacing={0}
            aria-label="Playback controls"
          >
            <PlaybackButton
              state={isPlaying ? "playing" : "stopped"}
              onPlay={onPlayPause}
              onPause={onPlayPause}
              playbackAction="toggle"
              buttonSize="small"
              nodrag
              className="play-button"
            />
            <ToolbarIconButton
              tooltip="Loop"
              delay={TOOLTIP_ENTER_DELAY}
              className={`loop-button${loop ? "" : " disabled"}`}
              size="small"
              onClick={handleToggleLoop}
              icon={<LoopIcon />}
              nodrag={false}
            />
            <ToolbarIconButton
              tooltip="Mute"
              delay={TOOLTIP_ENTER_DELAY}
              className={`mute-button${mute ? "" : " disabled"}`}
              size="small"
              onClick={handleToggleMute}
              icon={mute ? <OffIcon /> : <UpIcon />}
              nodrag={false}
            />
            <ToolbarIconButton
              tooltip="Download"
              delay={TOOLTIP_ENTER_DELAY}
              className={`download-audio-button${filename !== "" ? "" : " disabled"}`}
              size="small"
              onClick={handleDownload}
              icon={<DownloadIcon />}
              nodrag={false}
            />
          </ActionButtonGroup>
        </div>
      )}
    </div>
  );
};

export default AudioControls;
