import { ChevronDown } from "lucide-react";
import ModelDirectoryFilter from "./ModelDirectoryFilter";
import {
  MODEL_KIND_LABEL,
  modelDirectory,
  modelDirectoryCounts,
  modelProviderName,
} from "@/data/modelDirectory";

const LIST_ID = "all-models-list";

/**
 * Every model id NodeTool ships a definition for, grouped by kind and then by
 * provider. Generated from the provider manifests and runtime provider code.
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
        providers. The list comes from the model catalogs that ship with
        NodeTool. Providers that publish their models over their API, such as
        Anthropic and Groq, are named under each group, and NodeTool shows
        their current models when you add your key.
      </p>
      <ModelDirectoryFilter targetId={LIST_ID} />

      <div id={LIST_ID} className="mt-4 space-y-12">
        {modelDirectory.map((group) => (
          <div key={group.kind} data-model-kind={group.kind}>
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-semibold text-white">
                {MODEL_KIND_LABEL[group.kind]} models
              </h3>
              <span className="text-sm text-slate-500">
                {group.total.toLocaleString()}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {group.providers.map((p) => (
                <details
                  key={p.provider}
                  data-model-provider={p.provider}
                  className="group rounded-xl border border-slate-800/70 bg-slate-900/40"
                >
                  <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between gap-4 rounded-xl px-4 py-3 text-sm text-slate-200 hover:bg-slate-800/40 focus-ring">
                    <span className="font-medium">{modelProviderName(p.provider)}</span>
                    <span className="inline-flex items-center gap-2 text-slate-500">
                      {p.models.length.toLocaleString()} model
                      {p.models.length === 1 ? "" : "s"}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  {/* Row styles live on the list: about 3,000 rows render here. */}
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
