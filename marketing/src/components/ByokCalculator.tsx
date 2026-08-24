"use client";
/**
 * The BYOK calculator: what a month of generation costs when you pay the
 * provider directly, and what the same month costs on a platform that sells
 * the calls back to you in credits.
 *
 * NodeTool's side reads `calculatorPricing.generated.ts`, which comes from the
 * GenSpend catalog NodeTool bills a run against. The credit side reads
 * `weavePricing.ts` — Figma Weave's own published plans and per-model
 * generation counts, transcribed with the URL and the date they were read.
 * Neither side is a rate this page invented, and the comparison is arithmetic
 * on both, so it can come out either way.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Info } from "lucide-react";

import {
  CALCULATOR_MODELS,
  PRICED_MODEL_COUNT,
  PRICING_ATTRIBUTION,
  PRICING_UPDATED_AT,
  type CalculatorModality,
  type CalculatorModel,
} from "../data/calculatorPricing.generated";
import {
  WEAVE_DEFAULT_CLIP_SECONDS,
  WEAVE_MODELS,
  WEAVE_PLANS,
  WEAVE_SOURCE,
  creditsPerGeneration,
  weaveMonthlyCost,
} from "../data/weavePricing";
import { PROVIDER_DISPLAY } from "../data/providerDisplay";
import { track } from "../lib/analytics";

interface Row {
  modality: CalculatorModality;
  label: string;
  unitLabel: string;
  /** Volume → billable units. Video bills per second, speech per 1M chars. */
  toBillable: (volume: number, clipSeconds: number) => number;
  priceLabel: (price: number) => string;
  max: number;
  step: number;
  initialVolume: number;
  /** Index into the modality's price-sorted list. */
  initialModel: number;
  hint: string;
}

/** 950 characters is about a minute of narration at a normal reading pace. */
const CHARS_PER_MINUTE = 950;

const trim = (n: number, places: number) =>
  n.toFixed(places).replace(/0+$/, "").replace(/\.$/, "");

const ROWS: Row[] = [
  {
    modality: "image",
    label: "Images",
    unitLabel: "images / month",
    toBillable: (v) => v,
    priceLabel: (p) => `$${trim(p, 4)} / image`,
    max: 5000,
    step: 25,
    initialVolume: 750,
    initialModel: 6,
    hint: "Stills, variations, and every reroll you throw away.",
  },
  {
    modality: "video",
    label: "Video",
    unitLabel: "clips / month",
    toBillable: (v, clipSeconds) => v * clipSeconds,
    priceLabel: (p) => `$${trim(p, 3)} / second`,
    max: 200,
    step: 1,
    initialVolume: 24,
    initialModel: 5,
    hint: "Rendered clips. Credit plans bill a clip, providers bill a second.",
  },
  {
    modality: "speech",
    label: "Voice",
    unitLabel: "minutes / month",
    toBillable: (v) => (v * CHARS_PER_MINUTE) / 1_000_000,
    priceLabel: (p) => `$${p} / 1M characters`,
    max: 1200,
    step: 5,
    initialVolume: 120,
    initialModel: 8,
    hint: `Narration minutes, billed by character (~${CHARS_PER_MINUTE} per minute).`,
  },
];

const WEAVE_IMAGE_MODELS = WEAVE_MODELS.filter((m) => m.kind === "image");
const WEAVE_VIDEO_MODELS = WEAVE_MODELS.filter((m) => m.kind === "video");

const usd = (n: number) =>
  n >= 100
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : n >= 1
      ? `$${n.toFixed(2)}`
      : `$${n.toFixed(3)}`;

const providerName = (id: string) => PROVIDER_DISPLAY[id]?.name ?? id;

