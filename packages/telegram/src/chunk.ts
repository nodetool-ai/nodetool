/**
 * Splitting long agent output into Telegram-sized messages.
 *
 * Telegram caps a message at 4096 characters, so the bridge splits at 3800 to
 * leave headroom for the tags a chunk has to reopen. Two things make this more
 * than `slice()`:
 *
 * - A boundary must never land inside a markup token. Cutting `&amp;` in half
 *   or `<b` in half produces a message Telegram rejects outright.
 * - A boundary inside a fenced code block or an open inline tag must close the
 *   markup and reopen it on the next chunk, or every following chunk renders
 *   as broken HTML.
 *
 * The scanner therefore understands both markdown fences and the five HTML
 * tags Telegram's HTML parse mode accepts, so the same function is correct
 * whether it is handed raw agent markdown or the converted HTML.
 */

/** Default split length: 4096 minus headroom for reopened markup. */
export const DEFAULT_CHUNK_MAX = 3800;

/** Telegram's hard limit on a text message. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Tags Telegram's HTML parse mode understands. */
const SUPPORTED_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "code", "pre", "a"]);

type TokenKind = "text" | "tag-open" | "tag-close" | "entity" | "fence";

interface Token {
  readonly kind: TokenKind;
  readonly start: number;
  readonly end: number;
  /** Raw source for the token. */
  readonly raw: string;
  /** Lowercased tag name, for tag tokens. */
  readonly name?: string;
}

/** Markup that is open at a given offset. */
interface MarkupState {
  /** The opening fence line (e.g. "```ts") while inside a fenced block. */
  readonly fence: string | null;
  /** Opening tags still unclosed, outermost first. */
  readonly tags: readonly string[];
}

const EMPTY_STATE: MarkupState = { fence: null, tags: [] };

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)(\s[^<>]*)?>/;
const ENTITY = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/;

function fenceMarker(openingLine: string): string {
  const match = FENCE_LINE.exec(openingLine);
  return match ? match[1] : "```";
}

/**
 * Split the source into markup-atomic tokens. Fence delimiter lines are
 * atomic; everything between them is plain text (a `<` inside a code block is
 * content, not a tag).
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let textStart = 0;
  let i = 0;
  let fenceOpen: string | null = null;

  const flushText = (end: number): void => {
    if (end > textStart) {
      tokens.push({
        kind: "text",
        start: textStart,
        end,
        raw: text.slice(textStart, end)
      });
    }
  };

  while (i < text.length) {
    const atLineStart = i === 0 || text[i - 1] === "\n";
    if (atLineStart) {
      const lineEnd = text.indexOf("\n", i);
      const line = text.slice(i, lineEnd === -1 ? text.length : lineEnd);
      const match = FENCE_LINE.exec(line);
      const closes = fenceOpen !== null && match !== null && match[1][0] === fenceMarker(fenceOpen)[0];
      if (match !== null && (fenceOpen === null || closes)) {
        flushText(i);
        tokens.push({
          kind: "fence",
          start: i,
          end: i + line.length,
          raw: line
        });
        fenceOpen = fenceOpen === null ? line : null;
        i += line.length;
        textStart = i;
        continue;
      }
    }

    if (fenceOpen === null && text[i] === "<") {
      const match = TAG.exec(text.slice(i));
      if (match !== null && SUPPORTED_TAGS.has(match[2].toLowerCase())) {
        flushText(i);
        tokens.push({
          kind: match[1] === "/" ? "tag-close" : "tag-open",
          start: i,
          end: i + match[0].length,
          raw: match[0],
          name: match[2].toLowerCase()
        });
        i += match[0].length;
        textStart = i;
        continue;
      }
    }

    if (fenceOpen === null && text[i] === "&") {
      const match = ENTITY.exec(text.slice(i));
      if (match !== null) {
        flushText(i);
        tokens.push({
          kind: "entity",
          start: i,
          end: i + match[0].length,
          raw: match[0]
        });
        i += match[0].length;
        textStart = i;
        continue;
      }
    }

    i += 1;
  }
  flushText(text.length);
  return tokens;
}

function applyToken(state: MarkupState, token: Token): MarkupState {
  switch (token.kind) {
    case "fence":
      return { fence: state.fence === null ? token.raw : null, tags: state.tags };
    case "tag-open":
      return { fence: state.fence, tags: [...state.tags, token.raw] };
    case "tag-close": {
      const tags = [...state.tags];
      for (let i = tags.length - 1; i >= 0; i -= 1) {
        if (tagNameOf(tags[i]) === token.name) {
          tags.splice(i, 1);
          return { fence: state.fence, tags };
        }
      }
      return state;
    }
    default:
      return state;
  }
}

function tagNameOf(openingTag: string): string {
  const match = TAG.exec(openingTag);
  return match ? match[2].toLowerCase() : "";
}

/** Markup to reopen at the start of a chunk that begins mid-markup. */
function prefixFor(state: MarkupState): string {
  const tags = state.tags.join("");
  return state.fence === null ? tags : `${tags}${state.fence}\n`;
}

