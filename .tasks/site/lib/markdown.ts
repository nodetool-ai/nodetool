import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  if (!source) return "";
  const raw = marked.parse(source, { async: false }) as string;
  // Body and notes are user-supplied; the dashboard renders them via
  // dangerouslySetInnerHTML, so sanitize. Keep checkbox inputs since
  // we use them for acceptance-criteria-style lists in plan bodies.
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "class",
      "id",
      "type",
      "checked",
      "disabled",
    ],
  });
}
