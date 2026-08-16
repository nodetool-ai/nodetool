/**
 * How a Code-node body becomes a runnable function, shared by every host that
 * executes one: the `nodetool.code.Code` node itself and the agent-facing
 * `run_code` / `test_code` harness. One implementation, so a body that runs in
 * the authoring harness runs the same way inside a workflow.
 */

/** Statement keywords that should never be wrapped with `return (...)`. */
const STATEMENT_KEYWORDS =
  /^(if|else|for|while|do|switch|try|catch|finally|throw|const|let|var|class|function|with|debugger|break|continue|return)\b/;

/**
 * Identifiers after which a `/` opens a regex literal rather than dividing —
 * every other identifier is a value, and a value is divisible.
 */
const REGEX_AFTER_KEYWORD = new Set([
  "return",
  "yield",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "case",
  "do",
  "else"
]);

/**
 * Blank out everything that is not code — comments, strings, template literal
 * text, regex literals — so the keyword probes below only see code.
 *
 * One left-to-right scan, because whichever construct opens first wins: a `//`
 * inside a string is not a comment, a quote inside a comment does not open a
 * string, and a quote inside a regex character class opens neither. Passing
 * over the whole body once per construct instead let a URL literal
 * (`"http://a.com"`) swallow the rest of its line as a comment.
 *
 * A comment becomes a space rather than nothing, so a comment sitting between
 * two identifiers does not fuse them into one token. A template literal keeps
 * its `${…}` interpolations, which are code.
 */