/** Markup to close at the end of a chunk that ends mid-markup. */
function suffixFor(state: MarkupState): string {
  const closers = [...state.tags]
    .reverse()
    .map((tag) => `</${tagNameOf(tag)}>`)
    .join("");
  return state.fence === null ? closers : `\n${fenceMarker(state.fence)}${closers}`;
}

/**
 * Nudge `index` off any markup token it would cut in half, moving left to the
 * token's start. Returns -1 when no safe index at or below `index` exists.
 */
function safeIndex(tokens: readonly Token[], index: number): number {
  for (const token of tokens) {
    if (index <= token.start) {
      return index;
    }
    if (index < token.end) {
      return token.kind === "text" ? index : token.start;
    }
  }
  return index;
}

/** State of the markup after everything strictly before `index`. */
function stateAt(tokens: readonly Token[], from: MarkupState, index: number): MarkupState {
  let state = from;
  for (const token of tokens) {
    if (token.end > index) {
      break;
    }
    state = applyToken(state, token);
  }
  return state;
}

/**
 * Best split offset inside `text[0, budget]`, preferring a paragraph break,
 * then a line break, then a word break, and finally a hard cut. Boundaries
 * that would cut a markup token in half are moved left off it.
 */
function findBoundary(text: string, tokens: readonly Token[], budget: number): number {
  const window = text.slice(0, budget);
  const floor = Math.floor(budget * 0.3);

  const candidates = [
    window.lastIndexOf("\n\n") >= 0 ? window.lastIndexOf("\n\n") + 2 : -1,
    window.lastIndexOf("\n") >= 0 ? window.lastIndexOf("\n") + 1 : -1,
    window.lastIndexOf(" ") >= 0 ? window.lastIndexOf(" ") + 1 : -1
  ];

  for (const candidate of candidates) {
    if (candidate <= floor) {
      continue;
    }
    const safe = safeIndex(tokens, candidate);
    if (safe > 0) {
      return safe;
    }
  }

  const hard = safeIndex(tokens, budget);
  return hard > 0 ? hard : budget;
}

/**
 * Split `text` into chunks no longer than `max`, reopening any fence or inline
 * tag a chunk was cut inside of. Every returned chunk is non-empty.
 */
export function chunkText(text: string, max: number = DEFAULT_CHUNK_MAX): string[] {
  if (max <= 0) {
    throw new Error("chunkText: max must be greater than zero");
  }
  if (text.length === 0) {
    return [];
  }
  if (text.length <= max) {
    const single = text.trimEnd();
    return single.length > 0 ? [single] : [];
  }

  const chunks: string[] = [];
  let remaining = text;
  let carried: MarkupState = EMPTY_STATE;

  while (remaining.length > 0) {
    const tokens = tokenize(remaining);
    const prefix = prefixFor(carried);

    if (prefix.length + remaining.length <= max) {
      const tail = (prefix + remaining).trimEnd();
      if (tail.length > 0) {
        chunks.push(tail);
      }
      break;
    }

    // The suffix depends on the boundary, and the boundary on the suffix.
    // Two passes settle it: guess with no suffix, then re-cut with the real one.
    let budget = max - prefix.length;
    let boundary = findBoundary(remaining, tokens, budget);
    let endState = stateAt(tokens, carried, boundary);
    let suffix = suffixFor(endState);
    if (prefix.length + boundary + suffix.length > max) {
      budget = Math.max(1, max - prefix.length - suffix.length);
      boundary = findBoundary(remaining, tokens, budget);
      endState = stateAt(tokens, carried, boundary);
      suffix = suffixFor(endState);
    }
    if (boundary <= 0) {
      // Nothing splittable fits — emit the whole remainder rather than loop.
      chunks.push((prefix + remaining).trimEnd());
      break;
    }

    const body = remaining.slice(0, boundary).trimEnd();
    const chunk = `${prefix}${body}${suffix}`;
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    carried = endState;
    remaining = remaining.slice(boundary).replace(/^[ \t]*\n?/, "");
    if (remaining.trim().length === 0) {
      break;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Split off the largest leading chunk that fits in `max`, returning it with
 * the untouched remainder. The renderer uses this for rollover: it needs the
 * rest as source text, not as a finished chunk.
 */
export function splitOnce(
  text: string,
  max: number = DEFAULT_CHUNK_MAX
): { head: string; rest: string } {
  if (max <= 0) {
    throw new Error("splitOnce: max must be greater than zero");
  }
  if (text.length <= max) {
    return { head: text, rest: "" };
  }
  const tokens = tokenize(text);
  const boundary = findBoundary(text, tokens, max);
  if (boundary <= 0) {
    return { head: text.slice(0, max), rest: text.slice(max) };
  }
  return {
    head: text.slice(0, boundary).trimEnd(),
    rest: text.slice(boundary).replace(/^[ \t]*\n?/, "")
  };
}
