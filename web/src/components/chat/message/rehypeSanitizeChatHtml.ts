/**
 * Allowlist filter for the HTML tree chat Markdown renders.
 *
 * Chat content comes from users and models, and a model reply can repeat
 * text from a fetched page. `rehype-raw` turns any HTML in it into live DOM,
 * so this plugin runs right after it and keeps only formatting elements and
 * plain attributes. It removes `<script>`, `<style>`, `<iframe srcdoc>`,
 * forms, event handlers and inline styles. URL attributes are checked
 * afterwards by react-markdown's `urlTransform`.
 */

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Elements kept as they are. */
const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code", "dd",
  "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "ins", "kbd",
  "li", "mark", "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp",
  "section", "small", "span", "strike", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u",
  "ul", "var", "wbr"
]);

/** Elements removed together with everything inside them. */
const DROPPED_TAGS = new Set([
  "base", "button", "embed", "form", "frame", "frameset", "iframe", "link",
  "math", "meta", "noscript", "object", "script", "select", "style", "svg",
  "template", "textarea", "title"
]);

/** hast property names (camelCase) kept on allowed elements. */
const ALLOWED_PROPERTIES = new Set([
  "alt", "align", "ariaDescribedBy", "ariaHidden", "ariaLabel", "checked",
  "cite", "className", "colSpan", "dataFootnoteBackref", "dataFootnoteRef",
  "dataFootnotes", "dateTime", "dir", "disabled", "height", "href", "id",
  "lang", "open", "rowSpan", "src", "start", "title", "type", "width"
]);

const sanitizeProperties = (
  tagName: string,
  properties: Record<string, unknown> | undefined
): Record<string, unknown> => {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties ?? {})) {
    if (!ALLOWED_PROPERTIES.has(name)) {
      continue;
    }
    // GFM footnotes prefix their ids; any other id could shadow a global.
    if (
      name === "id" &&
      !(typeof value === "string" && value.startsWith("user-content-"))
    ) {
      continue;
    }
    kept[name] = value;
  }
  if (tagName === "input") {
    // Only a GFM task-list checkbox, and never an editable one.
    kept.disabled = true;
  }
  return kept;
};

const sanitizeChildren = (children: HastNode[]): HastNode[] => {
  const result: HastNode[] = [];
  for (const child of children) {
    if (
      child.type === "comment" ||
      child.type === "doctype" ||
      child.type === "raw"
    ) {
      continue;
    }
    if (child.type !== "element" || !child.tagName) {
      if (child.children) {
        child.children = sanitizeChildren(child.children);
      }
      result.push(child);
      continue;
    }
    const tagName = child.tagName.toLowerCase();
    if (DROPPED_TAGS.has(tagName)) {
      continue;
    }
    if (
      tagName === "input" &&
      child.properties?.type !== "checkbox"
    ) {
      continue;
    }
    const children = sanitizeChildren(child.children ?? []);
    if (!ALLOWED_TAGS.has(tagName)) {
      // An unknown element keeps its content as if the tag were not there.
      result.push(...children);
      continue;
    }
    result.push({
      ...child,
      properties: sanitizeProperties(tagName, child.properties),
      children
    });
  }
  return result;
};

/** Sanitize a hast tree in place. Exported for tests. */
export const sanitizeChatHtmlTree = (tree: HastNode): void => {
  tree.children = sanitizeChildren(tree.children ?? []);
};

/** The rehype plugin: put it right after `rehype-raw`. */
const rehypeSanitizeChatHtml = () => sanitizeChatHtmlTree;

export default rehypeSanitizeChatHtml;
