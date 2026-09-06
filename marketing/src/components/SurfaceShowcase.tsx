"use client";
/**
 * The five editing surfaces, one tab each, over a six-second loop of the real
 * editor. The loops are rendered by the demo harness from product casts
 * (demo/src/hero/SurfaceLoop.tsx), so what a tab shows is what the app does.
 *
 * Each tab is deep-linkable as `#surface-<id>`.
 *
 * Every loop opens on an empty editor and fills up over its six seconds, so
 * frame 0 is all but black. That rules out `<video poster>`, which a browser
 * only shows until playback first starts: once `currentTime` has moved, a
 * video that then stops paints its own frame instead. Leaving a tab rewinds it
 * to 0, so on any browser that refuses to restart the loop (Dia, Low Power
 * Mode, power saving, a backgrounded tab) coming back to that tab left a black
 * rectangle. The poster is a plain `<img>` underneath instead, and the video
 * is revealed only while it is actually painting frames. Playback starts when
 * the section reaches the viewport, not at mount, and a control appears
 * whenever the loop is not running.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  FileText,
  Film,
  Brush,
  Play,
  Box as BoxIcon,
  type LucideIcon,
} from "lucide-react";

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
    body: "Board the film shot by shot. Generate cheap stills first to lock the look, then pay to animate only the shots you approved.",
    asset: "surface-storyboard",
  },
  {
    id: "script",
    label: "Script & voice",
    icon: FileText,
    headline: "Scripting & casting",
    body: "Draft the dialogue, cast a voice per character, and audition alternate line readings. Change the words and the take flags itself stale, so you see exactly what still needs voicing.",
    asset: "surface-script",
  },
  {
    id: "timeline",
    label: "Timeline",
    icon: Film,
    headline: "Multi-track timeline",
    body: "Arrange, trim, and layer generated video and audio across multiple tracks, down to the frame and the stem. The agent edits the same document when you ask it to tighten the opening.",
    asset: "surface-timeline",
  },
  {
    id: "sketch",
    label: "Sketch",
    icon: Brush,
    headline: "Layered drawing canvas",
    body: "Sketch, paint with brushes, and blend hand-drawn elements with AI-generated layers. Bind a layer to a prompt and regenerate that layer alone.",
    asset: "surface-sketch",
  },
  {
    id: "3d",
    label: "3D",
    icon: BoxIcon,
    headline: "Spatial composition you can reproduce",
    body: "Place primitives and lights in a glTF scene by hand or by tool call. The same operations run headlessly, so a scene is reproducible.",
    asset: "surface-3d",
  },
];

export default function SurfaceShowcase() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  // Which video is painting frames, if any. A single flag keyed off `active`
  // misses the pause of the tab being left, so returning to it revealed a
  // stopped video on its black first frame.
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Deep link: `#surface-timeline` opens that tab.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#surface-", "");
      const at = SURFACES.findIndex((s) => s.id === id);
      if (at !== -1) setActive(at);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

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
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
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
        if (!inView) return;
        void video.play().catch(() => {
          // Refused (Dia, Low Power Mode, power saving, a background tab).
          // The poster holds and the button offers the loop by hand.
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [active, inView]);

  const select = useCallback((index: number) => {
    setActive(index);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#surface-${SURFACES[index].id}`);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      select((active + delta + SURFACES.length) % SURFACES.length);
    },
    [active, select]
  );

  // The click is the user gesture the refusing browser was holding out for.
  const startByHand = useCallback(() => {
    void videoRefs.current[active]?.play().catch(() => {});
  }, [active]);

  return (
    <section
      ref={sectionRef}
      id="surfaces"
      aria-labelledby="surfaces-title"
      className="relative py-24 overflow-clip-safe"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-fuchsia-900/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-10 text-center max-w-3xl mx-auto">
          <h2
            id="surfaces-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Five editors. One project file.
          </h2>
          <p className="text-lg text-slate-300">
            Storyboard, script, timeline, sketch, and 3D scene, all on the
            canvas you generate on. A storyboard becomes a script, the script
            becomes takes, the takes land on a multi-track timeline. The agent
            works every one of them through the same tools you click.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Editing surfaces"
          onKeyDown={onKeyDown}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {SURFACES.map((surface, i) => {
            const Icon = surface.icon;
            const selected = i === active;
            return (
              <button
                key={surface.id}
                role="tab"
                id={`surface-tab-${surface.id}`}
                aria-selected={selected}
                aria-controls={`surface-panel-${surface.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(i)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm focus-ring motion-safe:transition-colors ${
                  selected
                    ? "border-slate-300 bg-slate-100 text-slate-900"
                    : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {surface.label}
              </button>
            );
          })}
        </div>

        {SURFACES.map((surface, i) => (
          <div
            key={surface.id}
            role="tabpanel"
            id={`surface-panel-${surface.id}`}
            aria-labelledby={`surface-tab-${surface.id}`}
            hidden={i !== active}
          >
            <div className="card relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md">
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
                  loop
                  playsInline
                  preload={i === active ? "metadata" : "none"}
                  onPlaying={() => setPlayingIndex(i)}
                  onPause={() =>
                    setPlayingIndex((at) => (at === i ? null : at))
                  }
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

              {i === active && inView && playingIndex !== i && (
                <button
                  type="button"
                  onClick={startByHand}
                  aria-label={`Play the ${surface.label} loop`}
                  className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-slate-200 backdrop-blur focus-ring hover:border-slate-400 hover:text-white"
                >
                  <Play className="h-4 w-4" aria-hidden />
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
