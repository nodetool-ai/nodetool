"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Download, Play, ArrowUpRight } from "lucide-react";
import { timelineExamples } from "../data/timelineExamples";
import { useAutoplayInView } from "../lib/useAutoplayInView";
import { SmartDownloadButton } from "../app/SmartDownloadButton";

export default function TimelineShowcase() {
  const [selectedSlug, setSelectedSlug] = useState("serein");
  const [started, setStarted] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useAutoplayInView(videoRef, selectedSlug);
  const selected = timelineExamples.find((example) => example.slug === selectedSlug);
  if (!selected) {
    return null;
  }
  const mediaRoot = `/timelines/${selected.slug}`;

  const play = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playbackError) {
      video.load();
    }
    setPlaybackError(false);
    try {
      await video.play();
    } catch {
      setPlaybackError(true);
    }
  };

  return (
    <section id="example-timelines" aria-labelledby="timeline-showcase-title" className="relative scroll-mt-28 py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <h2 id="timeline-showcase-title" className="text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl">
            Watch the film. Make it yours.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
            Made with NodeTool. Open these examples in Studio and change the scenes, text, and motion.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" role="group" aria-label="Example films">
          {timelineExamples.map((example) => (
            <button
              key={example.slug}
              type="button"
              aria-pressed={example.slug === selected.slug}
              aria-controls="timeline-showcase-film"
              onClick={() => {
                if (example.slug !== selectedSlug) {
                  videoRef.current?.pause();
                  setSelectedSlug(example.slug);
                  setStarted(false);
                  setPlaybackError(false);
                }
              }}
              className={`focus-ring overflow-hidden rounded-xl border text-left motion-safe:transition-colors ${example.slug === selected.slug ? "border-amber-300 bg-slate-800" : "border-slate-700 bg-slate-950 hover:border-slate-400"}`}
            >
              <Image
                src={`/timelines/${example.slug}/poster.webp`}
                alt=""
                width={1280}
                height={720}
                sizes="(min-width: 640px) 240px, 50vw"
                className="aspect-video w-full object-cover"
              />
              <span className="block px-3 pb-3 pt-2">
                <span className="block text-base font-medium text-slate-100">{example.name}</span>
                <span className="mt-1 block text-sm text-slate-300">{example.category}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div id="timeline-showcase-film" className="relative aspect-video overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
            <video
              key={selected.slug}
              ref={videoRef}
              src={`${mediaRoot}/film.mp4`}
              poster={`${mediaRoot}/poster.webp`}
              controls
              muted
              loop
              playsInline
              preload="none"
              aria-label={`${selected.name} finished film`}
              onPlaying={() => setStarted(true)}
              onError={() => {
                setStarted(false);
                setPlaybackError(true);
              }}
              className="h-full w-full object-contain"
            />
            {!started && (
              <button
                type="button"
                onClick={play}
                aria-label={`Play ${selected.name}`}
                className="focus-ring absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-slate-500 bg-slate-950 px-5 py-3 text-sm font-medium text-slate-100 hover:bg-slate-800"
              >
                <Play className="h-5 w-5" aria-hidden="true" /> Play film
              </button>
            )}
          </div>

          <div aria-live="polite">
            <p className="text-sm text-amber-300">{selected.category} · {selected.durationSeconds} seconds</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-100">{selected.name}</h3>
            <p className="mt-3 leading-relaxed text-slate-300">{selected.description}</p>
            {playbackError && <p role="alert" className="mt-3 text-slate-100">The film couldn&apos;t load. Try playing it again.</p>}
            <figure className="mt-6">
              <a href={`${mediaRoot}/timeline.webp`} target="_blank" rel="noreferrer" aria-label={`Enlarge ${selected.name}'s editable timeline`} className="focus-ring block overflow-hidden rounded-lg border border-slate-700">
                <Image
                  src={`${mediaRoot}/timeline.webp`}
                  alt={`${selected.name} open in NodeTool's timeline editor, showing the preview and editable tracks`}
                  width={1600}
                  height={1000}
                  sizes="(min-width: 1024px) 400px, 100vw"
                  className="h-auto w-full"
                />
              </a>
              <figcaption className="mt-2 flex items-center gap-1 text-sm text-slate-300">The editable timeline <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></figcaption>
            </figure>
            <div className="mt-6">
              <SmartDownloadButton icon={<Download className="h-4 w-4" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-slate-100 px-5 py-3 text-sm font-medium text-slate-950 hover:bg-slate-200" />
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                In Studio, open Examples from the logo menu, select Timelines, find {selected.name}, then choose “Open editable timeline”.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
