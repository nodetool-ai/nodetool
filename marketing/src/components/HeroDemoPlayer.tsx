"use client";
/**
 * The hero's looping demo: one project from a sentence to a finished cut —
 * chat, storyboard, timeline — rendered by the demo harness from real product
 * casts (demo/src/hero/HeroProject.tsx).
 *
 * The poster is a plain <img> with a srcSet and high fetch priority, and it
 * stays the LCP element — a <video poster> cannot carry either. The video
 * mounts only once the section is on screen, is revealed once it is actually
 * painting frames, and never autoplays for a reader who asked for reduced
 * motion.
 *
 * iOS Safari drives two of the decisions here. It caps preloading at metadata
 * and fetches media data only once playback is requested, so `canplay` never
 * fires on its own — starting playback from that event deadlocks the player on
 * iPhone. And Low Power Mode refuses muted autoplay outright, so the control
 * has to appear on metadata rather than on readiness, or there is no way to
 * start the reel by hand.
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
  const [hasMetadata, setHasMetadata] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Load the reel only when the hero is actually on screen — a multi-MB file
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

  // play() is what starts the download on iOS, so it is called as soon as the
  // element exists rather than waiting for a readiness event that data would
  // have to arrive for.
  useEffect(() => {
    if (!mountVideo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void videoRef.current?.play().catch(() => {
      // Refused (Low Power Mode, power saving, background tab). The poster
      // holds and the button below offers it.
    });
  }, [mountVideo]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  return (
    <div ref={frameRef} className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-project-poster.webp"
        srcSet="/hero-project-poster-960.webp 960w, /hero-project-poster.webp 1920w"
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
          onLoadedMetadata={() => setHasMetadata(true)}
          onPlaying={() => {
            setStarted(true);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          aria-label={alt}
          className={`absolute inset-0 h-full w-full rounded-xl object-cover transition-opacity duration-500 ${
            started ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* The codecs are spelled out so a browser that cannot decode VP9
              rejects this source outright instead of selecting it on a bare
              type and stalling. */}
          <source src="/hero-project.webm" type='video/webm; codecs="vp9"' />
          <source src="/hero-project.mp4" type="video/mp4" />
        </video>
      )}

      {hasMetadata && (
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
