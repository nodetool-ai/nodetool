import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WaveSurfer from "wavesurfer.js";
import Minimap from "wavesurfer.js/dist/plugins/minimap";

import {
  Box,
  FlexColumn,
  SPACING,
  TruncatedText,
  TYPOGRAPHY
} from "../ui_primitives";
import { throttle } from "../../utils/lodashAlternatives";
import AudioControls from "./AudioControls";

type WaveSurferProps = {
  fontSize?: "normal" | "small" | "tiny";
  alwaysShowControls?: boolean;
  filename?: string;
  /** Draw the filename above the waveform. It still names downloads when hidden. */
  showFilename?: boolean;
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
  mimeType?: string;
};

const getWsprops = (theme: Theme): WaveSurferProps => ({
  fontSize: "tiny",
  alwaysShowControls: false,
  filename: "",
  cursorWidth: 1,
  cursorColor: theme.palette.primary.light,
  waveColor: theme.palette.grey[500],
  progressColor: theme.palette.primary.main,
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
  barHeight: 0.8,
  minimapHeight: 8,
  waveformHeight: 15,
  minimapBarHeight: 1,
  dragToSeek: true,
  autoplay: false,
  playOnLoad: false
});

const AudioPlayer: React.FC<WaveSurferProps> = (incomingProps) => {
  const theme = useTheme();
  const wsprops = useMemo(() => getWsprops(theme), [theme]);
  const {
    source,
    alwaysShowControls = wsprops.alwaysShowControls,
    filename = wsprops.filename,
    showFilename = true,
    waveColor = wsprops.waveColor,
    progressColor = wsprops.progressColor,
    minimapHeight = wsprops.minimapHeight,
    waveformHeight = wsprops.waveformHeight,
    minimapBarHeight = wsprops.minimapBarHeight,
    fontSize = wsprops.fontSize,
    minPxPerSec = wsprops.minPxPerSec,
    mimeType = "audio/mp3",
    ...otherProps
  } = incomingProps;

  // Ref keeps config props stable — these only apply at WaveSurfer creation
  // time and should not trigger callback/effect recreation on every render.
  const otherPropsRef = useRef(otherProps);
  otherPropsRef.current = otherProps;

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
  const minimapId = useMemo(() => `minimap-${crypto.randomUUID()}`, []);
  const [displayTime, setDisplayTime] = useState(0);
  const handlePlayPause = useCallback(() => {
    try {
      waveSurferRef.current?.playPause();
    } catch (error) {
      console.error("Audio Playback Error:", error);
    }
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
      const blob = new Blob([source as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(source ?? "");
    }
  }, [source, mimeType]);

  const loadWaveSurfer = useCallback(async () => {
    if (audioUrl === "" || lastLoadedUrlRef.current === audioUrl) {return;}

    const abortCtrl = new AbortController();

    try {
      const response = await fetch(audioUrl, {
        headers: { Accept: mimeType },
        signal: abortCtrl.signal
      });

      if (
        response.ok &&
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
          cursorColor: theme.palette.primary.light,
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
          setDisplayTime(currentTime);
        }, 100);

        const handleSeekingProcess = throttle((_currentTime: number) => {
          const time = waveSurferRef.current?.getCurrentTime() || 0;
          currentTimeRef.current = time;
        }, 100);

        const waveSurfer = WaveSurfer.create({
          container: waveFormRef.current,
          ...wsprops,
          ...otherPropsRef.current,
          url: audioUrl,
          plugins: [minimap]
        });
        waveSurferRef.current = waveSurfer;

        waveSurfer.on("error", (err) => {
          console.error("Wavesurfer audio error:", err);
        });
        waveSurfer.on("play", onPlay);
        waveSurfer.on("pause", onPause);
        waveSurfer.on("ready", () => {
          setIsReady(true);
          checkWaveformFit();
          console.info("Audio is ready for playback");
          if (otherPropsRef.current.playOnLoad) {
            waveSurfer.play();
          }
        });
        waveSurfer.on("decode", (duration) => {
          setDuration(duration);
          console.info("Decode: ", duration + "s");
        });
        waveSurfer.on("audioprocess", handleAudioProcess);
        waveSurfer.on("seeking", handleSeekingProcess);
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
      } else if (!response.ok) {
        console.error("Audio file not found.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.info("Request canceled:", error.message);
      } else {
        console.error("Error while checking or loading audio:", error);
      }
    }

    lastLoadedUrlRef.current = audioUrl;

    return () => {
      abortCtrl.abort();
    };
  }, [
    audioUrl,
    prevUrl,
    mimeType,
    minimapId,
    waveColor,
    progressColor,
    minimapHeight,
    minimapBarHeight,
    minPxPerSec,
    onPlay,
    onPause,
    checkWaveformFit,
    theme.palette.primary.light,
    wsprops
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

  const handleZoomChange = useCallback((value: number) => {
    try {
      requestAnimationFrame(() => {
        setZoom(value);
        waveSurferRef.current?.zoom(value);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.info("Zoom audio failed: ", message);
    }
  }, []);

  const showMinimap =
    waveSurferRef.current !== null && waveSurferRef.current.getDuration() > 15;

  return (
    <FlexColumn
      onClick={(e) => {
        e.stopPropagation();
      }}
      className={`audio-controls-container${!fitsContainer ? " zoomed" : ""}${
        audioUrl === "" ? " disabled" : ""
      }`}
      gap={SPACING.xs}
      sx={{ width: "100%", minWidth: 0 }}
    >
      {showFilename && filename && (
        <TruncatedText
          className={`${fontSize} filename`}
          showTooltip
          color="text.primary"
          sx={
            fontSize === "normal"
              ? TYPOGRAPHY.sans.label
              : TYPOGRAPHY.sans.caption
          }
        >
          {filename}
        </TruncatedText>
      )}
      <Box
        className="waveform nodrag"
        ref={waveFormRef}
        sx={{ width: "100%", height: waveformHeight, cursor: "pointer" }}
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
      />
      <Box
        id={minimapId}
        className={`minimap${showMinimap ? " visible" : ""}`}
        sx={{
          width: "100%",
          height: showMinimap ? minimapHeight : 0,
          overflow: "hidden",
          cursor: "pointer",
          opacity: showMinimap ? 1 : 0
        }}
      />
      {(isReady || alwaysShowControls) && (
        <AudioControls
          isPlaying={isPlaying}
          zoom={zoom}
          currentTime={displayTime}
          duration={duration}
          filename={filename}
          assetUrl={audioUrl}
          mimeType={mimeType}
          onPlayPause={handlePlayPause}
          loop={loop}
          setLoop={setLoop}
          mute={mute}
          setMute={setMute}
          fontSize={fontSize}
          onZoomChange={handleZoomChange}
        />
      )}
    </FlexColumn>
  );
};

export default AudioPlayer;
