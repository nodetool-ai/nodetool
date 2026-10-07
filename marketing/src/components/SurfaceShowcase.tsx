"use client";
/**
 * The seven editing surfaces, one tab each, over a six-second loop of one
 * action in that editor, all on the same "Under the Bed" project. The loops
 * are rendered by the demo harness from look-alike product surfaces
 * (demo/src/heroflow/editors/).
 *
 * Each tab is deep-linkable as `#surface-<id>`.
 *
 * A loop's first frame is not its finished state, so the poster is the
 * last one. That rules out `<video poster>`, which a browser
 * only shows until playback first starts: once `currentTime` has moved, a
 * video that then stops paints its own frame instead. Leaving a tab rewinds it
 * to 0, so on any browser that refuses to restart the loop (Dia, Low Power
 * Mode, power saving, a backgrounded tab) coming back to that tab left a black
 * rectangle. The poster is a plain `<img>` underneath instead, and the video
 * is revealed only while it is actually painting frames. Playback starts when
 * the section reaches the viewport, not at mount, and a control appears
 * whenever the loop is not running.
 *
 * The tabs advance on their own: each loop plays once, then the next tab
 * opens. A click, a key press, or the pause button hands control to the
 * reader and stops the rotation for good. A browser that refuses playback
 * still rotates, on a timer over the posters.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Clapperboard,
  FileText,
  Film,
  Brush,
  Gamepad2,
  Pause,
  Play,
  Box as BoxIcon,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { usePrefersReducedMotion } from "../lib/useGridParallax";

interface Surface {
  id: string;
  label: string;
  icon: LucideIcon;
  headline: string;
  body: string;
  /** Basename in `public/` — `.mp4`, `.webm`, and `-poster.webp` alongside. */
  asset: string;
}

const SURFACES: Surface[] = [
  {
    id: "storyboard",
    label: "Storyboard",
    icon: Clapperboard,
    headline: "Visual storyboards",
    body: "Plan the film one shot at a time. Generate quick still images to settle the look, then turn only the shots you approve into video.",
    asset: "surface-storyboard",
  },
  {
    id: "script",
    label: "Script & voice",
    icon: FileText,
    headline: "Scripting & casting",
    body: "Write the dialogue, pick an AI voice for each character, and compare different readings of a line. Edit a line and its recording is marked out of date, so you can see what needs recording again.",
    asset: "surface-script",
  },
  {
    id: "timeline",
    label: "Timeline",
    icon: Film,
    headline: "Multi-track timeline",
    body: "Arrange, trim, and layer video and audio clips on separate tracks, down to a single frame. Ask the agent to tighten the opening and it edits the same timeline.",
    asset: "surface-timeline",
  },
  {
    id: "sketch",
    label: "Sketch",
    icon: Brush,
    headline: "Layered drawing canvas",
    body: "Sketch, paint, and blend your own drawing with AI-generated layers. Give a layer a text description, and the AI redraws that layer without touching the others.",
    asset: "surface-sketch",
  },
  {
    id: "3d",
    label: "3D",
    icon: BoxIcon,
    headline: "3D scene layout",
    body: "Lay out a scene with simple 3D shapes and lights, by hand or by asking the agent. Render it from any angle and use the image as a guide for a shot.",
    asset: "surface-3d",
  },
  {
    id: "game",
    label: "Game",
    icon: Gamepad2,
    headline: "Playable 2D and 3D games",
    body: "Place the player, the enemies, and the level, then press Play without leaving the editor. Ask the agent for a new rule or a darker level, and export the game to run in any web browser.",
    asset: "surface-game",
  },
  {
    id: "nodes",
    label: "Nodes",
    icon: Workflow,
    headline: "The node editor underneath",
    body: "Underneath, every project is a chain of connected steps called a node graph. Connect the steps, press Run, and check the result of each one, from the first text prompt to the finished clip.",
    asset: "surface-nodes",
  },
];

interface SurfaceShowcaseProps {
  surfaceIds?: string[];
  heading?: string;
  intro?: string;
}

