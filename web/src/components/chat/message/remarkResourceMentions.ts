/**
 * remarkResourceMentions — turn a bare resource URI (`asset://…`,
 * `storyboard://…`, `timeline://…`) in chat prose into an mdast link, so
 * ChatMarkdown's `a` override renders it as a resource chip or an inline
 * player.
 *
 * The system prompt asks the agent to write `[Beach intro](storyboard://sb_1)`.
 * Models routinely write the raw URI instead — often inside backticks — and the
 * reader was left with the URN as text: no chip, no audio player, nothing to
 * click. A code span whose entire value is one resource URI is a reference too,
 * so it is rewritten as well; a fenced block, and a code span carrying anything
 * else, stay literal.
 *
 * Like remarkEntityMentions it runs on the tree, so a URI a link already points
 * at is not re-wrapped, which mdast forbids.
 */
import { RESOURCE_KINDS, isResourceUri } from "@nodetool-ai/protocol";

/** The subset of mdast this plugin reads. */
interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
}

/**
 * One `<kind>://<id>[#<key>=<value>]` token. The id charset is deliberately
 * narrow: it keeps a documentation example (`asset://<id>.<ext>`) out of the
 * match, and stops trailing punctuation from being read as part of the id.
 */
const SEGMENT = "[A-Za-z0-9._~-]+";
const RESOURCE_URI_PATTERN = `(?:${RESOURCE_KINDS.join(
  "|"
)})://${SEGMENT}(?:#${SEGMENT}=${SEGMENT})?`;
const RESOURCE_URI_RE = new RegExp(RESOURCE_URI_PATTERN, "g");
const RESOURCE_URI_EXACT_RE = new RegExp(`^${RESOURCE_URI_PATTERN}$`);

/** Node types whose text is literal and must not be rewritten. */
const OPAQUE_TYPES = new Set(["code", "link", "linkReference"]);

/** Trailing dots are sentence punctuation, not part of the id. */
const trimTrailingDots = (token: string): string => {
  let end = token.length;
  while (end > 0 && token[end - 1] === ".") {
    end--;
  }
  return token.slice(0, end);
};

/** The chip/player label: the URI without its scheme. */
const labelFor = (uri: string): string =>
  uri.slice(uri.indexOf("://") + "://".length);

const linkNode = (uri: string): MdastNode => ({
  type: "link",
  url: uri,
  children: [{ type: "text", value: labelFor(uri) }]
});

/**
 * Split one text value into text and link nodes, or `null` when it carries no
 * resource URI (so the caller can leave the node untouched).
 */
export const splitResourceMentions = (value: string): MdastNode[] | null => {
  const out: MdastNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  RESOURCE_URI_RE.lastIndex = 0;
  while ((match = RESOURCE_URI_RE.exec(value)) !== null) {
    const uri = trimTrailingDots(match[0]);
    if (!isResourceUri(uri)) {
      continue;
    }
    if (match.index > cursor) {
      out.push({ type: "text", value: value.slice(cursor, match.index) });
    }
    out.push(linkNode(uri));
    cursor = match.index + uri.length;
  }
  if (out.length === 0) {
    return null;
  }
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
};

/** A code span that is nothing but one resource URI, as a link node. */
export const codeSpanMention = (value: string): MdastNode | null => {
  const uri = value.trim();
  return uri && RESOURCE_URI_EXACT_RE.test(uri) && isResourceUri(uri)
    ? linkNode(uri)
    : null;
};

const walk = (node: MdastNode): void => {
  const children = node.children;
  if (!children || OPAQUE_TYPES.has(node.type)) {
    return;
  }
  let index = 0;
  while (index < children.length) {
    const child = children[index];
    if (child.type === "text" && child.value) {
      const replacement = splitResourceMentions(child.value);
      if (replacement) {
        children.splice(index, 1, ...replacement);
        index += replacement.length;
        continue;
      }
    } else if (child.type === "inlineCode" && child.value) {
      const link = codeSpanMention(child.value);
      if (link) {
        children.splice(index, 1, link);
      }
    } else {
      walk(child);
    }
    index++;
  }
};

export const remarkResourceMentions = () => (tree: MdastNode): void => {
  walk(tree);
};
