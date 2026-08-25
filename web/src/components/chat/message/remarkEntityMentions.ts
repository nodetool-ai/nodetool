/**
 * remarkEntityMentions — turn bare `entity://<id>` tokens in chat prose into
 * mdast link nodes, so ChatMarkdown's `a` override can render them as entity
 * chips.
 *
 * The composer writes an `@`-mention as the raw token (the same encoding the
 * Prompt composer stores and the runtime expands), and the token stays in the
 * persisted message. Without this the reader sees the URN.
 *
 * It runs on the tree, not the source string, so a token quoted inside a code
 * span or fence is left alone — and an `entity://` URL a link already points
 * at is not re-wrapped, which mdast forbids.
 */

/** The subset of mdast this plugin reads. Narrow on purpose: the tree it walks
 *  carries positions and node types remark defines, none of which matter here. */
interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
}

/** Matches one `entity://<id>` token; mirrors the prompt tokenizer's arm. */
const ENTITY_URI_RE = /entity:\/\/[A-Za-z0-9._~-]+/g;

/** Node types whose text is literal and must not be rewritten. */
const OPAQUE_TYPES = new Set(["code", "inlineCode", "link", "linkReference"]);

/** Trailing dots are sentence punctuation, not part of the id. */
const trimTrailingDots = (token: string): string => {
  let end = token.length;
  while (end > 0 && token[end - 1] === ".") {
    end--;
  }
  return token.slice(0, end);
};

/**
 * Split one text value into text and link nodes, or `null` when it carries no
 * entity token (so the caller can leave the node untouched).
 */
export const splitEntityMentions = (value: string): MdastNode[] | null => {
  const out: MdastNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  ENTITY_URI_RE.lastIndex = 0;
  while ((match = ENTITY_URI_RE.exec(value)) !== null) {
    const uri = trimTrailingDots(match[0]);
    const id = uri.slice("entity://".length);
    if (!id) {
      continue;
    }
    if (match.index > cursor) {
      out.push({ type: "text", value: value.slice(cursor, match.index) });
    }
    out.push({
      type: "link",
      url: uri,
      children: [{ type: "text", value: id }]
    });
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

const walk = (node: MdastNode): void => {
  const children = node.children;
  if (!children || OPAQUE_TYPES.has(node.type)) {
    return;
  }
  let index = 0;
  while (index < children.length) {
    const child = children[index];
    if (child.type === "text" && child.value) {
      const replacement = splitEntityMentions(child.value);
      if (replacement) {
        children.splice(index, 1, ...replacement);
        index += replacement.length;
        continue;
      }
    } else {
      walk(child);
    }
    index++;
  }
};

export const remarkEntityMentions = () => (tree: MdastNode): void => {
  walk(tree);
};