function stripStringsAndComments(code: string): string {
  const n = code.length;
  let out = "";
  let i = 0;
  // Brace depth inside the innermost `${…}`, with the enclosing depths stacked
  // — so a `}` is only an interpolation's end when nothing else is open.
  const templates: number[] = [];
  let braces = 0;
  // Last significant character, and the last identifier, which together decide
  // whether a `/` opens a regex literal.
  let prev = "";
  let prevWord = "";

  const setPrev = (char: string, word = ""): void => {
    prev = char;
    prevWord = word;
  };

  /** Skip a template's literal run; stops after its closing tick or its `${`. */
  const skipTemplateText = (): void => {
    while (i < n) {
      if (code[i] === "\\") {
        i += 2;
        continue;
      }
      if (code[i] === "`") {
        i++;
        braces = templates.pop() ?? 0;
        out += "`";
        setPrev("`");
        return;
      }
      if (code.startsWith("${", i)) {
        i += 2;
        out += "${";
        setPrev("{");
        return;
      }
      i++;
    }
  };

  const opensRegex = (): boolean => {
    if (prev === "") return true;
    if (/[\w$]/.test(prev)) return REGEX_AFTER_KEYWORD.has(prevWord);
    // `}` is ambiguous: a block's is followed by a regex, an object
    // literal's by a division. Read it as a value so the text after it stays
    // code — missing a real `yield` breaks a working body, while seeing one
    // inside a regex only mis-routes a body that mentions the word.
    return !")]}`".includes(prev);
  };

  while (i < n) {
    const char = code[i];
    if (code.startsWith("//", i)) {
      while (i < n && code[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (code.startsWith("/*", i)) {
      i += 2;
      while (i < n && !code.startsWith("*/", i)) i++;
      i = Math.min(n, i + 2);
      out += " ";
      continue;
    }
    if (char === '"' || char === "'") {
      i++;
      // A quoted string cannot hold a raw newline, so an unterminated one ends
      // at the line break rather than eating the rest of the body.
      while (i < n && code[i] !== char && code[i] !== "\n") {
        i += code[i] === "\\" ? 2 : 1;
      }
      if (code[i] === char) i++;
      out += char + char;
      setPrev(char);
      continue;
    }
    if (char === "`") {
      i++;
      templates.push(braces);
      braces = 0;
      out += "`";
      skipTemplateText();
      continue;
    }
    if (char === "}" && templates.length > 0 && braces === 0) {
      i++;
      out += "}";
      setPrev("}");
      skipTemplateText();
      continue;
    }
    if (char === "/" && opensRegex()) {
      const start = i;
      i++;
      let inClass = false;
      let closed = false;
      while (i < n && code[i] !== "\n") {
        const inner = code[i];
        if (inner === "\\") {
          i += 2;
          continue;
        }
        if (inner === "[") inClass = true;
        else if (inner === "]") inClass = false;
        else if (inner === "/" && !inClass) {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (closed) {
        while (i < n && /[a-z]/.test(code[i])) i++;
        out += " ";
        // A regex literal is a value, so the next `/` divides it.
        setPrev(")");
        continue;
      }
      // No closing slash on the line: it was a division after all.
      i = start;
    }
    if (/[\w$]/.test(char)) {
      let j = i;
      while (j < n && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      out += word;
      setPrev(word.slice(-1), word);
      i = j;
      continue;
    }
    if (char === "{") braces++;
    if (char === "}") braces = Math.max(0, braces - 1);
    out += char;
    if (!/\s/.test(char)) setPrev(char);
    i++;
  }
  return out;
}

/**
 * Check for a real `return` statement — not one inside a string or comment.
 */
export function hasReturnStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[;\n{}\s])return[\s;(]/.test(stripped);
}

/**
 * Check for a real `yield` statement — not one inside a string or comment.
 *
 * The keyword is delimited the way {@link usesEmitOutputContract} delimits its
 * own: anything that is not a word character or a `.` may precede it, and a
 * word character may not follow. Demanding whitespace on both sides instead
 * missed `yield*`, `(yield x)` and `[yield x]`, which are all real yields.
 * `{ yield: 1 }` is a property key, not the keyword.
 */
export function hasYieldStatement(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[^.\w$])yield(?![\w$])(?!\s*:)/.test(stripped);
}

/**
 * Whether the body uses the `emit`/`output` contract rather than the legacy
 * return/yield one.
 *
 * A body that calls either function names its outputs explicitly and its return
 * value is ignored; a body that calls neither runs the legacy path. Every host
 * routes on this one probe, so the two contracts never both apply to one body.
 *
 * The match is textual on purpose — it runs before the parser, on bodies that
 * may not parse. `x.output(` and `myemit(` are not calls to the bridge, and a
 * call inside a string or a comment is not a call at all.
 */
export function usesEmitOutputContract(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[^.\w$])(?:emit|output)\s*\(/.test(stripped);
}

/**
 * Whether the body consumes its inputs as streams rather than as one buffered
 * snapshot per upstream item.
 *
 * A body that calls `stream(name)` — or reaches any member of it, `stream.any`,
 * `stream.first`, `stream.open` — runs once and drains its inbox itself, so the
 * node hydrates `is_streaming_input: true`. A body that never mentions `stream`
 * keeps today's per-item invocation.
 *
 * Textual for the same reason as {@link usesEmitOutputContract}: it answers
 * before the parser, on bodies that may not parse. `x.stream(` is a method on
 * something else, `mystream(` is another function, and a mention inside a
 * string or a comment is not a call at all.
 */
export function usesStreamInputContract(code: string): boolean {
  const stripped = stripStringsAndComments(code);
  return /(?:^|[^.\w$])stream\s*[(.]/.test(stripped);
}

/**
 * Wrap the last expression with `return(...)` for implicit return support.
 */
export function wrapImplicitReturn(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "return {};";

  const lines = trimmed.split("\n");
  const lastIdx = lines.length - 1;
  const last = lines[lastIdx].trim();

  if (STATEMENT_KEYWORDS.test(last)) return code;
  if (!last || last.startsWith("//") || last.startsWith("/*")) return code;

  if (
    last.startsWith("{") ||
    last.startsWith("(") ||
    last.startsWith("[") ||
    last.startsWith('"') ||
    last.startsWith("'") ||
    last.startsWith("`") ||
    last.startsWith(".") ||
    /^[0-9]/.test(last) ||
    /^(true|false|null|undefined|NaN|Infinity)\b/.test(last) ||
    /^[a-zA-Z_$][a-zA-Z0-9_$.]*(\s*[({[])?/.test(last)
  ) {
    lines[lastIdx] = `return (${lines[lastIdx]})`;
    return lines.join("\n");
  }

  return code;
}

/**
 * Normalize a body's return value into an output bag.
 *
 * A plain object is the outputs themselves — its keys become handles. Anything
 * else (a string, an array, a class instance) becomes the single `output`
 * handle. `null`/`undefined` mean "no outputs".
 */
export function normalizeCodeOutput(value: unknown) {
  if (value === null || value === undefined) return {};
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as object).constructor?.name === "Object"
  ) {
    return value as Record<string, unknown>;
  }
  return { output: value };
}
