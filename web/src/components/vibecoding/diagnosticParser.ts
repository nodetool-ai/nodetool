/**
 * Parses Next.js / webpack dev server log output into structured diagnostics
 * that can be applied as Monaco editor markers.
 */

export interface Diagnostic {
  filePath: string; // relative path, e.g. "src/app/page.tsx"
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: "error" | "warning" | "info";
}

/**
 * Next.js error formats we handle:
 *
 * 1. Webpack-style with file reference:
 *    ⨯ ./src/app/page.tsx
 *    Type error: Cannot find name 'foo'.
 *
 * 2. Webpack-style with inline location:
 *    ./src/app/page.tsx:12:5
 *    Type error: ...
 *
 * 3. Next.js compilation error block:
 *    ⨯ ./src/file.tsx (15:7) @ ComponentName
 *    ⨯ Type error: Property 'x' does not exist
 *
 * 4. TypeScript compiler style (tsc):
 *    src/file.tsx(12,5): error TS2304: Cannot find name 'foo'.
 *
 * 5. Runtime errors with stack traces:
 *    ⨯ ReferenceError: Ü is not defined
 *        at eval (src/app/page.tsx:21:1)
 *
 * 6. Warning lines:
 *    ⚠ Fast Refresh had to perform a full reload.
 */

// State machine: we accumulate multi-line error blocks
interface ParserState {
  currentFile: string | null;
  currentLine: number;
  currentColumn: number;
  messageLines: string[];
  severity: "error" | "warning" | "info";
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "");
}

// Match: ./src/app/page.tsx or ⨯ ./src/app/page.tsx
const FILE_REF = /^[⨯✖✗×\s]*\.\/([^\s:()]+\.[a-zA-Z]+)/;

// Match: ./src/app/page.tsx:12:5 or ./src/app/page.tsx (12:5)
const FILE_WITH_LOC =
  /^[⨯✖✗×\s]*\.\/([^\s:()]+\.[a-zA-Z]+)[\s:][\s(]*(\d+)[,:](\d+)/;

// Match: ⨯ ./src/file.tsx (15:7) @ Name
const NEXTJS_ERROR_HEADER =
  /^[⨯✖✗×]\s*\.\/([^\s()]+\.[a-zA-Z]+)\s*\((\d+):(\d+)\)/;

// Match: src/file.tsx(12,5): error TS2304: message
const TSC_ERROR =
  /^([^\s()]+\.[a-zA-Z]+)\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.*)/;

// Match: Type error: ... or Syntax error: ... or Error: ...
const ERROR_MESSAGE = /^[⨯✖✗×\s]*(Type error|Syntax error|Error):\s*(.*)/i;

// Match: ⨯ ReferenceError: ... / ⨯ TypeError: ... / ⨯ SyntaxError: ... etc.
// Runtime JS errors reported by Next.js with the ⨯ prefix
const RUNTIME_ERROR =
  /^[⨯✖✗×]\s*(ReferenceError|TypeError|SyntaxError|RangeError|URIError|EvalError|AggregateError):\s*(.*)/;

// Match stack trace lines with file location:
//   at eval (src/app/page.tsx:21:1)
//   at Something (src/components/Foo.tsx:5:3)
//   at (ssr)/./src/app/page.tsx (.next/server/app/page.js:126:1)
const STACK_TRACE_FILE =
  /^\s+at\s+(?:\S+\s+)?\(?(?:.*?)?(src\/[^\s:()]+\.[a-zA-Z]+):(\d+):(\d+)\)?/;

// Match: ⚠ warning text
const WARNING_ICON = /^⚠\s+(.*)/;

// Match: Warning: ...
const WARNING_MESSAGE = /^[⨯✖✗×\s]*Warning:\s*(.*)/i;

// Source line indicator: > 15 |   code here
const SOURCE_LINE = /^\s*>\s*\d+\s*\|/;

// Numbered source context lines:   19 | }
const SOURCE_CONTEXT = /^\s*\d+\s*\|/;

// Error pointer:      | ^
const ERROR_POINTER = /^\s*\|?\s*\^/;

// Stack trace line (for skipping):    at Something (file:line:col)
const STACK_TRACE = /^\s+at\s+/;

// Digest line: digest: '...'
const DIGEST_LINE = /^\s*digest:\s*'/;

/**
 * Parse an array of log lines into diagnostics.
 */
