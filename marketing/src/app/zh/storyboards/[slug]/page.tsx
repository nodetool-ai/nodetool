import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoryboardDetail from "@/components/storyboards/StoryboardDetail";
import { getStoryboard, storyboards } from "@/data/storyboards";
import { storyboardMetadata } from "@/lib/detailMetadata";

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return storyboards.map((board) => ({ slug: board.slug }));
}
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const board = getStoryboard((await params).slug);
  return board ? storyboardMetadata("zh", board) : {};
}

export default async function Page({ params }: PageProps) {
  const board = getStoryboard((await params).slug);
  if (!board) {
    notFound();
  }
  return <StoryboardDetail board={board} locale="zh" />;
}
