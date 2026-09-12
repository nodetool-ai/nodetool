"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Check, Copy, Pause, Play } from "lucide-react";
import type { RecipeGuide as Guide } from "@/data/recipes";

interface RecipeGuideProps {
  guide: Guide;
}

export default function RecipeGuide({ guide }: RecipeGuideProps) {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [isInView, setIsInView] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const step = guide.steps[selected];
  const canAutoplay =
    autoplayEnabled &&
    isInView &&
    !prefersReducedMotion &&
    guide.steps.length > 1;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.35 }
    );
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canAutoplay) return;

    const interval = window.setInterval(() => {
      setSelected((current) => (current + 1) % guide.steps.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [canAutoplay, guide.steps.length]);

  function selectStep(index: number) {
    setSelected(index);
    setAutoplayEnabled(false);
    const content = contentRef.current;
    if (!content) return;
    const top = content.getBoundingClientRect().top;
    if (top < 128 || top > window.innerHeight / 2) {
      content.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(guide.brief);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <section
      id="guided-flow"
      aria-labelledby="guide-title"
      className="scroll-mt-28 py-12"
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <h2
          id="guide-title"
          className="text-3xl font-semibold tracking-tight md:text-4xl"
        >
          Follow the {guide.entry} guide
        </h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-300">
          {guide.introduction}
        </p>
        <div className="mt-8 grid gap-8 border-t border-white/10 pt-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div>
            <h3 className="text-lg font-semibold">Bring to this recipe</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
              {guide.inputs.map((input) => (
                <li key={input} className="flex gap-2">
                  <Check
                    className="mt-1 h-4 w-4 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  <span>{input}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">
                {guide.entry === "Script"
                  ? "Try the example script"
                  : "Try the example brief"}
              </h3>
              <button
                type="button"
                onClick={copyBrief}
                className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-300"
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p
              className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300"
              lang={guide.entry === "Script" ? "es" : undefined}
            >
              {guide.brief}
            </p>
            <p role="status" className="mt-2 text-sm text-slate-400">
              {copyError
                ? "Select the text above and copy it to use this example."
                : copied
                  ? "Copied to clipboard."
                  : ""}
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-400">
          {guide.note}
        </p>
        <p className="mt-5 text-sm text-amber-300">
          {guide.stages.join(" → ")}
        </p>
        <div
          id="recipe-step-content"
          ref={contentRef}
          className="mt-8 min-w-0 scroll-mt-32"
        >
          <div className="flex items-center gap-3 border-y border-white/10 py-2">
            <nav
              aria-label="Recipe steps"
              className="min-w-0 flex-1 overflow-x-auto"
            >
              <ol className="flex min-w-max items-center gap-1">
                {guide.steps.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectStep(index)}
                      aria-current={index === selected ? "step" : undefined}
                      aria-controls="recipe-step-details"
                      className={`focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${index === selected ? "bg-white/10 text-amber-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
                    >
                      <span className="text-xs tabular-nums text-slate-500">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium">{item.stage}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <button
              type="button"
              onClick={() => setAutoplayEnabled((enabled) => !enabled)}
              disabled={prefersReducedMotion}
              aria-pressed={autoplayEnabled && !prefersReducedMotion}
              aria-label={
                prefersReducedMotion
                  ? "Autoplay disabled by reduced motion preference"
                  : autoplayEnabled
                    ? "Pause step autoplay"
                    : "Resume step autoplay"
              }
              className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 disabled:cursor-default disabled:opacity-50"
            >
              {autoplayEnabled && !prefersReducedMotion ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {autoplayEnabled && !prefersReducedMotion ? "Auto" : "Paused"}
              </span>
            </button>
          </div>
          {step.image && (
            <figure className="mt-5">
              <a
                href={step.image.src}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring block w-full overflow-hidden rounded-xl border border-white/15 bg-slate-950"
                aria-label={`Open full-size screenshot: ${step.title}`}
              >
                <Image
                  src={step.image.src}
                  alt={step.image.alt}
                  width={step.image.width ?? 3200}
                  height={step.image.height ?? 2000}
                  quality={90}
                  sizes="(min-width: 1280px) 1152px, calc(100vw - 48px)"
                  className="h-auto w-full"
                />
              </a>
              <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                {step.image.caption} Open the image to inspect it at full size.
              </figcaption>
            </figure>
          )}
          <div
            id="recipe-step-details"
            aria-live={canAutoplay ? "off" : "polite"}
            aria-atomic="true"
            className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)] md:items-start"
          >
            <div>
              <p className="text-sm text-amber-300">
                Step {selected + 1} of {guide.steps.length} · {step.phase}
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
                {step.description}
              </p>
            </div>
            <p className="flex items-start gap-2 border-l border-white/10 pl-5 text-sm font-medium leading-relaxed text-slate-200">
              <ArrowRight
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
                aria-hidden="true"
              />
              {step.action}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
