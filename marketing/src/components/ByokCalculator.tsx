"use client";
/**
 * The BYOK calculator: what a month of generation costs when you pay the
 * provider directly, and what the same month costs on a platform that resells
 * the call to you.
 *
 * Every unit price is read from `calculatorPricing.generated.ts`, which comes
 * from the GenSpend catalog NodeTool bills a run against. The resale side is
 * an assumption the reader sets, not a claim about a named competitor — the
 * multiplier is a control, and it says so.
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
import { PROVIDER_DISPLAY } from "../data/providerDisplay";
import { track } from "../lib/analytics";

interface Row {
  modality: CalculatorModality;
  label: string;
  /** What one unit of `volume` is, in the reader's terms. */
  unitLabel: string;
  /** Volume → billable units, since speech is priced per million characters. */
  toBillable: (volume: number) => number;
  /** How the unit price reads on its own line. */
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

const ROWS: Row[] = [
  {
    modality: "image",
    label: "Images",
    unitLabel: "images / month",
    toBillable: (v) => v,
    priceLabel: (p) => `$${p.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} / image`,
    max: 5000,
    step: 25,
    initialVolume: 750,
    initialModel: 6,
    hint: "Stills, variations, and every reroll you throw away.",
  },
  {
    modality: "video",
    label: "Video",
    unitLabel: "seconds / month",
    toBillable: (v) => v,
    priceLabel: (p) => `$${p.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} / second`,
    max: 1800,
    step: 5,
    initialVolume: 180,
    initialModel: 5,
    hint: "Rendered clip seconds — 180 is about thirty six-second shots.",
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

const usd = (n: number) =>
  n >= 100
    ? `$${Math.round(n).toLocaleString("en-US")}`
    : n >= 1
      ? `$${n.toFixed(2)}`
      : `$${n.toFixed(3)}`;

const providerName = (id: string) => PROVIDER_DISPLAY[id]?.name ?? id;

/** Resale rates a reader can compare against. 1× is "you pay the provider". */
const MULTIPLIERS = [1.5, 2, 3];

export default function ByokCalculator() {
  const [volumes, setVolumes] = useState<number[]>(() =>
    ROWS.map((r) => r.initialVolume)
  );
  const [models, setModels] = useState<string[]>(() =>
    ROWS.map((r) => CALCULATOR_MODELS[r.modality][r.initialModel].id)
  );
  const [multiplier, setMultiplier] = useState(2);
  const [tracked, setTracked] = useState(false);

  // One event per visitor who touches it — a slider drag would otherwise
  // emit dozens.
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
        const billable = row.toBillable(volumes[i]);
        return { row, model, volume: volumes[i], cost: billable * model.unitPrice };
      }),
    [models, volumes]
  );

  const direct = lines.reduce((sum, l) => sum + l.cost, 0);
  const resale = direct * multiplier;

  const setVolume = (i: number, value: number) => {
    noteInteraction();
    setVolumes((prev) => prev.map((v, j) => (j === i ? value : v)));
  };
  const setModel = (i: number, id: string) => {
    noteInteraction();
    setModels((prev) => prev.map((v, j) => (j === i ? id : v)));
  };

  return (
    <section
      id="byok-calculator"
      aria-labelledby="byok-calculator-title"
      className="relative py-24 overflow-clip-safe"
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
            each provider its list price. Set a workload and see the bill.
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
                      className="min-w-0 flex-1 rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus-ring"
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

            <div className="mt-8 border-t border-slate-800 pt-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-slate-400">
                  On a platform that resells the same call at
                </span>
                <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                  {MULTIPLIERS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        noteInteraction();
                        setMultiplier(m);
                      }}
                      aria-pressed={multiplier === m}
                      className={`px-3 py-1.5 text-sm tabular-nums ${
                        multiplier === m
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {m}×
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-3xl font-semibold text-slate-300 tabular-nums">
                {usd(resale)}
                <span className="ml-2 text-base font-normal text-slate-500">
                  / month
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {usd(resale - direct)} more a month, {usd((resale - direct) * 12)} a
                year. The multiplier is yours to set — credit plans publish rates,
                not margins.
              </p>
            </div>

            <p className="mt-8 flex items-start gap-2 text-xs text-slate-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                {PRICED_MODEL_COUNT} priced models in the catalog NodeTool bills
                against. {PRICING_ATTRIBUTION}, updated{" "}
                {new Date(PRICING_UPDATED_AT).toISOString().slice(0, 10)}. Local
                models through Ollama, MLX, and llama.cpp cost nothing per call.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
