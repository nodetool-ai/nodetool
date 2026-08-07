import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { blogPosts, getPost } from "@/data/blogEntries";

export const alt = "NodeTool blog post";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  return ogImage(
    post?.headline ?? "NodeTool blog",
    post?.excerpt ?? "Tutorials, comparisons, and deep dives.",
    {
      image: post?.ogImage ?? "screen_canvas.png",
      accent: post?.accent ?? "blue",
      eyebrow: post?.tag ?? "Blog",
    },
  );
}
