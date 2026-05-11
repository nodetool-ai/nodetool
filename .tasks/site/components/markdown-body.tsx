export function MarkdownBody({ html }: { html: string }) {
  return <div className="prose-tasks" dangerouslySetInnerHTML={{ __html: html }} />;
}
