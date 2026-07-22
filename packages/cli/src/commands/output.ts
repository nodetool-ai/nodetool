/**
 * Lightweight CLI output + prompt helpers.
 *
 * These are pure (only `node:readline`), so command modules can format tables /
 * JSON and prompt the user without pulling in the heavy deploy stack that
 * `deploy-helpers.ts` imports at top level. `deploy-helpers.ts` re-exports
 * everything here for backward compatibility.
 */

import { createInterface } from "node:readline";

/** Print a table to stdout. Missing values render as empty. */
export function printTable(
  rows: Record<string, unknown>[],
  columns?: string[]
): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(
      cols
        .map((c, i) => ` ${String(row[c] ?? "").padEnd(widths[i]!)} `)
        .join("│")
    );
  }
}

export function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printKv(rows: Record<string, unknown>): void {
  const list = Object.entries(rows).map(([key, value]) => ({
    key,
    value: String(value ?? "")
  }));
  printTable(list, ["key", "value"]);
}

/** Prompt for a line on stdin (echoes). TTY only — exits if non-TTY. */
export async function promptLine(
  message: string,
  opts?: { default?: string }
): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(`Missing value for interactive prompt: ${message}`);
    process.exit(1);
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  });
  return new Promise<string>((resolve) => {
    const suffix = opts?.default ? ` [${opts.default}]` : "";
    rl.question(`${message}${suffix}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || (opts?.default ?? ""));
    });
  });
}

/** Prompt for hidden input (typed but not echoed). TTY only. */
export async function promptHidden(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(`Missing value for interactive prompt: ${message}`);
    process.exit(1);
  }
  process.stderr.write(message);
  return new Promise<string>((resolve) => {
    let value = "";
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (data: string): void => {
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\x03") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          process.exit(130);
        }
        if (ch === "" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Yes/no confirm. Non-TTY returns the `force` value (default: false). */
export async function confirm(
  message: string,
  opts?: { force?: boolean; default?: boolean }
): Promise<boolean> {
  if (opts?.force) return true;
  if (!process.stdin.isTTY) return false;
  const defaultYes = opts?.default ?? false;
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await promptLine(`${message} ${hint}`);
  if (!answer) return defaultYes;
  return /^y(es)?$/i.test(answer);
}
