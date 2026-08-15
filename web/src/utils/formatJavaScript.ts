/**
 * Pretty-print a guest JavaScript program for display.
 * Display only — do not feed the result back into the sandbox.
 */

const INDENT = "  ";
const LONG_LINE = 88;

const KEYWORDS_BEFORE_PAREN = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "await"
]);

const NO_SPACE_BEFORE = new Set([
  ".",
  ",",
  ";",
  ")",
  "]",
  ":",
  "++",
  "--"
]);

const NO_SPACE_AFTER = new Set([
  "(",
  "[",
  ".",
  "!",
  "++",
  "--",
  "~"
]);

const MULTI_CHAR_OPS = [
  "===",
  "!==",
  ">>>",
  ">>=",
  "<<=",
  "**=",
  "&&=",
  "||=",
  "??=",
  "**",
  "&&",
  "||",
  "??",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "++",
  "--"
];

export function formatJavaScriptForDisplay(code: string): string {
  const src = normalizeSource(code);
  if (!src) {
    return "";
  }
  if (!needsPrettyPrint(src)) {
    return src;
  }
  return prettyPrint(src);
}

function normalizeSource(code: string): string {
  const normalized = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(
    /\t/g,
    INDENT
  );
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const pad = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(pad)).join("\n");
}

function needsPrettyPrint(src: string): boolean {
  const lines = src.split("\n");
  if (lines.some((line) => line.length > LONG_LINE)) {
    return true;
  }
  return (
    hasPackedStatements(src) || hasCompactBrace(src) || hasCompactBracket(src)
  );
}

/**
 * True when a top-level `;` is followed by more code on the same line.
 * `for (;;)` stays packed because those semicolons sit inside `()`.
 */
function hasPackedStatements(src: string): boolean {
  let paren = 0;
  let bracket = 0;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (isQuote(ch)) {
      i = skipQuoted(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i = skipLineComment(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i = skipBlockComment(src, i);
      continue;
    }
    if (ch === "(") {
      paren += 1;
    } else if (ch === ")") {
      paren = Math.max(0, paren - 1);
    } else if (ch === "[") {
      bracket += 1;
    } else if (ch === "]") {
      bracket = Math.max(0, bracket - 1);
    } else if (ch === ";" && paren === 0 && bracket === 0) {
      let j = i + 1;
      while (j < src.length && (src[j] === " " || src[j] === "\t")) {
        j += 1;
      }
      if (j < src.length && src[j] !== "\n" && src[j] !== "\r") {
        return true;
      }
    }
    i += 1;
  }
  return false;
}

function hasCompactOpen(src: string, open: string, close: string): boolean {
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (isQuote(ch)) {
      i = skipQuoted(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i = skipLineComment(src, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i = skipBlockComment(src, i);
      continue;
    }
    if (ch === open) {
      let j = i + 1;
      while (j < src.length && (src[j] === " " || src[j] === "\t")) {
        j += 1;
      }
      if (j < src.length && src[j] !== close && src[j] !== "\n") {
        return true;
      }
    }
    i += 1;
  }
  return false;
}

/** `{` with more of the block still on the same line. */
function hasCompactBrace(src: string): boolean {
  return hasCompactOpen(src, "{", "}");
}

/** `[` with more of the array still on the same line. */
function hasCompactBracket(src: string): boolean {
  return hasCompactOpen(src, "[", "]");
}

function prettyPrint(src: string): string {
  let out = "";
  let indent = 0;
  const stack: string[] = [];
  let i = 0;
  let lastTok = "";

  const pad = () => INDENT.repeat(Math.max(0, indent));
  const atLineStart = () => /(?:^|\n)[ \t]*$/u.test(out);
  const trimTrailingWs = () => {
    out = out.replace(/[ \t]+$/u, "");
  };
  const breakLine = () => {
    trimTrailingWs();
    if (!/(?:^|\n)$/u.test(out)) {
      out += "\n";
    }
    out += pad();
  };

  const emit = (tok: string) => {
    if (!atLineStart() && shouldSpace(lastTok, tok)) {
      out += " ";
    }
    out += tok;
    lastTok = tok;
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\n") {
      trimTrailingWs();
      if (!atLineStart()) {
        out += "\n";
        out += pad();
      }
      i += 1;
      continue;
    }

    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }

    if (isQuote(ch)) {
      const end = skipQuoted(src, i);
      emit(src.slice(i, end));
      i = end;
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      const end = skipLineComment(src, i);
      emit(src.slice(i, end).trimEnd());
      i = end;
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      const end = skipBlockComment(src, i);
      emit(src.slice(i, end));
      i = end;
      continue;
    }

    if (ch === "{") {
      emit("{");
      stack.push("{");
      indent += 1;
      i += 1;
      const next = peekNonWs(src, i);
      if (next !== "}") {
        breakLine();
      }
      continue;
    }

    if (ch === "}") {
      if (stack[stack.length - 1] === "{") {
        stack.pop();
      }
      indent = Math.max(0, indent - 1);
      trimTrailingWs();
      if (!/(?:^|\n)$/u.test(out)) {
        out += "\n";
      }
      out = out.replace(/\n[ \t]*$/u, "\n") + pad();
      out += "}";
      lastTok = "}";
      i += 1;
      const next = peekNonWs(src, i);
      if (next === "else" || next === "catch" || next === "finally") {
        out += " ";
        lastTok = "";
      } else if (next !== ";" && next !== "," && next !== ")" && next !== "") {
        breakLine();
      }
      continue;
    }

    if (ch === "(") {
      emit("(");
      stack.push("(");
      i += 1;
      continue;
    }

    if (ch === ")") {
      emit(")");
      if (stack[stack.length - 1] === "(") {
        stack.pop();
      }
      i += 1;
      continue;
    }

    if (ch === "[") {
      emit("[");
      stack.push("[");
      i += 1;
      if (peekNonWs(src, i) !== "]") {
        indent += 1;
        breakLine();
      }
      continue;
    }

    if (ch === "]") {
      const opened = stack[stack.length - 1] === "[";
      if (opened) {
        stack.pop();
      }
      if (lastTok !== "[") {
        indent = Math.max(0, indent - 1);
        trimTrailingWs();
        if (!/(?:^|\n)$/u.test(out)) {
          out += "\n";
        }
        out = out.replace(/\n[ \t]*$/u, "\n") + pad();
      }
      out += "]";
      lastTok = "]";
      i += 1;
      continue;
    }

    if (ch === ";") {
      emit(";");
      i += 1;
      const inCall = stack[stack.length - 1] === "(" || stack[stack.length - 1] === "[";
      if (!inCall && peekNonWs(src, i) !== "") {
        breakLine();
      }
      continue;
    }

    if (ch === ",") {
      emit(",");
      i += 1;
      const inner = stack[stack.length - 1];
      if (inner === "{" || inner === "[") {
        breakLine();
      }
      continue;
    }

    const num = readNumber(src, i);
    if (num) {
      emit(num);
      i += num.length;
      continue;
    }

    const op = readOperator(src, i);
    if (op) {
      emit(op);
      i += op.length;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < src.length && isIdentPart(src[j])) {
        j += 1;
      }
      emit(src.slice(i, j));
      i = j;
      continue;
    }

    emit(ch);
    i += 1;
  }

  return out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function shouldSpace(prev: string, next: string): boolean {
  if (!prev) {
    return false;
  }
  if (NO_SPACE_AFTER.has(prev) || NO_SPACE_BEFORE.has(next)) {
    return false;
  }
  if (next === "(") {
    return KEYWORDS_BEFORE_PAREN.has(prev);
  }
  return true;
}