export default function SurfaceShowcase({
  surfaceIds,
  heading = "Seven editors. One project.",
  intro =
    "Whatever the agent makes, you can open and change by hand. Each part of a project has its own editor, and the agent works in the same editors you do.",
}: SurfaceShowcaseProps) {
  const surfaces = useMemo(
    () =>
      surfaceIds
        ? SURFACES.filter((surface) => surfaceIds.includes(surface.id))
        : SURFACES,
    [surfaceIds]
  );
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  // Which video is painting frames, if any. A single flag keyed off `active`
  // misses the pause of the tab being left, so returning to it revealed a
  // stopped video on its black first frame.
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  // Cleared by the first interaction and never set again.
  const [rotating, setRotating] = useState(true);
  const autoAdvance = rotating && !reducedMotion && surfaces.length > 1;
  const progressRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Deep link: `#surface-timeline` opens that tab.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#surface-", "");
      const at = surfaces.findIndex((s) => s.id === id);
      if (at !== -1) {
        setActive(at);
        setRotating(false);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [surfaces]);

  // A loop that starts while the section is still far below the fold has
  // finished before anyone sees it, and browsers that throttle offscreen media
  // refuse the play() outright. Wait for the section.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "200px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Only the visible loop decodes; the rest stay paused and rewound.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        if (!inView || reducedMotion) {
          video.pause();
          setPlayingIndex((at) => (at === i ? null : at));
          return;
        }
        void video.play().catch(() => {
          // Refused (Dia, Low Power Mode, power saving, a background tab).
          // The poster holds and the button offers the loop by hand.
        });
      } else {
        video.pause();
        video.currentTime = 0;
        setPlayingIndex((at) => (at === i ? null : at));
      }
    });
  }, [active, inView, reducedMotion]);

  const advance = useCallback(() => {
    setActive((at) => (at + 1) % surfaces.length);
  }, [surfaces.length]);

  // Fallback for a refused play(): without frames there is no `ended`, so
  // the posters rotate on the loop's length instead.
  useEffect(() => {
    if (!autoAdvance || !inView || playingIndex === active) return;
    const timer = window.setTimeout(advance, 6000);
    return () => window.clearTimeout(timer);
  }, [active, advance, autoAdvance, inView, playingIndex]);

  // The active tab's underline tracks the loop. Written to the DOM directly
  // so a frame of progress is not a React render.
  useEffect(() => {
    const bar = progressRefs.current[active];
    if (!bar) return;
    if (!autoAdvance) {
      bar.style.transform = "scaleX(0)";
      return;
    }
    let frame = 0;
    const tick = () => {
      const video = videoRefs.current[active];
      const ratio =
        video && video.duration > 0 ? video.currentTime / video.duration : 0;
      bar.style.transform = `scaleX(${ratio})`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      bar.style.transform = "scaleX(0)";
    };
  }, [active, autoAdvance]);

  const select = useCallback(
    (index: number) => {
      setRotating(false);
      if (index === active) return;
      setActive(index);
      if (typeof window !== "undefined") {
        window.history.replaceState(
          null,
          "",
          `#surface-${surfaces[index].id}`
        );
      }
    },
    [active, surfaces]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? surfaces.length - 1
            : event.key === "ArrowRight"
              ? (active + 1) % surfaces.length
              : event.key === "ArrowLeft"
                ? (active - 1 + surfaces.length) % surfaces.length
                : null;
      if (next === null) return;
      event.preventDefault();
      select(next);
      requestAnimationFrame(() => tabRefs.current[next]?.focus());
    },
    [active, select, surfaces.length]
  );

  const togglePlayback = useCallback(() => {
    const video = videoRefs.current[active];
    if (!video) return;
    setRotating(false);
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  return (
    <section
      ref={sectionRef}
      id="surfaces"
      aria-labelledby="surfaces-title"
      className="relative py-24 overflow-clip-safe"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <h2
            id="surfaces-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            {heading}
          </h2>
          <p className="text-lg text-slate-300">{intro}</p>
        </div>

        <div
          role="tablist"
          aria-label="Editing surfaces"
          onKeyDown={onKeyDown}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {surfaces.map((surface, i) => {
            const Icon = surface.icon;
            const selected = i === active;
            return (
              <button
                key={surface.id}
                ref={(element) => {
                  tabRefs.current[i] = element;
                }}
                role="tab"
                id={`surface-tab-${surface.id}`}
                aria-selected={selected}
                aria-controls={`surface-panel-${surface.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                className={`relative inline-flex items-center gap-2 overflow-hidden rounded-full border px-4 py-2 text-sm focus-ring motion-safe:transition-colors ${
                  selected
                    ? "border-slate-300 bg-slate-100 text-slate-900"
                    : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {surface.label}
                <span
                  ref={(element) => {
                    progressRefs.current[i] = element;
                  }}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-blue-500"
                  style={{ transform: "scaleX(0)" }}
                />
              </button>
            );
          })}
        </div>

        {surfaces.map((surface, i) => (
          <div
            key={surface.id}
            role="tabpanel"
            id={`surface-panel-${surface.id}`}
            aria-labelledby={`surface-tab-${surface.id}`}
            hidden={i !== active}
          >
            <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/${surface.asset}-poster.webp`}
                alt={`${surface.label} editor`}
                width={1920}
                height={1080}
                decoding="async"
                loading={i === 0 ? "eager" : "lazy"}
                className="block h-auto w-full"
              />
              {inView && (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  muted
                  loop={!autoAdvance}
                  playsInline
                  preload={i === active ? "metadata" : "none"}
                  onPlaying={(event) => {
                    if (!event.currentTarget.paused && i === active) {
                      setPlayingIndex(i);
                    }
                  }}
                  onPause={() =>
                    setPlayingIndex((at) => (at === i ? null : at))
                  }
                  onEnded={() => {
                    if (autoAdvance && i === active) advance();
                  }}
                  aria-label={`${surface.label} editor, six second loop`}
                  className={`absolute inset-0 block h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-500 ${
                    playingIndex === i ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {/* The codecs are spelled out so a browser that cannot decode
                      VP9 rejects this source outright instead of selecting it
                      on a bare type and stalling. */}
                  <source
                    src={`/${surface.asset}.webm`}
                    type='video/webm; codecs="vp9"'
                  />
                  <source src={`/${surface.asset}.mp4`} type="video/mp4" />
                </video>
              )}

              {i === active && inView && (
                <button
                  type="button"
                  onClick={togglePlayback}
                  aria-label={`${
                    playingIndex === i ? "Pause" : "Play"
                  } the ${surface.label} loop`}
                  className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-slate-200 backdrop-blur focus-ring hover:border-slate-400 hover:text-white"
                >
                  {playingIndex === i ? (
                    <Pause className="h-4 w-4" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                </button>
              )}
            </div>

            <div className="mt-6 max-w-3xl">
              <h3 className="text-xl md:text-2xl font-semibold text-white">
                {surface.headline}
              </h3>
              <p className="mt-2 text-slate-300">{surface.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
