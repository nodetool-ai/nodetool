import { ChevronDown } from "lucide-react";
import ModelDirectoryFilter from "./ModelDirectoryFilter";
import {
  MODEL_KIND_LABEL,
  canonicalModels,
  modelDirectory,
  modelDirectoryCounts,
  modelProviderName,
} from "@/data/modelDirectory";
import type { CanonicalModel } from "@/data/modelDirectory.generated";

const LIST_ID = "all-models-list";

const CANONICAL_KINDS: CanonicalModel["kind"][] = ["video", "image", "audio"];

/**
 * Every model id NodeTool ships a definition for. Models Artificial Analysis
 * ranks come first, one card per canonical model id with the provider routes
 * that serve it. The remaining ids follow, grouped by kind and provider.
 */
export default function ModelDirectorySection() {
  const counts = modelDirectoryCounts();
  return (
    <section
      id="all-models"
      aria-label="All supported models"
      className="mx-auto mt-20 max-w-5xl scroll-mt-28 px-6"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        All supported models
      </h2>
      <p className="mt-3 max-w-2xl text-slate-400">
        {counts.models.toLocaleString()} model ids across {counts.providers}{" "}
        providers, from the model catalogs that ship with NodeTool.{" "}
        {counts.canonical} models are listed under their{" "}
        <a
          href="https://artificialanalysis.ai"
          className="text-slate-300 underline decoration-slate-600 underline-offset-2 hover:text-white focus-ring"
        >
          Artificial Analysis
        </a>{" "}
        model id, with every provider that serves them. Providers that publish
        their models over their API, such as Anthropic and Groq, are named
        under each group.
      </p>
      <ModelDirectoryFilter targetId={LIST_ID} />

      <div id={LIST_ID} className="mt-4 space-y-12">
        {CANONICAL_KINDS.map((kind) => {
          const models = canonicalModels.filter((m) => m.kind === kind);
          return (
            <div key={kind} data-model-kind={`ranked-${kind}`}>
              <div className="flex items-baseline gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {MODEL_KIND_LABEL[kind]} models
                </h3>
                <span className="text-sm text-slate-500">{models.length}</span>
              </div>
              {/* Card styles live on the grid to keep the page small. */}
              <ul
                data-model-group=""
                className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>li]:min-w-0 [&>li]:rounded-xl [&>li]:border [&>li]:border-slate-800/70 [&>li]:bg-slate-900/40 [&>li]:p-4 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-slate-500"
              >
                {models.map((m) => (
                  <li key={m.canonical} data-model="">
                    <div className="text-sm font-semibold text-white">{m.name}</div>
                    <code className="mt-0.5 block truncate">{m.canonical}</code>
                    {m.creator && (
                      <div className="mt-1 text-xs text-slate-400">{m.creator}</div>
                    )}
                    <div className="mt-2 text-xs text-slate-300">
                      {[...new Set(m.routes.map((r) => r.provider))]
                        .map(modelProviderName)
                        .join(", ")}
                    </div>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-300 focus-ring">
                        {m.routes.length} provider model id
                        {m.routes.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-1 space-y-0.5">
                        {m.routes.map((r) => (
                          <li key={`${r.provider}:${r.id}`}>
                            <code className="block truncate">{r.id}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <h3 className="border-t border-slate-800/70 pt-10 text-xl font-semibold text-white">
          Other model ids
        </h3>

        {modelDirectory.map((group) => (
          <div key={group.kind} data-model-kind={group.kind}>
            <div className="flex items-baseline gap-3">
              <h4 className="text-lg font-semibold text-white">
                {MODEL_KIND_LABEL[group.kind]} models
              </h4>
              <span className="text-sm text-slate-500">
                {group.total.toLocaleString()}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {group.providers.map((p) => (
                <details
                  key={p.provider}
                  data-model-group={p.provider}
                  className="group rounded-xl border border-slate-800/70 bg-slate-900/40"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm text-slate-200 hover:bg-slate-800/40 focus-ring [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">{modelProviderName(p.provider)}</span>
                    <span className="inline-flex items-center gap-2 text-slate-500">
                      {p.models.length.toLocaleString()} model
                      {p.models.length === 1 ? "" : "s"}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  {/* Row styles live on the list: about 2,600 rows render here. */}
                  <ul className="grid gap-x-6 gap-y-1.5 border-t border-slate-800/70 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3 [&_code]:block [&_code]:truncate [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-slate-500 [&_li]:min-w-0 [&_span]:block [&_span]:truncate [&_span]:text-sm [&_span]:text-slate-200">
                    {p.models.map((m) => (
                      <li key={m.id} data-model="">
                        {m.name && <span>{m.name}</span>}
                        <code>{m.id}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            {group.liveProviders.length > 0 && (
              <p className="mt-3 text-sm text-slate-500">
                Listed live from the provider:{" "}
                {group.liveProviders.map(modelProviderName).join(", ")}.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
