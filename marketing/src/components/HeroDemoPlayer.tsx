"use client";
/**
 * The hero's looping demo: prompt → cut → delivered, rendered by the demo
 * harness from real product casts (demo/src/hero/HeroPipeline.tsx).
 *
 * The poster is a plain <img> with a srcSet and high fetch priority, and it
 * stays the LCP element — a <video poster> cannot carry either. The video
 * mounts only once the section is on screen, fades in when it can play, and
 * never autoplays for a reader who asked for reduced motion.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

interface HeroDemoPlayerProps {
  alt: string;
}

export default function HeroDemoPlayer({ alt }: HeroDemoPlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mountVideo, setMountVideo] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Load the reel only when the hero is actually on screen — a 2.4 MB file
  // has no business competing with the first paint.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (typeof IntersectionObserver === "undefined") {
      setMountVideo(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMountVideo(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const onCanPlay = useCallback(() => {
    setReady(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    void videoRef.current?.play().then(
      () => setPlaying(true),
      () => {
        // Refused (power saving, background tab). The poster is the fallback.
      }
    );
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true), () => {});
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  return (
    <div ref={frameRef} className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-pipeline-poster.webp"
        srcSet="/hero-pipeline-poster-960.webp 960w, /hero-pipeline-poster.webp 1920w"
        sizes="(max-width: 1023px) 100vw, 58vw"
        alt={alt}
        width={1920}
        height={1080}
        decoding="async"
        className="block h-auto w-full rounded-xl"
        fetchPriority="high"
      />

      {mountVideo && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={onCanPlay}
          aria-label={alt}
          className={`absolute inset-0 h-full w-full rounded-xl object-cover transition-opacity duration-500 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <source src="/hero-pipeline.webm" type="video/webm" />
          <source src="/hero-pipeline.mp4" type="video/mp4" />
        </video>
      )}

      {ready && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause the demo" : "Play the demo"}
          className="absolute bottom-3 right-3 rounded-full border border-slate-600/80 bg-slate-950/70 p-2 text-slate-200 backdrop-blur hover:text-white focus-ring"
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}
