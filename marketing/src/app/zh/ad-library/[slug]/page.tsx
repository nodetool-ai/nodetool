import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdDetail from "@/components/adLibrary/AdDetail";
import { adRecipes } from "@/data/adLibrary";
import { adMetadata } from "@/lib/detailMetadata";

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
  return recipe ? adMetadata("zh", recipe) : {};
}

export default async function AdRecipePage({ params }: AdRecipePageProps) {
  const { slug } = await params;
  const recipe = adRecipes.find((item) => item.slug === slug);
  if (!recipe) {
    notFound();
  }
  return <AdDetail recipe={recipe} locale="zh" />;
}
