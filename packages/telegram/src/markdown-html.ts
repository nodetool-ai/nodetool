/**
 * Agent markdown → Telegram HTML parse mode.
 *
 * MarkdownV2 makes every `.`, `-` and `(` in prose an escaping obligation, so
 * one missed character fails the whole message. Telegram's HTML mode needs
 * three characters escaped and supports the five tags this converter emits:
 * `<b>`, `<i>`, `<code>`, `<pre>` and `<a href>`. Anything the converter
 * cannot express — an unbalanced fence, markup it does not recognize as
 * balanced — falls back to plain text, because a turn must never fail on
 * formatting.
 *
 * Hand-rolled on purpose: the supported subset is small enough that a parser
 * dependency would cost more than it covers.
 */

/** Converted HTML, or the plain-text fallback when conversion is not safe. */
export type TelegramHtmlResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly text: string };

/** URL schemes allowed on a link. Anything else renders as its label. */
const SAFE_SCHEMES = new Set(["http:", "https:", "tg:", "mailto:"]);

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`~]*)\s*$/;

/** Escape the three characters Telegram's HTML mode reserves. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

interface Block {
  readonly kind: "prose" | "code";
  readonly text: string;
  /** Language info string on a fenced block, if any. */
  readonly language?: string;
}

/**
 * Split into prose and fenced-code blocks. Returns null when a fence opens and
 * never closes — the one input shape that must not be guessed at.
 */
function splitBlocks(markdown: string): Block[] | null {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let prose: string[] = [];
  let code: string[] | null = null;
  let marker = "";
  let language = "";

  const flushProse = (): void => {
    if (prose.length > 0) {
      blocks.push({ kind: "prose", text: prose.join("\n") });
      prose = [];
    }
  };

  for (const line of lines) {
    const match = FENCE_LINE.exec(line);
    if (code === null) {
      if (match !== null) {
        flushProse();
        code = [];
        marker = match[1][0];
        language = match[2];
        continue;
      }
      prose.push(line);
      continue;
    }
    if (match !== null && match[1][0] === marker) {
      blocks.push({ kind: "code", text: code.join("\n"), language });
      code = null;
      continue;
    }
    code.push(line);
  }

  if (code !== null) {
    return null;
  }
  flushProse();
  return blocks;
}

function renderLink(label: string, url: string): string | null {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!SAFE_SCHEMES.has(parsed.protocol)) {
    return null;
  }
  return `<a href="${escapeAttribute(trimmed)}">${inline(label)}</a>`;
}

/**
 * Match `](url)` starting at `open` in `text`, tolerating balanced parentheses
 * inside the URL (Wikipedia links are the usual offender).
 */
function matchLink(text: string, open: number): { label: string; url: string; end: number } | null {
  let depth = 1;
  let i = open + 1;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      return null;
    }
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
  }
  if (depth !== 0 || text[i + 1] !== "(") {
    return null;
  }
  const label = text.slice(open + 1, i);
  let parens = 1;
  let j = i + 2;
  for (; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === "\n") {
      return null;
    }
    if (ch === "(") {
      parens += 1;
    } else if (ch === ")") {
      parens -= 1;
      if (parens === 0) {
        break;
      }
    }
  }
  if (parens !== 0) {
    return null;
  }
  return { label, url: text.slice(i + 2, j), end: j };
}

function findClosing(text: string, from: number, token: string): number {
  const next = text.indexOf(token, from);
  // An emphasis run does not span a blank line.
  if (next === -1 || text.slice(from, next).includes("\n\n")) {
    return -1;
  }
  return next;
}

/** Is `_` at `index` a word-internal underscore (`snake_case`) rather than emphasis? */
function isWordUnderscore(text: string, index: number, run: number): boolean {
  const before = index > 0 ? text[index - 1] : "";
  const after = text[index + run] ?? "";
  return /[A-Za-z0-9]/.test(before) && /[A-Za-z0-9]/.test(after);
}

/** Convert one prose run: bold, italic, inline code and links, rest escaped. */
function inline(text: string): string {
  let out = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1) {
        out += `<code>${escapeHtml(text.slice(i + 1, close))}</code>`;
        i = close + 1;
        continue;
      }
    }

    if (ch === "[") {
      const link = matchLink(text, i);
      if (link !== null) {
        const rendered = renderLink(link.label, link.url);
        if (rendered !== null) {
          out += rendered;
          i = link.end + 1;
          continue;
        }
      }
    }

    const double = text.slice(i, i + 2);
    if ((double === "**" || double === "__") && !(double === "__" && isWordUnderscore(text, i, 2))) {
      const close = findClosing(text, i + 2, double);
      if (close > i + 2) {
        out += `<b>${inline(text.slice(i + 2, close))}</b>`;
        i = close + 2;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && !(ch === "_" && isWordUnderscore(text, i, 1))) {
      const close = findClosing(text, i + 1, ch);
      if (close > i + 1 && text[i + 1] !== " ") {
        out += `<i>${inline(text.slice(i + 1, close))}</i>`;
        i = close + 1;
        continue;
      }
    }

    out += escapeHtml(ch);
    i += 1;
  }

  return out;
}

const TAG_SCAN = /<(\/?)([a-z]+)(?:\s[^<>]*)?>/g;

/** Every emitted tag balanced and properly nested? The converter's own audit. */
function isBalanced(html: string): boolean {
  const stack: string[] = [];
  for (const match of html.matchAll(TAG_SCAN)) {
    if (match[1] === "/") {
      if (stack.pop() !== match[2]) {
        return false;
      }
    } else {
      stack.push(match[2]);
    }
  }
  return stack.length === 0;
}

/**
 * Convert agent markdown to Telegram HTML.
 *
 * @returns `{ok: true, html}` when the safe subset covered the input, or
 *   `{ok: false, text}` with the original text for a plain-text send.
 */
export function markdownToTelegramHtml(markdown: string): TelegramHtmlResult {
  const blocks = splitBlocks(markdown);
  if (blocks === null) {
    return { ok: false, text: markdown };
  }

  const parts = blocks.map((block) => {
    if (block.kind === "code") {
      const language = block.language ?? "";
      const open = language.length > 0 ? `<pre><code class="language-${escapeAttribute(language)}">` : "<pre><code>";
      return `${open}${escapeHtml(block.text)}</code></pre>`;
    }
    return inline(block.text);
  });

  const html = parts.join("\n").replace(/\n{3,}/g, "\n\n");
  if (!isBalanced(html)) {
    return { ok: false, text: markdown };
  }
  return { ok: true, html };
}
