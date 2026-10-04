/**
 * Resource references in chat prose, found on the markdown-it token stream.
 *
 * The agent embeds a document with image syntax: `![Label](sketch://<id>)` or
 * `![Label](timeline://<id>)`. Models also write the bare URI, or the URI alone
 * in a code span. This plugin rewrites those two forms into image tokens, so
 * every reference reaches the one `image` render rule in `ChatMarkdown`, which
 * draws the preview and its chip.
 *
 * It runs on tokens rather than on the source text, so a fenced block is never
 * touched (its token is not inline), and a code span that carries anything
 * besides one URI stays literal. Text inside a link is left alone too.
 *
 * Same behavior as web's `remarkResourceMentions`; URIs are parsed with the
 * shared `parseResourceUri`, never a second parser.
 */

import { RESOURCE_KINDS, parseResourceUri } from '@nodetool-ai/protocol/resource-uri';

/** The subset of a markdown-it token this plugin reads and writes. */
interface MdToken {
  type: string;
  content: string;
  children: MdToken[] | null;
  attrs: [string, string][] | null;
}

interface MdState {
  tokens: MdToken[];
  Token: new (type: string, tag: string, nesting: number) => MdToken;
}

interface MdInstance {
  core: { ruler: { push: (name: string, rule: (state: MdState) => void) => void } };
}

/**
 * One `<kind>://<id>[#<key>=<value>]` token. The id charset is deliberately
 * narrow: it keeps a documentation example (`asset://<id>.<ext>`) out of the
 * match, and stops trailing punctuation from being read as part of the id.
 */
const SEGMENT = '[A-Za-z0-9._~-]+';
const RESOURCE_URI_PATTERN = `(?:${RESOURCE_KINDS.join('|')})://${SEGMENT}(?:#${SEGMENT}=${SEGMENT})?`;
const RESOURCE_URI_RE = new RegExp(RESOURCE_URI_PATTERN, 'g');
const RESOURCE_URI_EXACT_RE = new RegExp(`^${RESOURCE_URI_PATTERN}$`);

/** Trailing dots are sentence punctuation, not part of the id. */
const trimTrailingDots = (token: string): string => token.replace(/\.+$/, '');

/** The chip label for a bare reference: the URI without its scheme. */
export const labelForUri = (uri: string): string => uri.slice(uri.indexOf('://') + 3);

const imageToken = (state: MdState, uri: string): MdToken => {
  const label = new state.Token('text', '', 0);
  label.content = labelForUri(uri);
  const image = new state.Token('image', 'img', 0);
  image.attrs = [
    ['src', uri],
    ['alt', ''],
  ];
  image.children = [label];
  image.content = label.content;
  return image;
};

/** Split one text token into text and image tokens, or null when it has no URI. */
const splitText = (state: MdState, value: string): MdToken[] | null => {
  const out: MdToken[] = [];
  let cursor = 0;
  RESOURCE_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RESOURCE_URI_RE.exec(value)) !== null) {
    const uri = trimTrailingDots(match[0]);
    if (parseResourceUri(uri) === null) {
      continue;
    }
    if (match.index > cursor) {
      const text = new state.Token('text', '', 0);
      text.content = value.slice(cursor, match.index);
      out.push(text);
    }
    out.push(imageToken(state, uri));
    cursor = match.index + uri.length;
  }
  if (out.length === 0) {
    return null;
  }
  if (cursor < value.length) {
    const text = new state.Token('text', '', 0);
    text.content = value.slice(cursor);
    out.push(text);
  }
  return out;
};

const rewriteInline = (state: MdState, children: MdToken[]): MdToken[] => {
  const out: MdToken[] = [];
  let linkDepth = 0;
  for (const child of children) {
    if (child.type === 'link_open') {
      linkDepth++;
    } else if (child.type === 'link_close') {
      linkDepth--;
    }
    if (linkDepth > 0) {
      out.push(child);
      continue;
    }
    if (child.type === 'text' && child.content) {
      const replacement = splitText(state, child.content);
      if (replacement) {
        out.push(...replacement);
        continue;
      }
    } else if (child.type === 'code_inline') {
      const uri = child.content.trim();
      if (RESOURCE_URI_EXACT_RE.test(uri) && parseResourceUri(uri) !== null) {
        out.push(imageToken(state, uri));
        continue;
      }
    }
    out.push(child);
  }
  return out;
};

/** markdown-it plugin: bare and code-span resource URIs become image tokens. */
export function resourceMentionsPlugin(md: MdInstance): void {
  md.core.ruler.push('resource_mentions', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'inline' && token.children) {
        token.children = rewriteInline(state, token.children);
      }
    }
  });
}
