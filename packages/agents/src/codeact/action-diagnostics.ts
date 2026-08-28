/**
 * Error diagnostics for CodeAct actions.
 *
 * An action runs as `${prelude}\n${action code}` inside one guest module named
 * `user-code`, so QuickJS stack positions count the prelude's thousand-odd
 * lines first. The observation an agent sees therefore pointed far past its own
 * program (`at user-code:1245:26` for a sixty-line action) and syntax errors
 * arrived with no excerpt to look at — two failures a model cannot fix from
 * that alone.
 *
 * {@link annotateActionStack} rewinds each `user-code` frame into the action's
 * own coordinates and appends the offending source line, so the frame reads
 * `at action:<line>:<col>` and the excerpt sits under it.
 */

import { parseCodeBody } from "@nodetool-ai/node-sdk";
import { entryBodyLineOffset } from "../js-sandbox-worker/interpreter.js";

/**
 * A stack frame pointing into the guest's `user-code` module. Both shapes
 * appear: bare frames from module-level code (`at user-code:8:9`) and named
 * ones (`at helper (user-code:12:3)`).
 */
const USER_CODE_FRAME = /^(\s*at\s+(?:[^(]*\()?)user-code:(\d+):(\d+)(\)?)\s*$/;

export interface AnnotatedActionStack {
  readonly stack?: string;
}

const MAX_EXCERPT_CHARS = 200;

function excerptFor(code: string, line: number, column: number): string {
  const lines = code.split("\n");
  if (line < 1 || line > lines.length) return "";
  const text = lines[line - 1];
  const shown =
    text.length > MAX_EXCERPT_CHARS
      ? text.slice(0, MAX_EXCERPT_CHARS) + "…"
      : text;
  // A one-character column is approximate across tabs, but it still points a
  // model at the offending token far better than the bare pair of numbers.
  const caret =
    column >= 1 && text.length <= MAX_EXCERPT_CHARS
      ? `\n         ${" ".repeat(Math.min(column - 1, shown.length))}^`
      : "";
  return shown + caret;
}

/** How many module lines precede the action's first line. */
function actionLineOffset(prelude: string, code: string): number {
  // The joining "\n" makes the prelude occupy exactly split("\n").length lines
  // of the combined source before the action begins.
  return prelude.split("\n").length + entryBodyLineOffset(prelude + "\n" + code);
}

/**
 * Rewrite `at user-code:L:C` frames against `${prelude}\n${code}`.
 *
 * Frames above the action's first line belong to the prelude itself; they keep
 * their original coordinates rather than a negative rewrite. The first frame
 * that lands on real action code gains the source-line note under it.
 */
export function annotateActionStack(
  stack: string | undefined,
  prelude: string,
  code: string
): AnnotatedActionStack {
  if (!stack) return {};
  const offset = actionLineOffset(prelude, code);
  let noted = false;

  const rewritten = stack.split("\n").map((frameLine) => {
    const match = USER_CODE_FRAME.exec(frameLine);
    if (!match) return frameLine;
    const mapped = Number(match[2]) - offset;
    if (mapped < 1) return frameLine;
    const frame = `${match[1]}action:${mapped}:${match[3]}${match[4]}`;
    if (!noted) {
      noted = true;
      const text = excerptFor(code, mapped, Number(match[3]));
      if (text) {
        return `${frame}\n    >> your code, line ${mapped}: ${text}`;
      }
    }
    return frame;
  });

  return { stack: rewritten.join("\n") };
}

/**
 * The failure fields of an action observation: the guest error plus its stack
 * rewound into action coordinates. Both CodeAct executors build the same shape,
 * so they share this instead of repeating the wiring.
 */
export function annotateFailure(
  error: string | undefined,
  stack: string | undefined,
  prelude: string,
  code: string
): { readonly error?: string; readonly stack?: string } {
  const reparsed = reparseSyntaxError(error, code);
  if (reparsed !== undefined) return reparsed;
  if (!stack) return { error };
  return { error, stack: annotateActionStack(stack, prelude, code).stack };
}

/**
 * Re-diagnose a guest syntax error with acorn, which knows where it is.
 *
 * QuickJS compiles the whole entry module and reports a position that need not
 * be the offending one: `import { integerInput } = "…"` on line 3 arrived as
 * `SyntaxError: expecting '(' at action:1:26`, with the excerpt showing a line
 * that was perfectly good. A model reading that rewrites line 1 and hits the
 * same error again — which is what happened, twice, in the session this comes
 * from.
 *
 * Only a body acorn *also* rejects is re-reported, so this can never override
 * a genuine failure the parser is happy with. The other SyntaxError a guest
 * raises — module linking, "Could not find export 'x'" — parses fine here and
 * passes through untouched.
 */
function reparseSyntaxError(
  error: string | undefined,
  code: string
): { readonly error: string; readonly stack?: string } | undefined {
  if (error === undefined || !error.includes("SyntaxError")) return undefined;
  const parsed = parseCodeBody(code);
  if (!("error" in parsed)) return undefined;
  const line = parsed.line;
  const message = `SyntaxError: ${parsed.error}`;
  if (line === undefined) return { error: message };
  const excerpt = excerptFor(code, line, 1);
  const stack =
    excerpt === ""
      ? `    at action:${line}`
      : `    at action:${line}\n    >> your code, line ${line}: ${excerpt}`;
  return { error: message, stack };
}
