// EVENTS: https://wavesurfer.xyz/examples/?events.js

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/dist/plugins/minimap";
import { Typography } from "@mui/material";
import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { throttle } from "lodash";
import AudioControls from "./AudioControls";
import { devLog, devError } from "../../utils/DevLog";

type WaveSurferProps = {
  fontSize?: "normal" | "small" | "tiny" | undefined;
  alwaysShowControls?: boolean;
  filename?: string;
  cursorColor?: string;
  waveColor?: string;
  progressColor?: string;
  url: string;
  //
  barAlign?: "top" | "bottom";
  barGap?: number;
  barWidth?: number;
  cursorWidth?: number;
  fillParent?: boolean;
  hideScrollbar?: boolean;
  mediaControls?: boolean;
  minPxPerSec?: number;
  sampleRate?: number;
  barRadius?: number;
  height?: number;
  barHeight?: number;
  minimapHeight?: number;
  waveformHeight?: number;
  minimapBarHeight?: number;
  dragToSeek?: boolean;
  autoplay?: boolean;
  playOnLoad?: boolean;
  //
  //audioRate?: number;
  //autoCenter?: boolean;
  //autoScroll?: boolean;
  //interact?: boolean;
  //normalize?: boolean;
  //splitChannels?: WaveSurferOptions[];
};
const wsprops: WaveSurferProps = {
  fontSize: "tiny",
  alwaysShowControls: false,
  filename: "",
  cursorWidth: 1,
  cursorColor: "#eee",
  waveColor: "#ddd",
  progressColor: "#555",
  url: "",
  //
  barAlign: "bottom",
  barGap: 1,
  barRadius: 0,
  barWidth: 1,
  fillParent: true,
  hideScrollbar: true,
  mediaControls: false,
  minPxPerSec: 1,
  sampleRate: 44100,
  height: 12,
  barHeight: 1.0,
  minimapHeight: 8,
  waveformHeight: 8,
  minimapBarHeight: 1,
  dragToSeek: true,
  autoplay: false,
  playOnLoad: false
  //
  //audioRate: 1,
  //autoCenter: true,
  //autoScroll: true,
  //interact: true,
  //normalize: false,
  //splitChannels: undefined,
};

const styles = (theme: any) =>
  css({
    // "&": {
    // },
    // audioPlayer: {
    //   scrollbarWidth: "thin"
    // },
    button: {
      width: "25px !important",
      height: "25px !important",
      padding: "10px",
      transition: "border",
      backgroundColor: "transparent",
      border: "1px solid rgba(70, 70, 70, 0.3)",
      marginLeft: "0",

      "&:hover": {
        backgroundColor: "transparent",
        border: "1px solid rgba(90, 90, 90, 0.4)"
      }
    },
    ".tiny": {
      fontSize: theme.fontSizeTiny
    },
    ".normal": {
      fontSize: theme.fontSizeNormal
    },
    ".big": {
      fontSize: theme.fontSizeBig
    },
    ".waveform": {
      scrollbarWidth: "none",
      msOverflowStyle: "none"
    },
    ".minimap": {
      marginTop: "2px",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 0.3s"
    },
    ".minimap.visible": {
      opacity: "1"
    }

    // sliderRoot: {
    //   margin: "0"
    // },
    // sliderValue: {
    //   margin: "0"
    // },
    // tinyValue: {
    //   margin: "0",
    //   padding: "0",
    //   right: "0",
    //   top: "4px"
    // },
    // waveformScrollbar: {
    //   display: "none"
    // },

    // zoomedMinimap: {
    //   opacity: "1"
    // },
  });

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = ("00" + Math.floor(time % 60)).slice(-2); // padded with zeros
  return hours > 0
    ? `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds}`
    : `${minutes < 10 ? "0" : ""}${minutes}:${seconds}`;
};

