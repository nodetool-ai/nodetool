import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CornerDownRight,
  X
} from "lucide-react";
import MarketingPageShell from "@/components/MarketingPageShell";
import AdBeatSequence from "@/components/adLibrary/AdBeatSequence";
import { ComplexityMeter } from "@/components/adLibrary/AdConceptCard";
import { adRecipes, formatKey } from "@/data/adLibrary";
import type { AdRecipe } from "@/data/adLibrary";

interface AdRecipePageProps {
  readonly params: Promise<{ slug: string }>;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return adRecipes.map((recipe) => ({ slug: recipe.slug }));
}
export async function generateMetadata({
  params
}: AdRecipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const recipe = adRecipes.find((item) => item.slug === slug);
  if (!recipe) {
    return {};
  }
  return {
    title: `${recipe.title} | NodeTool ad library`,
    description: recipe.objective,
    alternates: { canonical: `https://nodetool.ai${recipe.route}` },
    openGraph: {
      title: recipe.title,
      description: recipe.objective,
      url: `https://nodetool.ai${recipe.route}`,
      type: "article"
    }
  };
}

const FORMAT_WIDTH: Record<string, string> = {
  "9:16": "w-[27px]",
  "4:5": "w-[38px]",
  "1:1": "w-12"
};

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-semibold tracking-tight text-white">
      {children}
    </h2>
  );
}

