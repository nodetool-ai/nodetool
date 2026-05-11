import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  if (!source) return "";
  return marked.parse(source, { async: false }) as string;
}
