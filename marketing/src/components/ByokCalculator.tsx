"use client";
/**
 * The BYOK calculator: what a month of generation costs when you pay the
 * provider directly, and what the same month costs bought as credits.
 *
 * The two sides are the same model. `CALCULATOR_PAIRS` holds every model
 * Figma Weave sells for credits that Kie or AtlasCloud also serves, so a row
 * is one model priced twice — once through a plan's credit allowance, once at
 * the provider's list price on your own key. Weave models neither provider
 * carries are named in the copy rather than dropped in silence.
 *
 * Both sides are arithmetic over published figures — GenSpend's catalog for
 * the provider prices, Weave's own plan and generation table for the credits
 * — so the comparison can come out either way, and does.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Info } from "lucide-react";

import {
  CALCULATOR_MODELS,
  CALCULATOR_PAIRS,
  PRICING_ATTRIBUTION,
  PRICING_UPDATED_AT,
  UNPAIRED_WEAVE_MODELS,
  type CalculatorModel,
  type CalculatorPair,
} from "../data/calculatorPricing.generated";
import {
  WEAVE_DEFAULT_CLIP_SECONDS,
  WEAVE_MODELS,
  WEAVE_PLANS,
  WEAVE_SOURCE,
  creditsPerGeneration,
  weaveMonthlyCost,
  type WeaveModel,
} from "../data/weavePricing";
import { PROVIDER_DISPLAY } from "../data/providerDisplay";
import { track } from "../lib/analytics";

/** 950 characters is about a minute of narration at a normal reading pace. */
const CHARS_PER_MINUTE = 950;

const IMAGE_PAIRS = CALCULATOR_PAIRS.filter((p) => p.modality === "image");
const VIDEO_PAIRS = CALCULATOR_PAIRS.filter((p) => p.modality === "video");
const SPEECH_MODELS = CALCULATOR_MODELS.speech;

/** The Weave row a pair names. Pairs are generated against this table. */
const weaveModel = (pair: CalculatorPair): WeaveModel | undefined =>
  WEAVE_MODELS.find((m) => m.name === pair.weaveName);

const trim = (n: number, places: number) =>
  n.toFixed(places).replace(/0+$/, "").replace(/\.$/, "");

const usd = (n: number) =>
  n >= 100
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : n >= 1
      ? `$${n.toFixed(2)}`
      : `$${n.toFixed(3)}`;

const providerName = (id: string) => PROVIDER_DISPLAY[id]?.name ?? id;

const selectClass =
  "min-w-0 flex-1 rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus-ring";

