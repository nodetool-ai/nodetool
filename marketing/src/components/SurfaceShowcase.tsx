"use client";
/**
 * The five editing surfaces, one tab each, over a six-second loop of the real
 * editor. The loops are rendered by the demo harness from product casts
 * (demo/src/hero/SurfaceLoop.tsx), so what a tab shows is what the app does.
 *
 * Each tab is deep-linkable as `#surface-<id>`. The long-form section for a
 * surface keeps its own `#<id>` anchor further down the page; these are
 * separate ids on purpose.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  FileText,
  Film,
  Brush,
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
  /** Where the long-form section for this surface lives, when there is one. */
  deepLink?: string;
}

const SURFACES: Surface[] = [
  {
    id: "storyboard",
    label: "Storyboard",
    icon: Clapperboard,
    headline: "Direct the shots before you pay for them",
    body: "Stills cost cents and clips cost dollars, so the board settles the framing first. Revise one shot and the other five stay as they were.",
    asset: "surface-storyboard",
    deepLink: "#storyboard",
  },
  {
    id: "script",
    label: "Script & voice",
    icon: FileText,
    headline: "A script that knows who says each line",
    body: "Lines carry a cast voice. Change the words and the take goes stale, so you can see what still needs voicing before you spend on it.",
    asset: "surface-script",
    deepLink: "#script-editor",
  },
  {
    id: "timeline",
    label: "Timeline",
    icon: Film,
    headline: "A real multi-track cut, not a render queue",
    body: "Clips, audio, captions, and transitions on one timeline — the same document an agent edits when you ask it to tighten the opening.",
    asset: "surface-timeline",
    deepLink: "#timeline-editor",
  },
  {
    id: "sketch",
    label: "Sketch",
    icon: Brush,
    headline: "Layers you paint and layers a model fills",
    body: "Paint a mask, bind a layer to a prompt or a workflow, and regenerate that layer alone. The rest of the canvas holds still.",
    asset: "surface-sketch",
    deepLink: "#sketch-editor",
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

  // Only the visible loop decodes; the rest stay paused and rewound.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        void video.play().catch(() => {
          // Autoplay can be refused (reduced motion, power saving). The
          // poster stays, which is the right fallback.
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [active]);

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

  return (
    <section
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
            Five editors, one document
          </h2>
          <p className="text-lg text-slate-300">
            Not five tabs across five products. A storyboard becomes a script,
            the script becomes takes, the takes land on a timeline — and an
            agent works every one of them through the tools you click.
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
              <video
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                poster={`/${surface.asset}-poster.webp`}
                muted
                loop
                playsInline
                preload={i === active ? "metadata" : "none"}
                aria-label={`${surface.label} editor, six second loop`}
                className="w-full h-auto block"
              >
                <source src={`/${surface.asset}.webm`} type="video/webm" />
                <source src={`/${surface.asset}.mp4`} type="video/mp4" />
              </video>
            </div>

            <div className="mt-6 max-w-3xl">
              <h3 className="text-xl md:text-2xl font-semibold text-white">
                {surface.headline}
              </h3>
              <p className="mt-2 text-slate-300">{surface.body}</p>
              {surface.deepLink && (
                <a
                  href={surface.deepLink}
                  className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300 focus-ring"
                >
                  More on {surface.label.toLowerCase()} →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
