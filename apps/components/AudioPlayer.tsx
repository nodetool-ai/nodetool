import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface AudioPlayerProps {
  data: Uint8Array | string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ data }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeDisplay, setTimeDisplay] = useState("0:00 / 0:00");
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!waveformRef.current) return;

    const url =
      data instanceof Uint8Array
        ? URL.createObjectURL(new Blob([data], { type: "audio/wav" }))
        : data;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#76e5b8",
      progressColor: "#a2a2a2",
      cursorColor: "#e0e0e0",
      barWidth: 1,
      barHeight: 1.0,
      barGap: 1,
      height: 50,
      normalize: true,
      fillParent: true,
    });

    wavesurferRef.current = wavesurfer;
    wavesurfer.load(url);

    wavesurfer.on("audioprocess", () => {
      const current = formatTime(wavesurfer.getCurrentTime());
      const total = formatTime(wavesurfer.getDuration());
      setTimeDisplay(`${current} / ${total}`);
    });

    return () => {
      wavesurfer.destroy();
      if (data instanceof Uint8Array) {
        URL.revokeObjectURL(url);
      }
    };
  }, [data]);

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="audio-controls-container">
      <div ref={waveformRef} className="waveform" />
      <div className="audio-controls">
        <button className="play-button" onClick={togglePlay}>
          {isPlaying ? "⏸" : "▶"}
        </button>
      </div>
      <div className="time-display">{timeDisplay}</div>
    </div>
  );
};
