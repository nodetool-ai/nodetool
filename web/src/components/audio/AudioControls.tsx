/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, ReactElement } from "react";
import { Typography, Button, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import SliderBasic from "../inputs/SliderBasic";
import PlayIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import LoopIcon from "@mui/icons-material/Loop";
import OffIcon from "@mui/icons-material/VolumeOff";
import UpIcon from "@mui/icons-material/VolumeUp";
import DownloadIcon from "@mui/icons-material/Download";
import log from "loglevel";

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

const styles = (theme: any) =>
  css({
    button: {
      width: "25px !important",
      height: "25px !important",
      marginLeft: "0",
      padding: "10px",
      transition: "border",
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray0
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
    }
  });

const Zoom: React.FC<ZoomProps> = ({
  zoom,
  onSliderChange,
  fontSize
}): ReactElement => (
  <div className="zoom nodrag" style={{ position: "relative" }}>
    <Typography id="zoom" className="slider-value">
      <span className={`${fontSize}`}>ZOOM: </span>
      <span className={`${fontSize} value`} style={{ marginTop: "5px" }}>
        {zoom}
      </span>
    </Typography>
    <SliderBasic
      value={zoom}
      min={1}
      max={100}
      step={1}
      size="small"
      color="secondary"
      className="nodrag"
      aria-labelledby="discrete-slider"
      valueLabelDisplay="off"
      onChange={onSliderChange}
    />
  </div>
);

async function download(filename: string, assetUrl: string) {
  if (!assetUrl) {
    log.warn("No url provided for download");
    return;
  }

  try {
    // fetch file from server
    const response = await fetch(assetUrl);

    if (!response.ok) {
      log.warn("Network response was not ok");
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
    log.error("Failed to download file:", error);
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
  const handleSliderChange = useCallback(
    (event: Event, newValue: number | number[], activeThumb: number): void => {
      event.preventDefault();
      const value = Array.isArray(newValue) ? newValue[0] : newValue;
      onZoomChange(value);
    },
    [onZoomChange]
  );
  return (
    <div
      css={styles}
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
          <div className="buttons">
            <Tooltip title="Play | Pause" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className="play-button"
                size="small"
                color="primary"
                onClick={onPlayPause}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </Button>
            </Tooltip>
            <Tooltip title="Loop" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className={`loop-button${loop ? "" : " disabled"}`}
                size="small"
                color="primary"
                onClick={() => setLoop(!loop)}
              >
                <LoopIcon />
              </Button>
            </Tooltip>
            <Tooltip title="Mute" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className={`mute-button${mute ? "" : " disabled"}`}
                size="small"
                color="primary"
                onClick={() => setMute(!mute)}
              >
                {mute ? <OffIcon /> : <UpIcon />}
              </Button>
            </Tooltip>
            <Tooltip title="Download" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className={`download-audio-button${
                  filename !== "" ? "" : " disabled"
                }`}
                size="small"
                color="primary"
                onClick={() => {
                  if (assetUrl) {
                    download(filename || "audio.mp3", assetUrl);
                  } else {
                    log.warn("No assetUrl provided for download");
                  }
                }}
              >
                <DownloadIcon />
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioControls;
