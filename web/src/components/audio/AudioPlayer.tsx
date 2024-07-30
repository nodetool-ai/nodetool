/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/dist/plugins/minimap";
import { Typography } from "@mui/material";
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo
} from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { set, throttle } from "lodash";
import AudioControls from "./AudioControls";
import { devLog, devError } from "../../utils/DevLog";

type WaveSurferProps = {
  fontSize?: "normal" | "small" | "tiny";
  alwaysShowControls?: boolean;
  filename?: string;
  cursorColor?: string;
  waveColor?: string;
  progressColor?: string;
  source?: string | Uint8Array;
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
};

const wsprops: WaveSurferProps = {
  fontSize: "tiny",
  alwaysShowControls: false,
  filename: "",
  cursorWidth: 1,
  cursorColor: "#eee",
  waveColor: "#ddd",
  progressColor: "#555",
  source: "",
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
  waveformHeight: 15,
  minimapBarHeight: 1,
  dragToSeek: true,
  autoplay: false,
  playOnLoad: false
};

const styles = (theme: any) =>
  css({
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
      width: "100%",
      maxWidth: "99% !important"
      // scrollbarWidth: "none",
      // msOverflowStyle: "none"
    },
    ".minimap": {
      width: "100%",
      maxWidth: "99% !important",
      marginTop: "2px",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 0.3s"
    },
    ".minimap.visible": {
      opacity: "1"
    }
  });

const formatTime = (time: number) => {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = ("00" + Math.floor(time % 60)).slice(-2);
  return hours > 0
    ? `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds}`
    : `${minutes < 10 ? "0" : ""}${minutes}:${seconds}`;
};

const AudioPlayer: React.FC<WaveSurferProps> = (incomingProps) => {
  const {
    source,
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

  const [audioUrl, setAudioUrl] = useState<string>("");
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const waveFormRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const currentTimeRef = useRef(0);
  const [loop, setLoop] = useState(false);
  const [mute, setMute] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitsContainer, setFitsContainer] = useState(true);
  const minimapId = useMemo(() => `minimap-${uuidv4()}`, []);
  const handlePlayPause = useCallback(() => {
    try {
      waveSurferRef.current?.playPause();
    } catch (error) {
      devError("Audio Playback Error:", error);
    }
  }, []);

  useEffect(() => {
    devLog("Audio Player mounted.");
    return () => {
      devLog("Audio Player unmounted.");
    };
  }, []);

  const onPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const onPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const checkWaveformFit = useCallback(() => {
    const waveformElement = waveSurferRef.current?.getWrapper();
    const waveformWidth = waveformElement?.scrollWidth || 0;
    const containerWidth = waveFormRef.current?.clientWidth || 0;

    if (waveformWidth <= containerWidth) {
      setFitsContainer(true);
    } else {
      setFitsContainer(false);
    }
  }, []);

  useEffect(() => {
    if (source instanceof Uint8Array) {
      const blob = new Blob([source], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(source ?? "");
    }
  }, [source]);

  const loadWaveSurfer = useCallback(async () => {
    if (audioUrl === "" || lastLoadedUrlRef.current === audioUrl) return;

    const abortCtrl = new AbortController();

    try {
      const response = await axios.get(audioUrl, {
        headers: { Accept: "audio/mp3" },
        responseType: "blob",
        signal: abortCtrl.signal
      });

      if (
        response.status === 200 &&
        waveFormRef.current &&
        (!prevUrl || prevUrl !== audioUrl)
      ) {
        if (waveSurferRef.current) {
          waveSurferRef.current.destroy();
          waveSurferRef.current = null;
        }

        const minimap = Minimap.create({
          container: `#${minimapId}`,
          waveColor,
          progressColor,
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
          const currentTime = waveSurferRef.current?.getCurrentTime() || 0;
          currentTimeRef.current = currentTime;
        }, 100);

        const handleSeekingProcess = throttle(() => {
          const currentTime = waveSurferRef.current?.getCurrentTime() || 0;
          currentTimeRef.current = currentTime;
        }, 100);

        const waveSurfer = WaveSurfer.create({
          container: waveFormRef.current,
          ...wsprops,
          ...otherProps,
          url: audioUrl,
          plugins: [minimap]
        });
        waveSurferRef.current = waveSurfer;

        waveSurfer.on("error", (err) => {
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
        waveSurfer.on("decode", (duration) => {
          setDuration(duration);
          devLog("Decode: ", duration + "s");
        });
        waveSurfer.on("audioprocess", handleAudioProcess);
        waveSurfer.on("seeking", handleSeekingProcess as any);
        waveSurfer.on("zoom", checkWaveformFit);
        waveSurfer.on("finish", () => {
          if (loopRef.current) {
            waveSurfer.seekTo(0);
            waveSurfer.play();
            setIsPlaying(true);
          } else {
            waveSurfer.seekTo(0);
            setIsPlaying(false);
          }
        });
        setPrevUrl(audioUrl);
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

    lastLoadedUrlRef.current = audioUrl;

    return () => {
      abortCtrl.abort();
    };
  }, [
    source,
    prevUrl,
    minimapId,
    waveColor,
    progressColor,
    minimapHeight,
    minimapBarHeight,
    minPxPerSec,
    otherProps,
    onPlay,
    onPause,
    checkWaveformFit
  ]);

  useEffect(() => {
    return () => {
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
        waveSurferRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    loadWaveSurfer();
  }, [loadWaveSurfer]);

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
      className={`audio-controls-container${!fitsContainer ? " zoomed" : ""}${audioUrl === "" ? " disabled" : ""
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
        {`${formatTime(currentTimeRef.current)} | ${formatTime(duration)}`}
      </Typography>
      <div
        id="waveform"
        className="waveform nodrag"
        style={{ height: `${waveformHeight}px` }}
        ref={waveFormRef}
        onClick={(e) => {
          e.stopPropagation();
          const bbox = waveSurferRef.current
            ?.getWrapper()
            .getBoundingClientRect();
          if (bbox) {
            const x = e.clientX - bbox.left;
            const progress = x / bbox.width;
            waveSurferRef.current?.seekTo(progress);
          }
        }}
      ></div>
      <div
        id={minimapId}
        className={`minimap ${waveSurferRef?.current && waveSurferRef.current.getDuration() > 15
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
          assetUrl={audioUrl}
          onPlayPause={handlePlayPause}
          loop={loop}
          setLoop={setLoop}
          mute={mute}
          setMute={setMute}
          fontSize={fontSize}
          onZoomChange={(value) => {
            try {
              requestAnimationFrame(() => {
                setZoom(value);
                waveSurferRef.current?.zoom(value);
              });
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
