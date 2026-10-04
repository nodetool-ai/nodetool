"use client";
import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

export interface BeatSpan {
  readonly start_ms: number;
  readonly end_ms: number;
}

export interface BeatClock {
  readonly elapsedMs: number;
  readonly playing: boolean;
  readonly activeIndex: number;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
}

/**
 * A beat sheet's clock, driven by a video of the whole ad: elapsed time is
 * the video's own playback position, so the beats follow the frames.
 */
export function useVideoBeatClock(
  videoRef: RefObject<HTMLVideoElement | null>,
  beats: readonly BeatSpan[]
): BeatClock {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let frame = 0;
    const sync = (): void => setElapsedMs(video.currentTime * 1000);
    const tick = (): void => {
      sync();
      frame = requestAnimationFrame(tick);
    };
    const onPlay = (): void => {
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onStop = (): void => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      sync();
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStop);
    video.addEventListener("ended", onStop);
    video.addEventListener("seeked", sync);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("ended", onStop);
      video.removeEventListener("seeked", sync);
    };
  }, [videoRef]);

  const seek = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = ms / 1000;
      }
      setElapsedMs(ms);
    },
    [videoRef]
  );

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.ended) {
      video.currentTime = 0;
    }
    // React does not reliably reflect `muted` onto the element, and an
    // unmuted play() is refused.
    video.muted = true;
    void video.play().catch(() => setPlaying(false));
  }, [videoRef]);

  const pause = useCallback(() => videoRef.current?.pause(), [videoRef]);

  const found = beats.findIndex((beat) => elapsedMs < beat.end_ms);
  const activeIndex = found === -1 ? beats.length - 1 : found;
  return { elapsedMs, playing, activeIndex, play, pause, seek };
}