function readNumber(src: string, i: number): string | null {
  const ch = src[i];
  if (ch === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
    let j = i + 2;
    while (j < src.length && /[0-9a-fA-F]/.test(src[j])) {
      j += 1;
    }
    return j > i + 2 ? src.slice(i, j) : null;
  }
  if (ch === "." && /[0-9]/.test(src[i + 1] ?? "")) {
    let j = i + 1;
    while (j < src.length && /[0-9]/.test(src[j])) {
      j += 1;
    }
    return src.slice(i, j);
  }
  if (!/[0-9]/.test(ch)) {
    return null;
  }
  let j = i;
  while (j < src.length && /[0-9]/.test(src[j])) {
    j += 1;
  }
  if (src[j] === ".") {
    j += 1;
    while (j < src.length && /[0-9]/.test(src[j])) {
      j += 1;
    }
  }
  if (src[j] === "e" || src[j] === "E") {
    let k = j + 1;
    if (src[k] === "+" || src[k] === "-") {
      k += 1;
    }
    if (/[0-9]/.test(src[k] ?? "")) {
      j = k;
      while (j < src.length && /[0-9]/.test(src[j])) {
        j += 1;
      }
    }
  }
  return src.slice(i, j);
}

function readOperator(src: string, i: number): string | null {
  for (const op of MULTI_CHAR_OPS) {
    if (src.startsWith(op, i)) {
      return op;
    }
  }
  return null;
}

function isQuote(ch: string): boolean {
  return ch === "'" || ch === '"' || ch === "`";
}

function skipQuoted(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && ch === "$" && src[i + 1] === "{") {
      i = skipTemplateExpr(src, i + 2);
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return src.length;
}

function skipTemplateExpr(src: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (isQuote(ch)) {
      i = skipQuoted(src, i);
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
    i += 1;
  }
  return i;
}

function skipLineComment(src: string, start: number): number {
  let i = start + 2;
  while (i < src.length && src[i] !== "\n") {
    i += 1;
  }
  return i;
}

function skipBlockComment(src: string, start: number): number {
  let i = start + 2;
  while (i < src.length) {
    if (src[i] === "*" && src[i + 1] === "/") {
      return i + 2;
    }
    i += 1;
  }
  return src.length;
}

function peekNonWs(src: string, start: number): string {
  let i = start;
  while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\n")) {
    i += 1;
  }
  if (i >= src.length) {
    return "";
  }
  if (isIdentStart(src[i])) {
    let j = i + 1;
    while (j < src.length && isIdentPart(src[j])) {
      j += 1;
    }
    return src.slice(i, j);
  }
  return src[i];
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}
