import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoryboardDetail from "@/components/storyboards/StoryboardDetail";
import { getStoryboard, storyboards } from "@/data/storyboards";
import { storyboardMetadata } from "@/lib/detailMetadata";

interface StoryboardPageProps {
  readonly params: Promise<{ slug: string }>;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return storyboards.map((board) => ({ slug: board.slug }));
}
export async function generateMetadata({
  params
}: StoryboardPageProps): Promise<Metadata> {
  const board = getStoryboard((await params).slug);
  return board ? storyboardMetadata(null, board) : {};
}

export default async function StoryboardPage({ params }: StoryboardPageProps) {
  const board = getStoryboard((await params).slug);
  if (!board) {
    notFound();
  }
  return <StoryboardDetail board={board} />;
}
