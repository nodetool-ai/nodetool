import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { RecipeEntry } from "@/data/recipes";

interface RecipeCardProps {
  readonly recipe: RecipeEntry;
  readonly featured?: boolean;
}

export default function RecipeCard({
  recipe,
  featured = false
}: RecipeCardProps) {
  const run = recipe.productionRun;
  if (!run) {
    return (
      <a
        href={recipe.route}
        className="focus-ring group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 p-6 transition-colors hover:border-amber-400/40 motion-reduce:transition-none"
      >
        <p className="text-sm text-amber-300">
          {recipe.guide.entry} guided flow
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100 group-hover:text-amber-200">
          {recipe.name}
        </h3>
        <p className="mt-3 flex-1 text-base leading-relaxed text-slate-300">
          {recipe.outcome}
        </p>
        <p className="mt-6 text-sm text-slate-400">
          {recipe.guide.stages.join(" → ")}
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-amber-300">
          Follow the steps <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </a>
    );
  }

  const copy = (
    <div className="flex flex-1 flex-col p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-amber-300">{recipe.name}</p>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-100">
          {run.reviewLabel}
        </span>
      </div>
      <h3
        className={`mt-4 text-2xl font-semibold tracking-tight text-slate-100 ${
          featured ? "md:text-3xl" : "lg:text-2xl xl:text-3xl"
        }`}
      >
        {run.proofTitle}
      </h3>
      <p className="mt-4 text-base font-medium text-slate-100">
        {run.statusLabel}
      </p>
      <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-300">
        {run.summary}
      </p>
      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Still to review
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {run.essentialLimitation}
        </p>
      </div>
      <a
        href={recipe.route}
        aria-label={`Explore the ${recipe.name} project`}
        className="focus-ring mt-7 inline-flex w-fit items-center gap-2 rounded text-sm font-medium text-amber-300 transition-colors hover:text-amber-200 motion-reduce:transition-none"
      >
        Explore project <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );

  if (featured) {
    const video = run.video;
    const comparison = run.proof ?? run.card;

    return (
      <article className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/30 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.75fr)]">
        <div className="grid min-h-[28rem] grid-cols-1 gap-px bg-white/10 sm:grid-cols-[minmax(8rem,0.72fr)_minmax(0,1.28fr)] lg:min-h-[34rem]">
          <figure className="flex min-w-0 flex-col bg-slate-950">
            {video ? (
              <video
                controls
                playsInline
                preload="none"
                poster={video.poster}
                aria-label={`${recipe.name} finished cut`}
                className="min-h-0 flex-1 bg-slate-950 object-contain"
              >
                {video.webm && <source src={video.webm} type="video/webm" />}
                <source src={video.mp4} type="video/mp4" />
              </video>
            ) : (
              <Image
                src={run.card.src}
                alt={run.card.alt}
                width={run.card.width ?? 1280}
                height={run.card.height ?? 720}
                sizes="(min-width: 1024px) 360px, 38vw"
                className="min-h-0 flex-1 object-contain"
              />
            )}
            <figcaption className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400">
              Finished cut. Playback starts on request.
            </figcaption>
          </figure>
          <figure className="flex min-w-0 flex-col bg-slate-950">
            <Image
              src={comparison.src}
              alt={comparison.alt}
              width={comparison.width ?? 1280}
              height={comparison.height ?? 720}
              sizes="(min-width: 1024px) 520px, 62vw"
              className="min-h-0 flex-1 object-contain"
            />
            <figcaption className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400">
              {comparison.caption ?? "Reviewed production evidence."}
            </figcaption>
          </figure>
        </div>
        {copy}
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/45 transition-colors hover:border-amber-400/35 motion-reduce:transition-none">
      <figure className="flex flex-col bg-slate-950">
        <Image
          src={run.card.src}
          alt={run.card.alt}
          width={run.card.width ?? 1600}
          height={run.card.height ?? 900}
          sizes="(min-width: 1024px) 390px, 100vw"
          className="aspect-[16/10] w-full bg-slate-950 object-contain"
        />
        {run.card.caption && (
          <figcaption className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400">
            {run.card.caption}
          </figcaption>
        )}
      </figure>
      {copy}
    </article>
  );
}