export default function ByokCalculator() {
  const [volumes, setVolumes] = useState<number[]>(() =>
    ROWS.map((r) => r.initialVolume)
  );
  const [models, setModels] = useState<string[]>(() =>
    ROWS.map((r) => CALCULATOR_MODELS[r.modality][r.initialModel].id)
  );
  const [clipSeconds, setClipSeconds] = useState(WEAVE_DEFAULT_CLIP_SECONDS);
  const [planId, setPlanId] = useState("professional");
  const [weaveImage, setWeaveImage] = useState("Seedream V5");
  const [weaveVideo, setWeaveVideo] = useState("Seedance 1.5");
  const [tracked, setTracked] = useState(false);

  // One event per visitor who touches it — a slider drag would otherwise emit
  // dozens.
  const noteInteraction = useCallback(() => {
    if (tracked) return;
    setTracked(true);
    track("Calculator Interaction");
  }, [tracked]);

  const lines = useMemo(
    () =>
      ROWS.map((row, i) => {
        const options = CALCULATOR_MODELS[row.modality];
        const model =
          options.find((m) => m.id === models[i]) ?? options[row.initialModel];
        const billable = row.toBillable(volumes[i], clipSeconds);
        return { row, model, volume: volumes[i], cost: billable * model.unitPrice };
      }),
    [clipSeconds, models, volumes]
  );

  const direct = lines.reduce((sum, l) => sum + l.cost, 0);
  const voiceCost = lines[2].cost;

  const weave = useMemo(() => {
    const plan = WEAVE_PLANS.find((p) => p.id === planId) ?? WEAVE_PLANS[2];
    const imageModel =
      WEAVE_IMAGE_MODELS.find((m) => m.name === weaveImage) ?? WEAVE_IMAGE_MODELS[0];
    const videoModel =
      WEAVE_VIDEO_MODELS.find((m) => m.name === weaveVideo) ?? WEAVE_VIDEO_MODELS[0];
    return {
      plan,
      imageModel,
      videoModel,
      cost: weaveMonthlyCost({
        plan,
        imageModel,
        images: volumes[0],
        videoModel,
        clips: volumes[1],
      }),
      perImage: creditsPerGeneration(imageModel, plan),
      perClip: creditsPerGeneration(videoModel, plan),
    };
  }, [planId, volumes, weaveImage, weaveVideo]);

  /** The comparable half: Weave ships no voice model, so voice is excluded. */
  const directComparable = direct - voiceCost;

  const setVolume = (i: number, value: number) => {
    noteInteraction();
    setVolumes((prev) => prev.map((v, j) => (j === i ? value : v)));
  };
  const setModel = (i: number, id: string) => {
    noteInteraction();
    setModels((prev) => prev.map((v, j) => (j === i ? id : v)));
  };

  const selectClass =
    "min-w-0 flex-1 rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus-ring";

  return (
    <section
      id="byok-calculator"
      aria-labelledby="byok-calculator-title"
      className="relative py-24 scroll-mt-24 overflow-clip-safe"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-emerald-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <h2
            id="byok-calculator-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            What your month actually costs
          </h2>
          <p className="text-lg text-slate-300">
            NodeTool bills you nothing per generation. You hold the keys and pay
            each provider its list price. Set a workload and see the bill — then
            price the same work in credits.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* Inputs */}
          <div className="card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md p-6 sm:p-8">
            <ul className="space-y-8">
              {lines.map(({ row, model, volume }, i) => (
                <li key={row.modality}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <label
                      htmlFor={`byok-volume-${row.modality}`}
                      className="text-base font-semibold text-white"
                    >
                      {row.label}
                    </label>
                    <span className="text-sm text-slate-400">
                      <span className="tabular-nums text-slate-200">
                        {volume.toLocaleString("en-US")}
                      </span>{" "}
                      {row.unitLabel}
                    </span>
                  </div>

                  <input
                    id={`byok-volume-${row.modality}`}
                    type="range"
                    min={0}
                    max={row.max}
                    step={row.step}
                    value={volume}
                    onChange={(e) => setVolume(i, Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <select
                      aria-label={`${row.label} model`}
                      value={model.id}
                      onChange={(e) => setModel(i, e.target.value)}
                      className={selectClass}
                    >
                      {CALCULATOR_MODELS[row.modality].map((m: CalculatorModel) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {providerName(m.provider)}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-slate-400 tabular-nums">
                      {row.priceLabel(model.unitPrice)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">{row.hint}</p>

                  {row.modality === "video" && (
                    <label className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span>Clip length</span>
                      <input
                        type="range"
                        min={2}
                        max={20}
                        step={1}
                        value={clipSeconds}
                        onChange={(e) => {
                          noteInteraction();
                          setClipSeconds(Number(e.target.value));
                        }}
                        aria-label="Seconds per clip"
                        className="w-40 accent-emerald-400"
                      />
                      <span className="tabular-nums text-slate-200">
                        {clipSeconds}s
                      </span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Result */}
          <div className="card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md p-6 sm:p-8 flex flex-col">
            <p className="text-sm uppercase tracking-widest text-slate-400">
              Your keys, direct
            </p>
            <p className="mt-2 text-5xl font-bold text-white tabular-nums">
              {usd(direct)}
              <span className="ml-2 text-lg font-normal text-slate-400">
                / month
              </span>
            </p>

            <ul className="mt-6 space-y-2 border-t border-slate-800 pt-6">
              {lines.map(({ row, model, cost }) => (
                <li
                  key={row.modality}
                  className="flex items-baseline justify-between gap-3 text-sm"
                  title={`${model.name} on ${providerName(model.provider)} at ${row.priceLabel(model.unitPrice)}`}
                >
                  <span className="text-slate-400">
                    {row.label}
                    <span className="text-slate-600"> · </span>
                    <span className="text-slate-500">{model.name}</span>
                  </span>
                  <span className="tabular-nums text-slate-200">{usd(cost)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 text-sm pt-2">
                <span className="text-slate-400">NodeTool Studio</span>
                <span className="tabular-nums text-emerald-400">$0</span>
              </li>
            </ul>

            {/* The same images and clips, bought as credits. */}
            <div className="mt-8 border-t border-slate-800 pt-6">
              <p className="text-sm uppercase tracking-widest text-slate-400">
                The same work on {WEAVE_SOURCE.name}
              </p>

              <div className="mt-3 space-y-2">
                <select
                  aria-label={`${WEAVE_SOURCE.name} plan`}
                  value={planId}
                  onChange={(e) => {
                    noteInteraction();
                    setPlanId(e.target.value);
                  }}
                  className={`${selectClass} w-full`}
                >
                  {WEAVE_PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.monthlyUsd}
                      {p.perUser ? " / user" : ""} / month,{" "}
                      {p.creditsPerMonth.toLocaleString("en-US")} credits
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${WEAVE_SOURCE.name} image model`}
                  value={weaveImage}
                  onChange={(e) => {
                    noteInteraction();
                    setWeaveImage(e.target.value);
                  }}
                  className={`${selectClass} w-full`}
                >
                  {WEAVE_IMAGE_MODELS.map((m) => (
                    <option key={m.name} value={m.name}>
                      Images: {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${WEAVE_SOURCE.name} video model`}
                  value={weaveVideo}
                  onChange={(e) => {
                    noteInteraction();
                    setWeaveVideo(e.target.value);
                  }}
                  className={`${selectClass} w-full`}
                >
                  {WEAVE_VIDEO_MODELS.map((m) => (
                    <option key={m.name} value={m.name}>
                      Video: {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Each list is that platform&apos;s own, and they do not line up
                one to one — pick the closest pair before reading the two
                numbers against each other.
              </p>

              <p className="mt-4 text-3xl font-semibold text-slate-300 tabular-nums">
                {usd(weave.cost.totalUsd)}
                <span className="ml-2 text-base font-normal text-slate-500">
                  / month
                </span>
              </p>

              <p className="mt-2 text-sm text-slate-400">
                {weave.cost.unavailable ? (
                  <>
                    {weave.plan.name} does not offer one of those models, or
                    cannot top up past its allowance — that workload does not fit
                    on this plan.
                  </>
                ) : (
                  <>
                    {Math.round(weave.cost.creditsNeeded).toLocaleString("en-US")}{" "}
                    of {weave.cost.creditsIncluded.toLocaleString("en-US")} credits
                    {weave.cost.topupUsd > 0 && (
                      <>
                        , so {usd(weave.cost.topupUsd)} of top-ups on top of the{" "}
                        {usd(weave.cost.planUsd)} plan
                      </>
                    )}
                    . Against {usd(directComparable)} for the same images and
                    clips on your own keys — voice is left out of this line
                    because {WEAVE_SOURCE.name} ships no voice model.
                  </>
                )}
              </p>

              {weave.perImage !== null && weave.perClip !== null && (
                <p className="mt-2 text-xs text-slate-500 tabular-nums">
                  {trim(weave.perImage, 2)} credits an image,{" "}
                  {trim(weave.perClip, 2)} a clip — derived from{" "}
                  {WEAVE_SOURCE.name}&apos;s own table. It prices a clip, not a
                  second, and does not publish clip length.
                </p>
              )}
            </div>

            <p className="mt-8 flex items-start gap-2 text-xs text-slate-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                {PRICED_MODEL_COUNT} priced models in the catalog NodeTool bills
                against. {PRICING_ATTRIBUTION}, updated{" "}
                {new Date(PRICING_UPDATED_AT).toISOString().slice(0, 10)}.{" "}
                <a
                  href={WEAVE_SOURCE.url}
                  rel="nofollow noopener"
                  className="underline hover:text-slate-300"
                >
                  {WEAVE_SOURCE.name} plans
                </a>{" "}
                read {WEAVE_SOURCE.readOn}. Local models through Ollama, MLX, and
                llama.cpp cost nothing per call.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