export function parseServerLogs(lines: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const state: ParserState = {
    currentFile: null,
    currentLine: 1,
    currentColumn: 1,
    messageLines: [],
    severity: "error"
  };

  function flush() {
    if (state.currentFile && state.messageLines.length > 0) {
      const message = state.messageLines
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (message) {
        diagnostics.push({
          filePath: state.currentFile,
          line: state.currentLine,
          column: state.currentColumn,
          message,
          severity: state.severity
        });
      }
    }
    state.currentFile = null;
    state.currentLine = 1;
    state.currentColumn = 1;
    state.messageLines = [];
    state.severity = "error";
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip source display lines, pointers, digests, and closing braces
    if (
      SOURCE_LINE.test(line) ||
      SOURCE_CONTEXT.test(line) ||
      ERROR_POINTER.test(line) ||
      DIGEST_LINE.test(line) ||
      line.trim() === "}" ||
      line.trim() === "{"
    ) {
      continue;
    }

    // TSC-style: file(line,col): error TS1234: message
    const tscMatch = line.match(TSC_ERROR);
    if (tscMatch) {
      flush();
      diagnostics.push({
        filePath: normalizePath(tscMatch[1]),
        line: parseInt(tscMatch[2], 10),
        column: parseInt(tscMatch[3], 10),
        message: tscMatch[5],
        severity: tscMatch[4] as "error" | "warning"
      });
      continue;
    }

    // Runtime error: ⨯ ReferenceError: Ü is not defined
    // We capture the message, then look ahead in stack trace for file/line
    const runtimeMatch = line.match(RUNTIME_ERROR);
    if (runtimeMatch) {
      flush();
      const errorType = runtimeMatch[1];
      const errorMsg = runtimeMatch[2];
      state.messageLines.push(`${errorType}: ${errorMsg}`);
      state.severity = "error";

      // Look ahead for stack trace to find file location
      for (let j = i + 1; j < lines.length && j <= i + 10; j++) {
        const stackMatch = lines[j].match(STACK_TRACE_FILE);
        if (stackMatch) {
          state.currentFile = normalizePath(stackMatch[1]);
          state.currentLine = parseInt(stackMatch[2], 10);
          state.currentColumn = parseInt(stackMatch[3], 10);
          break;
        }
        // Stop looking if we hit a non-stack-trace, non-empty line
        if (lines[j].trim() && !STACK_TRACE.test(lines[j])) break;
      }

      // If we found a file, flush immediately; otherwise discard
      if (state.currentFile) {
        flush();
      } else {
        state.messageLines = [];
      }
      continue;
    }

    // Next.js error header: ⨯ ./src/file.tsx (15:7) @ Name
    const nextjsMatch = line.match(NEXTJS_ERROR_HEADER);
    if (nextjsMatch) {
      flush();
      state.currentFile = normalizePath(nextjsMatch[1]);
      state.currentLine = parseInt(nextjsMatch[2], 10);
      state.currentColumn = parseInt(nextjsMatch[3], 10);
      continue;
    }

    // File with location: ./src/file.tsx:12:5
    const fileLocMatch = line.match(FILE_WITH_LOC);
    if (fileLocMatch) {
      flush();
      state.currentFile = normalizePath(fileLocMatch[1]);
      state.currentLine = parseInt(fileLocMatch[2], 10);
      state.currentColumn = parseInt(fileLocMatch[3], 10);
      continue;
    }

    // Plain file reference: ./src/file.tsx (but not "compiled" lines)
    const fileMatch = line.match(FILE_REF);
    if (fileMatch && !line.includes("compiled")) {
      flush();
      state.currentFile = normalizePath(fileMatch[1]);
      continue;
    }

    // Error/type error message line
    const errorMatch = line.match(ERROR_MESSAGE);
    if (errorMatch) {
      if (!state.currentFile) continue;
      state.messageLines.push(errorMatch[2] || errorMatch[1]);
      state.severity = "error";
      continue;
    }

    // Warning with ⚠ icon
    const warnIconMatch = line.match(WARNING_ICON);
    if (warnIconMatch) {
      // These are typically standalone warnings without file context
      // (e.g. "Fast Refresh had to perform a full reload")
      // Skip unless we already have a file context
      if (state.currentFile) {
        state.messageLines.push(warnIconMatch[1]);
        state.severity = "warning";
      }
      continue;
    }

    // Warning: ... message
    const warnMatch = line.match(WARNING_MESSAGE);
    if (warnMatch) {
      if (!state.currentFile) continue;
      state.messageLines.push(warnMatch[1]);
      state.severity = "warning";
      continue;
    }

    // Skip stack trace lines (already processed in runtime error lookahead)
    if (STACK_TRACE.test(line)) {
      continue;
    }

    // If we have a current file and pending message, non-empty lines
    // that look like message continuations get appended
    if (
      state.currentFile &&
      state.messageLines.length > 0 &&
      line.trim() &&
      !FILE_REF.test(line) &&
      !line.match(/^[⨯✖✗×⚠]/) &&
      !line.match(/compiled/i)
    ) {
      state.messageLines.push(line.trim());
      continue;
    }

    // New section / empty line — flush pending
    if (state.currentFile && state.messageLines.length > 0) {
      flush();
      // Re-process if this line starts a new error
      if (line.match(/^[⨯✖✗×⚠]/) || FILE_REF.test(line)) {
        i--;
      }
    }
  }

  flush();
  return diagnostics;
}

/**
 * Group diagnostics by file path for efficient marker application.
 */
export function groupByFile(
  diagnostics: Diagnostic[]
): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const existing = map.get(d.filePath);
    if (existing) {
      existing.push(d);
    } else {
      map.set(d.filePath, [d]);
    }
  }
  return map;
}
