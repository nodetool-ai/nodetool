import React from "react";
import MarketingFacts from "./MarketingFacts";
import {
  DEMO_INPUTS,
  DEMO_STEPS,
  LOCAL_MODELS,
  NETWORK_OFF,
  STAYS_LOCAL,
} from "@/data/localFirstPage";

const eyebrow =
  "text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300";
const h2 = "mt-3 text-2xl font-bold tracking-tight text-white md:text-3xl";
const lead = "mt-4 text-base leading-relaxed text-slate-300";

/**
 * The /solutions/local-first proof: one shipped workflow run on a local
 * Ollama model, the hardware it needs, what stays on the machine, and what
 * changes with the network off. Copy and sources live in
 * src/data/localFirstPage.ts.
 */
export default function LocalModelDemo() {
  return (
    <>
      <section
        id="local-run"
        aria-labelledby="local-run-title"
        className="relative py-12"
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-12 lg:px-8">
          <header className="lg:col-span-5">
            <p className={eyebrow}>One local run</p>
            <h2 id="local-run-title" className={h2}>
              Ask your notes a question. The model runs on your machine.
            </h2>
            <p className={lead}>
              The Private Assistant template answers from the text you paste
              in and nothing else. It is built for a local Ollama model, so the
              answer comes from the computer you are sitting at.
            </p>
            <ol className="mt-8 space-y-5">
              {DEMO_STEPS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="font-jetbrains text-sm text-emerald-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </header>
          <div className="min-w-0 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
              <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
                <span className="font-jetbrains text-xs text-slate-400">
                  Private Assistant · inputs
                </span>
                <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-jetbrains text-[11px] text-emerald-300">
                  ollama · 127.0.0.1:11434
                </span>
              </div>
              <dl className="divide-y divide-white/5">
                {DEMO_INPUTS.map((input) => (
                  <div key={input.name} className="grid gap-1 px-4 py-4 sm:grid-cols-[6rem_1fr] sm:gap-4">
                    <dt className="font-jetbrains text-xs text-slate-400">{input.name}</dt>
                    <dd className="whitespace-pre-line text-sm leading-relaxed text-slate-200">
                      {input.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              The inputs as they ship with the template, shortened. Both
              answers are in the notes: the March 14 launch and the untested
              billing migration. Paste your own notes to replace them.
            </p>
          </div>
        </div>
      </section>

      <section
        id="local-hardware"
        aria-labelledby="local-hardware-title"
        className="relative py-12"
      >
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <p className={eyebrow}>What it needs</p>
          <h2 id="local-hardware-title" className={h2}>
            Pick the model by the memory you have.
          </h2>
          <p className={`${lead} max-w-3xl`}>
            Memory means graphics memory, or unified memory on an Apple
            Silicon Mac. Ollama also runs on the CPU, more slowly. The Model
            Manager in Studio compares these figures with your machine before
            you download.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Local chat models for the Private Assistant, with download size and memory
              </caption>
              <thead>
                <tr className="bg-slate-900/60">
                  <th scope="col" className="px-5 py-3 font-medium text-slate-400">Model on Ollama</th>
                  <th scope="col" className="px-5 py-3 font-medium text-slate-400">Download</th>
                  <th scope="col" className="px-5 py-3 font-medium text-slate-400">Memory</th>
                  <th scope="col" className="px-5 py-3 font-medium text-slate-400">Note</th>
                </tr>
              </thead>
              <tbody>
                {LOCAL_MODELS.map((m, i) => (
                  <tr key={m.name} className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}>
                    <th scope="row" className="px-5 py-3 font-medium text-white">{m.name}</th>
                    <td className="px-5 py-3 text-slate-300">{m.download}</td>
                    <td className="px-5 py-3 text-slate-300">{m.memory}</td>
                    <td className="px-5 py-3 text-slate-400">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Approximate figures from the Model Manager.{" "}
            <a
              href="https://docs.nodetool.ai/installation#gpu-requirements"
              className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200 focus-ring"
            >
              GPU requirements for image, speech, and video models
            </a>
            .
          </p>
        </div>
      </section>

      <section
        id="local-offline"
        aria-labelledby="local-offline-title"
        className="relative py-12"
      >
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className={eyebrow}>What stays on the machine</p>
            <h2 id="local-offline-title" className={h2}>
              Unplug the network and run it again.
            </h2>
            <div className="mt-8">
              <MarketingFacts items={STAYS_LOCAL} />
            </div>
          </div>
          <div>
            <p className={eyebrow}>With the network off</p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">
              Local nodes run. Hosted nodes stop where they are.
            </h3>
            <div className="mt-8">
              <MarketingFacts items={NETWORK_OFF} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
