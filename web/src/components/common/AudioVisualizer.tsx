/** @jsxImportSource @emotion/react */
import { useEffect, useRef } from "react";

type AudioVisualizerProps = {
  stream: MediaStream | null;
  version?: number;
  height?: number;
};

const AudioVisualizer = ({
  stream,
  version = 0,
  height = 64
}: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) {return;}

    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioContext: AudioContext = new AudioCtx();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const ctx = canvas.getContext("2d");
    if (!ctx) {return;}

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const resize = () => {
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const gradient = () => {
      const g = ctx.createLinearGradient(0, 0, canvas.clientWidth, 0);
      g.addColorStop(0.0, "#ff6ec7");
      g.addColorStop(0.25, "#ffa26b");
      g.addColorStop(0.5, "#f9f871");
      g.addColorStop(0.75, "#6ef7ff");
      g.addColorStop(1.0, "#9b6bff");
      return g;
    };

    let rafId = 0;
    const draw = () => {
      if (!canvas || !ctx) {return;}
      analyser.getByteFrequencyData(dataArray);
      const width = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, width, h);

      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, 0, width, h);

      const bars = 64;
      const step = Math.floor(bufferLength / bars);
      const barWidth = (width / bars) * 0.6;
      const gap = (width / bars) * 0.4;
      ctx.fillStyle = gradient();
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#00e5ff";
      for (let i = 0; i < bars; i++) {
        const v = dataArray[i * step] / 255;
        const barH = Math.max(2, v * h * 0.9);
        const x = i * (barWidth + gap) + gap * 0.5;
        const y = h - barH;
        ctx.fillRect(x, y, barWidth, barH);
      }

      const timeArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeArray);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      const slice = width / bufferLength;
      for (let i = 0; i < bufferLength; i++) {
        const v = timeArray[i] / 128.0 - 1.0;
        const x = i * slice;
        const y = h * 0.25 + v * (h * 0.2);
        if (i === 0) {ctx.moveTo(x, y);}
        else {ctx.lineTo(x, y);}
      }
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      try {
        audioContext.close();
      } catch {
        // noop
      }
      analyserRef.current = null;
      audioContextRef.current = null;
    };
  }, [stream, version]);

  return <canvas ref={canvasRef} style={{ width: "100%", height }} />;
};

export default AudioVisualizer;
