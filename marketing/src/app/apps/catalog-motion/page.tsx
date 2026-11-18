"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Layers,
  Palette,
  Play,
  AlertTriangle,
} from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import FaqSection from "../../../components/FaqSection";
import AutoplayVideo from "../../../components/AutoplayVideo";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import {
  CATALOG_LOOKS,
  CATALOG_MOTION_FAQ,
  CATALOG_MOTION_STEPS,
  CATALOG_SAMPLES,
  PROMPT_TEMPLATE_PREVIEW,
  REFERENCE_SAMPLES,
  SAMPLE_RENDER,
  type CatalogSample,
} from "../../../data/catalogMotionPage";

const stepIcons = [FileSpreadsheet, Palette, FlaskConical, Clapperboard];
const lookTitle = (id: string): string =>
  CATALOG_LOOKS.find((look) => look.id === id)?.title ?? id;
const renderNote = `${SAMPLE_RENDER.model} on ${SAMPLE_RENDER.provider} · ${SAMPLE_RENDER.seconds} s · ${SAMPLE_RENDER.resolution} ${SAMPLE_RENDER.aspect}`;

const fill = (template: string, sample: CatalogSample): string =>
  template
    .replaceAll("{{title}}", sample.title)
    .replaceAll("{{color}}", sample.color)
    .replaceAll("{{description}}", sample.description);

