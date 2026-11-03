"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/useGridParallax";
import {
  presetAnchor,
  presetDisplayName,
  renderSummary,
  sourcePresetOf
} from "@/data/presets";
import type { PresetShowcaseEntry } from "@/data/presets";

/** Stops the card that is playing, so only one preview runs at a time. */
let stopActive: (() => void) | null = null;

/**
 * One preset: its poster above its name, description and model. The poster is
 * a lazy image. The preview video is mounted on the first hover or focus and
 * plays only while the pointer or keyboard focus is on the card, or after a
 * tap on a touch screen. Under reduced motion the card shows the poster and
 * never mounts the video.
 */
export function PresetCard({ entry }: { entry: PresetShowcaseEntry }) {
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const name = presetDisplayName(entry);
  const source = sourcePresetOf(entry);

  const halt = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playing) {
      video.muted = true;
      video.play().catch((error: unknown) => {
        // A pause during loading rejects with AbortError, and a later start
        // must not be undone by it.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPlaying(false);
        }
      });
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [armed, playing]);

  useEffect(
    () => () => {
      if (stopActive === halt) {
        stopActive = null;
      }
    },
    [halt]
  );

  const start = () => {
    // Read the query here as well: a hover can land before the hook's first
    // effect has run.
    if (
      reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (stopActive && stopActive !== halt) {
      stopActive();
    }
    stopActive = halt;
    setArmed(true);
    setPlaying(true);
  };
  const stop = () => {
    setPlaying(false);
    if (stopActive === halt) {
      stopActive = null;
    }
  };

  const media = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote public preview, sized by its container */}
      <img
        src={entry.posterUrl}
        alt=""
        width={854}
        height={480}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {armed && (
        <video
          ref={videoRef}
          src={entry.previewUrl}
          poster={entry.posterUrl}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {!reducedMotion && (
        <span
          aria-hidden="true"
          className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-opacity ${
            playing ? "opacity-0" : "opacity-100"
          }`}
        >
          <Play className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );

  const frame =
    "relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10 transition-shadow duration-300 group-hover:ring-amber-300/50 motion-reduce:transition-none";

  return (
    <article
      id={presetAnchor(entry)}
      className="group flex scroll-mt-28 flex-col"
      onMouseEnter={start}
      onMouseLeave={stop}
    >
      {reducedMotion ? (
        <div className={frame}>{media}</div>
      ) : (
        <button
          type="button"
          aria-label={`Preview ${name}`}
          aria-pressed={playing}
          onFocus={(event) => {
            // Keyboard focus plays. A tap focuses too, and its click toggles.
            if (event.currentTarget.matches(":focus-visible")) {
              start();
            }
          }}
          onBlur={stop}
          onClick={() => (playing ? stop() : start())}
          className={`focus-ring block ${frame}`}
        >
          {media}
        </button>
      )}
      <div className="flex flex-1 flex-col px-1 pt-4">
        <p className="text-xs font-medium text-amber-300">{entry.slot}</p>
        <h3 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-slate-100">
          {name}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {entry.description}
        </p>
        <dl className="mt-3 space-y-1 text-xs text-slate-400">
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-500">Model</dt>
            <dd>{entry.model}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-500">Render</dt>
            <dd>{renderSummary(entry)}</dd>
          </div>
          {source && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-500">Source</dt>
              <dd>
                Reference video from the{" "}
                <a
                  href={`#${presetAnchor(source)}`}
                  className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200"
                >
                  {presetDisplayName(source)} preview
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}