function RecipeHeader({ recipe }: { recipe: AdRecipe }) {
  const specs = [
    { label: "Length", value: `${recipe.duration_ms / 1000}s` },
    { label: "Beats", value: String(recipe.beats.length) },
    { label: "Frame rate", value: `${recipe.fps} fps` },
    {
      label: "Complexity",
      value: <ComplexityMeter complexity={recipe.selection.complexity} />
    }
  ];
  return (
    <header>
      <p className="flex items-center gap-3 text-sm">
        <span className="font-jetbrains text-slate-500">
          Concept {recipe.id.slice(1)}
        </span>
        <span className="font-medium capitalize text-amber-300">
          {recipe.selection.goal}
        </span>
      </p>
      <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl">
        {recipe.title}
      </h1>
      <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-300">
        {recipe.objective}
      </p>
      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
        {specs.map((spec) => (
          <div key={spec.label} className="bg-slate-950 px-5 py-4">
            <dt className="text-xs text-slate-400">{spec.label}</dt>
            <dd className="mt-1.5 text-lg font-medium text-white">
              {spec.value}
            </dd>
          </div>
        ))}
      </dl>
      <figure className="mt-10 border-l-2 border-amber-300 pl-6">
        <figcaption className="text-xs font-medium text-amber-300">
          Motion principle
        </figcaption>
        <blockquote className="mt-2 max-w-2xl text-lg leading-relaxed text-slate-100">
          {recipe.selection.motion_principle}
        </blockquote>
      </figure>
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Use it when
          </p>
          <p className="mt-3 leading-relaxed text-slate-300">
            {recipe.selection.use_when}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <X className="h-4 w-4 text-rose-400" aria-hidden="true" />
            Pick another concept when
          </p>
          <p className="mt-3 leading-relaxed text-slate-300">
            {recipe.selection.avoid_when}
          </p>
        </div>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        <div>
          <SectionHeading>What you need</SectionHeading>
          <ul className="mt-5 space-y-3">
            {recipe.assets_required.map((asset) => (
              <li key={asset} className="flex gap-3 text-slate-300">
                <CornerDownRight
                  className="mt-1 h-4 w-4 shrink-0 text-slate-500"
                  aria-hidden="true"
                />
                {asset}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionHeading>Keep this consistent</SectionHeading>
          <p className="mt-5 leading-relaxed text-slate-300">
            {recipe.visual_invariant}
          </p>
        </div>
      </div>
    </header>
  );
}

function CopyBudget({ recipe }: { recipe: AdRecipe }) {
  return (
    <div>
      <SectionHeading>Copy budget</SectionHeading>
      <p className="mt-2 text-sm text-slate-400">
        Word counts are a starting point. Keep required qualifications.
      </p>
      <ul className="mt-6 space-y-5">
        {recipe.copy_slots.map((slot) => (
          <li key={slot.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-100">{formatKey(slot.id)}</span>
              <span className="shrink-0 font-jetbrains text-xs text-slate-400">
                {slot.suggested_max_words} words
                {!slot.required && " · optional"}
              </span>
            </div>
            <div
              className="mt-2 flex flex-wrap gap-1"
              aria-hidden="true"
            >
              {Array.from({ length: slot.suggested_max_words }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-4 rounded-full ${
                    slot.required ? "bg-amber-300/80" : "bg-white/25"
                  }`}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LayerStack({ recipe }: { recipe: AdRecipe }) {
  const layers = [...recipe.layer_stack_bottom_to_top].reverse();
  return (
    <div>
      <SectionHeading>Layer stack</SectionHeading>
      <p className="mt-2 text-sm text-slate-400">Top of the frame first.</p>
      <ol className="mt-6 space-y-1.5">
        {layers.map((layer, index) => (
          <li
            key={layer}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-200"
            style={{ marginLeft: `${(layers.length - 1 - index) * 0.5}rem` }}
          >
            <span className="font-jetbrains text-xs text-slate-500">
              {layers.length - index}
            </span>
            {layer}
          </li>
        ))}
      </ol>
    </div>
  );
}

function FormatAdaptations({ recipe }: { recipe: AdRecipe }) {
  return (
    <div>
      <SectionHeading>Adapt the format</SectionHeading>
      <dl className="mt-6 space-y-6">
        {Object.entries(recipe.format_adaptations).map(
          ([format, description]) => (
            <div key={format} className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className={`block h-12 rounded border border-amber-300/70 ${
                    FORMAT_WIDTH[format] ?? "w-12"
                  }`}
                />
              </div>
              <div>
                <dt className="font-jetbrains text-sm text-white">{format}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-300">
                  {description}
                </dd>
              </div>
            </div>
          )
        )}
      </dl>
    </div>
  );
}

function ConceptLink({
  recipe,
  label
}: {
  recipe: AdRecipe;
  label: string;
}) {
  return (
    <a
      href={recipe.route}
      className="focus-ring group flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 pr-6 transition-colors hover:border-amber-300/40"
    >
      <Image
        src={recipe.video.poster}
        alt=""
        width={recipe.video.width}
        height={recipe.video.height}
        sizes="64px"
        className="aspect-[9/16] w-16 shrink-0 rounded-lg object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-slate-400">{label}</span>
        <span className="mt-1 block font-medium text-white group-hover:text-amber-200">
          {recipe.title}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-200 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </a>
  );
}

export default async function AdRecipePage({ params }: AdRecipePageProps) {
  const { slug } = await params;
  const index = adRecipes.findIndex((item) => item.slug === slug);
  if (index === -1) {
    notFound();
  }
  const recipe = adRecipes[index];
  const alternatives = adRecipes.filter((item) =>
    recipe.selection.alternative_recipe_ids.includes(item.id)
  );
  const next = [...adRecipes.slice(index + 1), ...adRecipes.slice(0, index)].find(
    (item) => !alternatives.includes(item)
  );
  return (
    <MarketingPageShell>
      <article className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-8">
        <a
          href="/ad-library"
          className="focus-ring mb-10 inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-amber-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Social ad library
        </a>
        <AdBeatSequence title={recipe.title} beats={recipe.beats} video={recipe.video}>
          <RecipeHeader recipe={recipe} />
        </AdBeatSequence>
        <section
          aria-label="Production plan"
          className="mt-24 grid gap-14 border-t border-white/10 pt-16 lg:grid-cols-3 lg:gap-12"
        >
          <CopyBudget recipe={recipe} />
          <LayerStack recipe={recipe} />
          <FormatAdaptations recipe={recipe} />
        </section>
        <section
          aria-label="Review"
          className="mt-20 grid gap-14 border-t border-white/10 pt-16 lg:grid-cols-3 lg:gap-12"
        >
          <div>
            <SectionHeading>Review the finished ad</SectionHeading>
            <ul className="mt-6 space-y-4">
              {recipe.acceptance_criteria.map((criterion) => (
                <li key={criterion} className="flex gap-3 text-slate-300">
                  <Check
                    className="mt-1 h-4 w-4 shrink-0 text-emerald-400"
                    aria-hidden="true"
                  />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading>Watch out</SectionHeading>
            <ul className="mt-6 space-y-4">
              {recipe.watch_out.map((note) => (
                <li key={note} className="flex gap-3 text-slate-300">
                  <AlertTriangle
                    className="mt-1 h-4 w-4 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  {note}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">
              <span className="font-medium text-white">Fallback. </span>
              {recipe.fallback}
            </p>
          </div>
          <div>
            <SectionHeading>Variations</SectionHeading>
            <ul className="mt-6 space-y-4">
              {recipe.variants.map((variant) => (
                <li key={variant} className="flex gap-3 text-slate-300">
                  <CornerDownRight
                    className="mt-1 h-4 w-4 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
                  {variant}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <nav
          aria-label="More ad concepts"
          className="mt-20 grid gap-4 border-t border-white/10 pt-16 md:grid-cols-2"
        >
          {alternatives.map((item) => (
            <ConceptLink
              key={item.id}
              recipe={item}
              label="Another approach to the brief"
            />
          ))}
          {next && <ConceptLink recipe={next} label="Next concept" />}
        </nav>
      </article>
    </MarketingPageShell>
  );
}
