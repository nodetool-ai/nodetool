import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RecipeDetail from "@/components/RecipeDetail";
import { recipeEntries } from "@/data/recipes";
import { recipeMetadata } from "@/lib/detailMetadata";

interface RecipePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return recipeEntries.map((recipe) => ({ slug: recipe.slug }));
}

export async function generateMetadata({
  params
}: RecipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = recipeEntries.find((recipe) => recipe.slug === slug);
  return entry ? recipeMetadata("zh", entry) : {};
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { slug } = await params;
  const entry = recipeEntries.find((recipe) => recipe.slug === slug);
  if (!entry) notFound();
  return <RecipeDetail recipe={entry} locale="zh" />;
}