const AudioPlayer: React.FC<WaveSurferProps> = (incomingProps) => {
  const {
    url = wsprops.url,
    alwaysShowControls = wsprops.alwaysShowControls,
    filename = wsprops.filename,
    waveColor = wsprops.waveColor,
    progressColor = wsprops.progressColor,
    minimapHeight = wsprops.minimapHeight,
    waveformHeight = wsprops.waveformHeight,
    minimapBarHeight = wsprops.minimapBarHeight,
    fontSize = wsprops.fontSize,
    minPxPerSec = wsprops.minPxPerSec,
    ...otherProps
  } = incomingProps;

  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const waveFormRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [mute, setMute] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitsContainer, setFitsContainer] = useState(true);

  const handlePlayPause = () => {
    try {
      waveSurferRef.current?.playPause();
    } catch (error) {
      devError("Audio Playback Error:", error);
    }
  };
  const onPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);
  const onPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // set isPlaying to false when audio loads
  useEffect(() => {
    setIsPlaying(false);
  }, [url]);

  const minimapId = useRef(`minimap-${uuidv4()}`);
  const checkWaveformFit = () => {
    const waveformElement = waveSurferRef.current?.getWrapper();
    const waveformWidth = waveformElement?.scrollWidth || 0;
    const containerWidth = waveFormRef.current?.clientWidth || 0;

    if (waveformWidth <= containerWidth) {
      setFitsContainer(true);
    } else {
      setFitsContainer(false);
    }
  };

  const loadWaveSurfer = useCallback(async () => {
    if (!url || lastLoadedUrlRef.current === url) return;
    const abortCtrl = new AbortController();

    try {
      const response = await axios.get(url, {
        headers: {
          Accept: "audio/mp3"
        },
        responseType: "blob",
        signal: abortCtrl.signal
      });
      if (
        response.status === 200 &&
        waveFormRef.current &&
        (!prevUrl || prevUrl !== url)
      ) {
        waveSurferRef.current?.destroy();

        // MINIMAP
        const minimap = Minimap.create({
          container: `#${minimapId.current}`,
          waveColor: waveColor,
          progressColor: progressColor,
          cursorColor: "#eee",
          height: minimapHeight,
          barHeight: minimapBarHeight,
          barAlign: "bottom",
          barWidth: 0.1,
          barGap: 1,
          cursorWidth: 1,
          barRadius: 0,
          minPxPerSec: minPxPerSec || 1
        });

        const handleAudioProcess = throttle(() => {
          const currentTime = waveSurfer.getCurrentTime();
          setCurrentTime(currentTime);
        }, 100);
        const handleSeekingProcess = throttle(() => {
          const currentTime = waveSurfer.getCurrentTime();
          setCurrentTime(currentTime);
        }, 100);

        const waveSurfer = WaveSurfer.create({
          container: waveFormRef.current,
          ...wsprops,
          ...otherProps,
          url,
          plugins: [minimap]
        });
        waveSurferRef.current = waveSurfer;
        waveSurfer.on("error" as any, (err) => {
          devError("Wavesurfer audio error:", err);
        });
        waveSurfer.on("play", onPlay);
        waveSurfer.on("pause", onPause);
        waveSurfer.on("ready", () => {
          setIsReady(true);
          checkWaveformFit();
          devLog("Audio is ready for playback");
          if (otherProps.playOnLoad) {
            waveSurfer.play();
          }
        });
        waveSurfer.on("loading", (percent) => {
          // devLog("Loading: ", percent + "%");
        });
        waveSurfer.on("decode", (duration) => {
          setDuration(duration);
          devLog("Decode: ", duration + "s");
        });
        waveSurfer.on("audioprocess", () => {
          handleAudioProcess();
        });
        waveSurfer.on("seeking", () => {
          handleSeekingProcess();
        });
        waveSurfer.on("zoom", () => {
          checkWaveformFit();
        });
        waveSurfer.on("finish", () => {
          if (loopRef.current) {
            waveSurfer.seekTo(0);
            waveSurfer.play();
            setIsPlaying(true);
          } else {
            waveSurfer.stop();
            waveSurfer.seekTo(0);
          }
        });
        setPrevUrl(url);
      } else if (response.status !== 200) {
        devError("Audio file not found.");
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        devLog("Request canceled:", error.message);
      } else {
        devError("Error while checking or loading audio:", error);
      }
    }
    lastLoadedUrlRef.current = url;
    return () => {
      abortCtrl.abort();
    };
  }, [
    url,
    prevUrl,
    waveColor,
    progressColor,
    minimapHeight,
    minimapBarHeight,
    otherProps,
    onPlay,
    onPause,
    minPxPerSec
  ]);

  useEffect(() => {
    return () => {
      if (waveSurferRef.current) {
        // waveSurferRef.current.destroy();
        // waveSurferRef.current = null;
      }
    };
  }, [loadWaveSurfer]);

  useEffect(() => {
    loadWaveSurfer();
  }, [loadWaveSurfer]);

  useEffect(() => {
    return () => {
      waveSurferRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    waveSurferRef.current?.setMuted(mute);
  }, [mute]);

  useEffect(() => {
    setMute(false);
    waveSurferRef.current?.setMuted(false);
  }, []);

  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    return () => {
      waveSurferRef.current?.un("play", onPlay);
      waveSurferRef.current?.un("pause", onPause);
    };
  }, [onPlay, onPause]);

  return (
    <div
      css={styles}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className={`audio-controls-container${!fitsContainer ? " zoomed" : ""}${
        url === "" ? " disabled" : ""
      }`}
    >
      <Typography
        variant="body1"
        className={`${fontSize} filename`}
        style={{ color: "#ccc" }}
      >
        {filename}
      </Typography>
      <Typography
        variant="body1"
        className={`${fontSize} filename`}
        style={{ color: "#999" }}
      >
        {`${formatTime(currentTime)} | ${formatTime(duration)}`}
      </Typography>
      <div
        id="waveform"
        className=" waveform nodrag"
        style={{ height: `${waveformHeight}px` }}
        ref={waveFormRef}
        onClick={(e) => {
          e.stopPropagation();
        }}
      ></div>
      <div
        id={minimapId.current}
        className={`minimap ${
          waveSurferRef?.current && waveSurferRef.current.getDuration() > 15
            ? "visible"
            : ""
        }`}
        style={{ height: `${minimapHeight}px` }}
      ></div>
      {(isReady || alwaysShowControls) && (
        <AudioControls
          isPlaying={isPlaying}
          zoom={zoom}
          filename={filename}
          assetUrl={url}
          onPlayPause={handlePlayPause}
          loop={loop}
          setLoop={setLoop}
          mute={mute}
          setMute={setMute}
          fontSize={fontSize}
          onZoomChange={(value) => {
            try {
              setZoom(value);
              waveSurferRef.current?.zoom(value);
            } catch (error: any) {
              devLog("Zoom audio failed: ", error.message);
            }
          }}
        />
      )}
    </div>
  );
};

export default AudioPlayer;