/** The template with each {{column}} shown as a chip. */
function TemplateText({ template }: { template: string }) {
  const parts = template.split(/(\{\{[a-z_]+\}\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{\{[a-z_]+\}\}$/.test(part) ? (
          <span
            key={i}
            className="mx-0.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[0.8em] text-amber-200"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SampleClip({
  sample,
  className = "",
}: {
  sample: CatalogSample;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#efe9df] ${className}`}
    >
      <AutoplayVideo
        src={sample.clip}
        poster={sample.poster}
        preload="none"
        aria-label={`${sample.title}, ${lookTitle(sample.look)} clip rendered from its catalog photo`}
        className="aspect-square w-full object-cover"
      />
    </div>
  );
}

function HeroCatalog() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl backdrop-blur-xs">
      <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
        <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
        <span className="font-mono text-xs text-slate-300">products.csv</span>
        <span className="ml-auto text-xs text-slate-500">
          {CATALOG_SAMPLES.length} rows → {CATALOG_SAMPLES.length} clips
        </span>
      </div>
      <div className="grid gap-px bg-white/5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="bg-slate-950/90 p-3">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-2 pb-2 font-mono text-[11px] uppercase tracking-wide text-slate-500">
            <span>sku</span>
            <span>title</span>
            <span>price</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {CATALOG_SAMPLES.map((sample) => (
              <li
                key={sample.sku}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5"
              >
                <img
                  src={sample.photo}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-md bg-[#efe9df] object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">
                    {sample.title}
                  </div>
                  <div className="truncate font-mono text-[11px] text-slate-500">
                    {sample.sku} · {sample.color}
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-400">
                  ${sample.price}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2 bg-slate-950/90 p-3">
          {CATALOG_SAMPLES.map((sample) => (
            <SampleClip key={sample.sku} sample={sample} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptPreview() {
  const [selected, setSelected] = useState(0);
  const sample = CATALOG_SAMPLES[selected];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xs">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prompt template · one for the whole catalog
        </div>
        <p className="text-base leading-relaxed text-slate-300">
          <TemplateText template={PROMPT_TEMPLATE_PREVIEW} />
        </p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Product row">
          {CATALOG_SAMPLES.map((row, i) => (
            <button
              key={row.sku}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                i === selected
                  ? "border-sky-400/60 bg-sky-500/15 text-sky-200"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white"
              }`}
            >
              Row {row.row} · {row.title}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Filled for row {sample.row}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            {fill(PROMPT_TEMPLATE_PREVIEW, sample)}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,0.6fr)_auto_minmax(0,1fr)] items-center gap-3">
          <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#efe9df]">
            <img
              src={sample.photo}
              alt={`Catalog photo of the ${sample.title}`}
              width={768}
              height={768}
              className="aspect-square w-full object-cover"
            />
          </figure>
          <ArrowRight className="h-5 w-5 text-slate-500" />
          <SampleClip key={sample.sku} sample={sample} />
        </div>
        <p className="text-xs text-slate-500">
          Left: the photo from the row&apos;s image column, used as the first
          frame. Right: the clip, look &ldquo;{lookTitle(sample.look)}&rdquo;,{" "}
          {renderNote}.
        </p>
      </div>
    </div>
  );
}

const expectations = [
  {
    ok: true,
    text: "The product's own photo is the first frame, so its shape, colour and packaging come from your catalog, not from a model's guess.",
  },
  {
    ok: true,
    text: "Every row gets the same look, camera move, frame and length, so a range of clips sits together on a product grid.",
  },
  {
    ok: true,
    text: "Each clip is saved as an asset with the prompt and settings that made it, ready to re-render one product without touching the rest.",
  },
  {
    ok: false,
    text: "Models can soften small print and fine logos during a move. Test the row with the most detailed label first, and pick a calmer look if it drifts.",
  },
  {
    ok: false,
    text: "Match the photo to the clip's shape. These samples are 16:9 clips made from square photos, so each one opens zoomed in and pulls back, and the tall bottle never fits the frame. Crop photos to the frame you render.",
  },
  {
    ok: false,
    text: "A clean packshot on a plain background animates best. Busy lifestyle photos give the model more to reinterpret.",
  },
  {
    ok: false,
    text: "Video is billed per second at your provider's list price. Four 5-second clips are 20 seconds of video, and the summary shows that total before you start.",
  },
];

export default function CatalogMotionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-[18%] h-[520px] w-[520px] rounded-full bg-emerald-600/15 blur-[140px]" />
        <div className="absolute -right-40 top-[36%] h-[480px] w-[480px] rounded-full bg-sky-600/20 blur-[140px]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: "120px 120px",
          }}
        />
      </div>

      <SiteHeader />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pb-16 pt-12 lg:pb-20 lg:pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:px-8">
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Mini app
                <span className="text-emerald-500/60">·</span>
                E-commerce
              </div>
              <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                Your product catalog, as product videos
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-slate-400 md:text-xl">
                Upload the CSV your store exports. Catalog Motion animates each
                product&apos;s own photo with one look for the whole range, so
                every listing gets a clip that matches the rest.
              </p>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <SmartDownloadButton
                  icon={<Download className="h-5 w-5" />}
                  classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] transition-all hover:bg-emerald-400"
                />
                <a
                  href="#results"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-xs transition-all hover:border-white/25 hover:bg-white/5"
                >
                  <Play className="h-4 w-4" />
                  See real results
                </a>
              </div>
              <p className="mt-5 text-sm text-slate-500">
                Ships in Studio as two example apps: Catalog Motion and Catalog
                Motion with References. Runs on your own provider keys.
              </p>
            </motion.div>

            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="relative"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-70 blur-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(16,185,129,0.2), rgba(56,189,248,0.16) 45%, transparent 72%)",
                }}
              />
              <HeroCatalog />
            </motion.div>
          </div>
        </section>

        {/* Results */}
        <section id="results" className="relative scroll-mt-28 py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                What the sample catalog became
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                The four rows of the CSV that ships with the app, rendered
                with the app&apos;s own looks and shown here as a centred
                square crop. {renderNote}. Hover a clip to compare it with the
                photo it started from.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {CATALOG_SAMPLES.map((sample) => (
                <figure
                  key={sample.sku}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xs"
                >
                  <div className="relative">
                    <SampleClip
                      sample={sample}
                      className="rounded-none border-0"
                    />
                    <img
                      src={sample.photo}
                      alt={`Catalog photo of the ${sample.title}`}
                      width={768}
                      height={768}
                      className="absolute left-3 top-3 h-16 w-16 rounded-lg border border-white/40 bg-[#efe9df] object-cover shadow-lg transition-all duration-300 group-hover:h-[calc(100%-1.5rem)] group-hover:w-[calc(100%-1.5rem)]"
                    />
                  </div>
                  <figcaption className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-white">
                        {sample.title}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        row {sample.row}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {sample.sku} · ${sample.price}
                    </div>
                    <div className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200">
                      <Palette className="h-3.5 w-3.5" />
                      {lookTitle(sample.look)}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Template */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                One prompt, filled from every row
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                You direct the camera and the light once. Placeholders such as{" "}
                <span className="font-mono text-amber-200">{"{{title}}"}</span>{" "}
                and <span className="font-mono text-amber-200">{"{{color}}"}</span>{" "}
                take each product&apos;s values from its own columns, and the app
                shows every filled prompt before anything is rendered.
              </p>
            </div>
            <PromptPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative scroll-mt-28 py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                How it works
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                Four steps in the app, with nothing paid for until you test a
                row.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CATALOG_MOTION_STEPS.map((step, i) => {
                const Icon = stepIcons[i];
                return (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xs"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-base font-semibold text-white">
                      <span className="mr-2 font-mono text-sm text-emerald-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {step.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Looks */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Four looks to start from
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                Each look directs one camera or light move, which is what a
                first-frame video model does reliably. Pick one in the app,
                then edit the words.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CATALOG_LOOKS.map((look) => {
                const sample = CATALOG_SAMPLES.find((s) => s.look === look.id);
                return (
                  <div
                    key={look.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xs"
                  >
                    {sample ? (
                      <SampleClip
                        sample={sample}
                        className="rounded-none border-0"
                      />
                    ) : null}
                    <div className="p-5">
                      <h3 className="font-semibold text-white">{look.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                        {look.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* References */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xs md:p-10">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-300">
                  <Layers className="h-3.5 w-3.5" />
                  Catalog Motion with References
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight md:text-3xl">
                  Put the whole catalog in your own scene
                </h2>
                <p className="mt-4 leading-relaxed text-slate-400">
                  Add one background and one prop image for the catalog. Each
                  product&apos;s photo stays image 1, and a reference-to-video
                  model builds a new shot of it in your setting.{" "}
                  {SAMPLE_RENDER.referenceModel} on {SAMPLE_RENDER.provider},{" "}
                  {SAMPLE_RENDER.seconds} s, {SAMPLE_RENDER.resolution}.
                </p>
              </div>
              <div className="mt-10 flex flex-col gap-10">
                {REFERENCE_SAMPLES.map((sample) => (
                  <div
                    key={sample.clip}
                    className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)]"
                  >
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ["Product", sample.product],
                        ["Background", sample.background],
                        ["Decoration", sample.decoration],
                      ].map(([label, src]) => (
                        <figure key={label} className="flex flex-col gap-1.5">
                          <img
                            src={src}
                            alt={`${label} reference for the ${sample.title} clip`}
                            width={512}
                            height={512}
                            className="aspect-square w-full rounded-lg border border-white/10 object-cover"
                          />
                          <figcaption className="text-xs text-slate-500">
                            {label}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-slate-500 md:rotate-0" />
                    <figure className="flex flex-col gap-1.5">
                      <AutoplayVideo
                        src={sample.clip}
                        poster={sample.poster}
                        preload="none"
                        aria-label={`${sample.title} in the reference scene, ${sample.look} look`}
                        className="aspect-square w-full rounded-xl border border-white/10 object-cover"
                      />
                      <figcaption className="text-xs text-slate-500">
                        {sample.title} · look &ldquo;{sample.look}&rdquo;
                      </figcaption>
                    </figure>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Expectations */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                What to expect
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-400">
                What the app holds steady, and where a video model still needs
                your eye.
              </p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {expectations.map((item) => (
                <li
                  key={item.text}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-300"
                >
                  {item.ok ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  )}
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="relative py-8">
          <FaqSection
            items={CATALOG_MOTION_FAQ}
            className="mx-auto max-w-3xl px-6"
          />
        </div>

        <section className="relative py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Animate your catalog
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Download Studio for macOS, Windows or Linux, open Catalog Motion
              from the example apps, and test one row of your own CSV.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] transition-all hover:bg-emerald-400"
              />
              <a
                href="/use-cases/product-video"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-xs transition-all hover:border-white/25 hover:bg-white/5"
              >
                One product, one film
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
