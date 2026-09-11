import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { RecipeEntry } from "@/data/recipes";

interface RecipeCardProps {
  recipe: RecipeEntry;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const image = recipe.productionRun?.hero;
  return (
    <a
      href={recipe.route}
      className="focus-ring group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-amber-400/40 motion-reduce:transition-none"
    >
      {image && (
        <Image
          src={image.src}
          alt={image.alt}
          width={1280}
          height={720}
          sizes="(min-width: 1024px) 560px, 100vw"
          className="aspect-video w-full bg-slate-950 object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-6">
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
      </div>
    </a>
  );
}
