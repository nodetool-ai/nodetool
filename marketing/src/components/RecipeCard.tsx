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
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100 group-hover:text-amber-200">
          {recipe.name}
        </h3>
        <p className="mt-3 flex-1 text-base leading-relaxed text-slate-300">
          {recipe.outcome}
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-amber-300">
          Follow the steps <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </a>
    );
  }

  const copy = (
    <div className="flex flex-1 flex-col p-6 md:p-8">
      <p className="text-sm font-medium text-amber-300">{recipe.name}</p>
      <h3
        className={`mt-4 text-2xl font-semibold tracking-tight text-slate-100 ${
          featured ? "md:text-3xl" : "lg:text-2xl xl:text-3xl"
        }`}
      >
        {run.proofTitle}
      </h3>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300">
        {run.summary}
      </p>
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

    return (
      <article className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div className="bg-slate-950">
          {video ? (
            <video
              controls
              playsInline
              preload="none"
              poster={video.poster}
              aria-label={`${recipe.name} finished cut`}
              className="mx-auto aspect-[9/16] max-h-[36rem] w-full object-contain"
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
              sizes="(min-width: 1024px) 600px, 100vw"
              className="h-auto w-full object-contain"
            />
          )}
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
      </figure>
      {copy}
    </article>
  );
}
