import { renderMarkdown } from "@/lib/markdown";

export function MarkdownBody({ source }: { source: string }) {
  const html = renderMarkdown(source);
  if (!html.trim()) {
    return <p className="text-sm text-muted-foreground italic">No description yet.</p>;
  }
  return <div className="prose-tasks" dangerouslySetInnerHTML={{ __html: html }} />;
}
