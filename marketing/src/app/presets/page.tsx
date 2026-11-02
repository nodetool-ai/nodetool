import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";
import MarketingPageShell from "@/components/MarketingPageShell";
import JsonLd from "@/components/JsonLd";
import { PresetCard } from "@/components/presets/PresetCard";
import {
  PRESET_DOCS_URL,
  PRESET_KINDS,
  modelCounts,
  presetAnchor,
  presetDisplayName,
  presetEntryPages,
  presetShowcase,
  presetsOfKind,
  sourcePresetOf
} from "@/data/presets";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

const entry = presetEntryPages[0];
export const metadata: Metadata = {
  title: entry.title,
  description: entry.description,
  alternates: { canonical: "https://nodetool.ai/presets" },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: entry.title,
    description: entry.description,
    url: "https://nodetool.ai/presets"
  }
};

const restyles = presetShowcase.filter(
  (preset) => preset.mode === "reference_to_video"
);
const imageEdits = presetShowcase.filter(
  (preset) => preset.mode === "image_edit"
);
const restyleSource = restyles[0] ? sourcePresetOf(restyles[0]) : undefined;
const models = modelCounts();

const linkClass =
  "focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200";

export default function PresetsPage() {
  return (
    <MarketingPageShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "NodeTool presets with preview renders",
          itemListElement: presetShowcase.map((preset, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${presetDisplayName(preset)} (${preset.kind})`,
            url: `https://nodetool.ai/presets#${presetAnchor(preset)}`
          }))
        }}
      />
      <section aria-labelledby="presets-title" className="relative">
        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-16">
          <p className="text-sm font-medium text-amber-300">Presets</p>
          <h1
            id="presets-title"
            className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl xl:text-7xl"
          >
            Every preset,
            <br />
            <span className="text-slate-400">with the render behind it.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-300">
            A preset is a named camera move, film look or effect. NodeTool
            turns it into the wording the chosen video model responds to,
            stacks up to three on one shot, and opens the result as an editable
            workflow. Hover, tap or tab to a card to play its preview.
          </p>
          <a
            href="#camera"
            className="focus-ring mt-10 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition-colors hover:bg-amber-300"
          >
            Browse the previews
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
          <dl className="mt-14 grid max-w-xl grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {PRESET_KINDS.map((kind) => (
              <div key={kind.id}>
                <dt className="text-xs text-slate-400">{kind.label}</dt>
                <dd className="mt-1 text-lg font-semibold text-white sm:text-2xl">
                  {presetsOfKind(kind.id).length}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="how-title"
        className="relative border-t border-white/10 py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:px-8">
          <div>
            <h2
              id="how-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              How these previews were made
            </h2>
            <p className="mt-4 max-w-sm leading-relaxed text-slate-300">
              They are test renders for comparing presets. They are not final
              output.
            </p>
          </div>
          <div className="space-y-6 leading-relaxed text-slate-300">
            <p>
              Each preview is one render on Dreamina, made through a signed-in
              browser tab. Every video preview uses the same seed. The previews
              share one source image, so the difference between two cards comes
              from the preset.
            </p>
            <ul className="space-y-2">
              {models.map((item) => (
                <li key={`${item.model}-${item.resolution}`}>
                  <span className="font-medium text-white">{item.count}</span>{" "}
                  on {item.model}
                  {item.resolution ? `, ${item.resolution}` : ""}
                </li>
              ))}
            </ul>
            {imageEdits.length > 0 && (
              <p>
                {imageEdits.length === 1
                  ? "The image edit"
                  : `The ${imageEdits.length} image edits`}{" "}
                {imageEdits.length === 1 ? "is a still" : "are stills"} edited
                on GPT Image 2.5 Sunburst. The loop crossfades from the source
                still to the edit.
              </p>
            )}
            {restyles.length > 0 && restyleSource && (
              <p>
                Dreamina has no video-to-video mode, so the {restyles.length}{" "}
                video restyles render as reference-to-video, with the{" "}
                <a href={`#${presetAnchor(restyleSource)}`} className={linkClass}>
                  {presetDisplayName(restyleSource)} preview
                </a>{" "}
                as the source video. The workflow NodeTool ejects for a restyle
                uses a video-to-video node, so it is not the graph that
                rendered the preview.
              </p>
            )}
            <p>
              The previews use the wording written for Seedance. The other
              model families compile their own wording and have no preview
              here. Read how presets compile, stack and eject in the{" "}
              <a href={PRESET_DOCS_URL} className={linkClass}>
                presets guide
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <div id="previews">
        {PRESET_KINDS.map((kind) => (
          <section
            key={kind.id}
            id={kind.id}
            aria-labelledby={`kind-${kind.id}`}
            className="relative scroll-mt-28 border-t border-white/10 py-20"
          >
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
              <div className="mb-12 flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <h2
                  id={`kind-${kind.id}`}
                  className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
                >
                  {kind.label}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-slate-400">
                  {kind.blurb}
                </p>
              </div>
              <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {presetsOfKind(kind.id).map((preset) => (
                  <li key={preset.id}>
                    <PresetCard entry={preset} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </MarketingPageShell>
  );
}