export default function ByokCalculator() {
  const [images, setImages] = useState(750);
  const [clips, setClips] = useState(24);
  const [voiceMinutes, setVoiceMinutes] = useState(120);
  const [clipSeconds, setClipSeconds] = useState(WEAVE_DEFAULT_CLIP_SECONDS);
  const [imagePair, setImagePair] = useState("Seedream V5");
  const [videoPair, setVideoPair] = useState("Seedance 1.5");
  const [voiceModelId, setVoiceModelId] = useState(SPEECH_MODELS[8].id);
  const [planId, setPlanId] = useState("professional");
  const [tracked, setTracked] = useState(false);

  // One event per visitor who touches it — a slider drag would otherwise emit
  // dozens.
  const noteInteraction = useCallback(() => {
    if (tracked) return;
    setTracked(true);
    track("Calculator Interaction");
  }, [tracked]);

  const image =
    IMAGE_PAIRS.find((p) => p.weaveName === imagePair) ?? IMAGE_PAIRS[0];
  const video =
    VIDEO_PAIRS.find((p) => p.weaveName === videoPair) ?? VIDEO_PAIRS[0];
  const voice =
    SPEECH_MODELS.find((m: CalculatorModel) => m.id === voiceModelId) ??
    SPEECH_MODELS[0];

  const imageCost = images * image.unitPrice;
  const videoCost = clips * clipSeconds * video.unitPrice;
  const voiceCost = ((voiceMinutes * CHARS_PER_MINUTE) / 1_000_000) * voice.unitPrice;
  const direct = imageCost + videoCost + voiceCost;
  /** The comparable half: Weave ships no voice model, so voice is excluded. */
  const directComparable = imageCost + videoCost;

  const weave = useMemo(() => {
    const plan = WEAVE_PLANS.find((p) => p.id === planId) ?? WEAVE_PLANS[2];
    const imageModel = weaveModel(image);
    const videoModel = weaveModel(video);
    if (!imageModel || !videoModel) return null;
    return {
      plan,
      cost: weaveMonthlyCost({ plan, imageModel, images, videoModel, clips }),
      perImage: creditsPerGeneration(imageModel, plan),
      perClip: creditsPerGeneration(videoModel, plan),
    };
  }, [clips, image, images, planId, video]);

  const unpairedCount = Object.keys(UNPAIRED_WEAVE_MODELS).length;

  const bump = <T,>(set: (v: T) => void) => (value: T) => {
    noteInteraction();
    set(value);
  };

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
            The same model, priced twice
          </h2>
          <p className="text-lg text-slate-300">
            NodeTool bills you nothing per generation — you hold the keys and
            pay each provider its list price. Set a workload and compare it with
            the same models bought as {WEAVE_SOURCE.name} credits.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
          {/* Inputs */}
          <div className="card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md p-6 sm:p-8">
            <ul className="space-y-8">
              {/* Images */}
              <li>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <label
                    htmlFor="byok-images"
                    className="text-base font-semibold text-white"
                  >
                    Images
                  </label>
                  <span className="text-sm text-slate-400">
                    <span className="tabular-nums text-slate-200">
                      {images.toLocaleString("en-US")}
                    </span>{" "}
                    images / month
                  </span>
                </div>
                <input
                  id="byok-images"
                  type="range"
                  min={0}
                  max={5000}
                  step={25}
                  value={images}
                  onChange={(e) => bump(setImages)(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Image model"
                    value={image.weaveName}
                    onChange={(e) => bump(setImagePair)(e.target.value)}
                    className={selectClass}
                  >
                    {IMAGE_PAIRS.map((p) => (
                      <option key={p.weaveName} value={p.weaveName}>
                        {p.weaveName} — {providerName(p.provider)}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-400 tabular-nums">
                    ${trim(image.unitPrice, 4)} / image
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Stills, variations, and every reroll you throw away.
                </p>
              </li>

              {/* Video */}
              <li>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <label
                    htmlFor="byok-clips"
                    className="text-base font-semibold text-white"
                  >
                    Video
                  </label>
                  <span className="text-sm text-slate-400">
                    <span className="tabular-nums text-slate-200">{clips}</span>{" "}
                    clips / month
                  </span>
                </div>
                <input
                  id="byok-clips"
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={clips}
                  onChange={(e) => bump(setClips)(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Video model"
                    value={video.weaveName}
                    onChange={(e) => bump(setVideoPair)(e.target.value)}
                    className={selectClass}
                  >
                    {VIDEO_PAIRS.map((p) => (
                      <option key={p.weaveName} value={p.weaveName}>
                        {p.weaveName} — {providerName(p.provider)}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-400 tabular-nums">
                    ${trim(video.unitPrice, 4)} / second
                  </span>
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                  <span>Clip length</span>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    step={1}
                    value={clipSeconds}
                    onChange={(e) => bump(setClipSeconds)(Number(e.target.value))}
                    aria-label="Seconds per clip"
                    className="w-40 accent-emerald-400"
                  />
                  <span className="tabular-nums text-slate-200">
                    {clipSeconds}s
                  </span>
                </label>
                <p className="mt-2 text-sm text-slate-500">
                  A provider bills the second, a credit plan bills the clip — so
                  the length matters to one side and not the other.
                </p>
              </li>

              {/* Voice */}
              <li>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <label
                    htmlFor="byok-voice"
                    className="text-base font-semibold text-white"
                  >
                    Voice
                  </label>
                  <span className="text-sm text-slate-400">
                    <span className="tabular-nums text-slate-200">
                      {voiceMinutes.toLocaleString("en-US")}
                    </span>{" "}
                    minutes / month
                  </span>
                </div>
                <input
                  id="byok-voice"
                  type="range"
                  min={0}
                  max={1200}
                  step={5}
                  value={voiceMinutes}
                  onChange={(e) => bump(setVoiceMinutes)(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Voice model"
                    value={voice.id}
                    onChange={(e) => bump(setVoiceModelId)(e.target.value)}
                    className={selectClass}
                  >
                    {SPEECH_MODELS.map((m: CalculatorModel) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {providerName(m.provider)}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-400 tabular-nums">
                    ${voice.unitPrice} / 1M characters
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Narration minutes, billed by character (~{CHARS_PER_MINUTE} per
                  minute). {WEAVE_SOURCE.name} has no voice model, so this line
                  has nothing to compare against.
                </p>
              </li>
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
              <li className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-400">
                  Images<span className="text-slate-600"> · </span>
                  <span className="text-slate-500">{image.weaveName}</span>
                </span>
                <span className="tabular-nums text-slate-200">
                  {usd(imageCost)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-400">
                  Video<span className="text-slate-600"> · </span>
                  <span className="text-slate-500">{video.weaveName}</span>
                </span>
                <span className="tabular-nums text-slate-200">
                  {usd(videoCost)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-400">
                  Voice<span className="text-slate-600"> · </span>
                  <span className="text-slate-500">{voice.name}</span>
                </span>
                <span className="tabular-nums text-slate-200">
                  {usd(voiceCost)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 text-sm pt-2">
                <span className="text-slate-400">NodeTool Studio</span>
                <span className="tabular-nums text-emerald-400">$0</span>
              </li>
            </ul>

            {/* The same two models, bought as credits. */}
            {weave && (
              <div className="mt-8 border-t border-slate-800 pt-6">
                <p className="text-sm uppercase tracking-widest text-slate-400">
                  The same models on {WEAVE_SOURCE.name}
                </p>

                <select
                  aria-label={`${WEAVE_SOURCE.name} plan`}
                  value={planId}
                  onChange={(e) => bump(setPlanId)(e.target.value)}
                  className={`${selectClass} mt-3 w-full`}
                >
                  {WEAVE_PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.monthlyUsd}
                      {p.perUser ? " / user" : ""} / month,{" "}
                      {p.creditsPerMonth.toLocaleString("en-US")} credits
                    </option>
                  ))}
                </select>

                <p className="mt-4 text-3xl font-semibold text-slate-300 tabular-nums">
                  {usd(weave.cost.totalUsd)}
                  <span className="ml-2 text-base font-normal text-slate-500">
                    / month
                  </span>
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  {weave.cost.unavailable ? (
                    <>
                      {weave.plan.name} does not carry one of those models, or
                      cannot top up past its allowance — that workload does not
                      fit on this plan.
                    </>
                  ) : (
                    <>
                      {Math.round(weave.cost.creditsNeeded).toLocaleString(
                        "en-US"
                      )}{" "}
                      of {weave.cost.creditsIncluded.toLocaleString("en-US")}{" "}
                      credits
                      {weave.cost.topupUsd > 0 && (
                        <>
                          , so {usd(weave.cost.topupUsd)} of top-ups on top of
                          the {usd(weave.cost.planUsd)} plan
                        </>
                      )}
                      . Against {usd(directComparable)} for the same images and
                      clips on your own keys.
                    </>
                  )}
                </p>

                {weave.perImage !== null && weave.perClip !== null && (
                  <p className="mt-2 text-xs text-slate-500 tabular-nums">
                    {trim(weave.perImage, 2)} credits an image,{" "}
                    {trim(weave.perClip, 2)} a clip, derived from{" "}
                    {WEAVE_SOURCE.name}&apos;s own table. It prices a clip, not
                    a second, and does not publish clip length.
                  </p>
                )}
              </div>
            )}

            <p className="mt-8 flex items-start gap-2 text-xs text-slate-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                The picker holds the {CALCULATOR_PAIRS.length} models
                {" "}{WEAVE_SOURCE.name} sells that Kie or AtlasCloud also
                serves, so both columns price the same model. Its other{" "}
                {unpairedCount} are left out because neither provider carries
                them. {PRICING_ATTRIBUTION}, updated{" "}
                {new Date(PRICING_UPDATED_AT).toISOString().slice(0, 10)}.{" "}
                <a
                  href={WEAVE_SOURCE.url}
                  rel="nofollow noopener"
                  className="underline hover:text-slate-300"
                >
                  {WEAVE_SOURCE.name} plans
                </a>{" "}
                read {WEAVE_SOURCE.readOn}. Local models through Ollama, MLX,
                and llama.cpp cost nothing per call.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
