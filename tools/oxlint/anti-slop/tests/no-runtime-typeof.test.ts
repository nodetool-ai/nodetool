/**
 * `@oxlint/plugins` ships no RuleTester, so each case is linted the way the repo lints:
 * the real `oxlint` binary over a real file, with only `no-runtime-typeof` enabled.
 * A case states the 1-based lines it expects to be reported, so an exemption that stops
 * firing and an exemption that swallows plain narrowing both fail here.
 *
 * Every case is written to one temp directory and linted in a single `oxlint` run —
 * a spawn per case costs ~18s.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface Diagnostic {
  code: string;
  filename: string;
  labels: Array<{ span: { line: number } }>;
}

const testsDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(testsDir, "..", "..", "..", "..");
const configPath = join(testsDir, "oxlintrc.fixture.json");
const oxlint = join(repoRoot, "node_modules", ".bin", "oxlint");

/** Cases, keyed by fixture file name. Line numbers in comments are 1-based. */
const cases: Record<string, { source: string[]; expected: number[] }> = {
  "plain-narrowing": {
    source: [
      "export function read(value: unknown): string {", // 1
      '  if (typeof value === "string") return value;', // 2
      '  if (typeof value === "number") return String(value);', // 3
      '  return "";', // 4
      "}", // 5
    ],
    expected: [2, 3],
  },
  "member-and-negation": {
    source: [
      "export function read(value: { id: unknown }): boolean {", // 1
      '  if (typeof value.id !== "string") return false;', // 2
      '  return typeof value.id === "string";', // 3
      "}", // 4
    ],
    expected: [2, 3],
  },
  "inside-type-guard": {
    source: [
      "export function isString(value: unknown): value is string {", // 1
      '  return typeof value === "string";', // 2
      "}", // 3
      "export const isNumber = (value: unknown): value is number =>", // 4
      '  typeof value === "number";', // 5
    ],
    expected: [],
  },
  // Exemption (a): the operand resolves to nothing, so reading it bare would throw
  // ReferenceError and no predicate can stand in for the check.
  "global-existence-probe": {
    source: [
      "export function hasDom(): boolean {", // 1
      '  return typeof window !== "undefined" && typeof document !== "undefined";', // 2
      "}", // 3
      "export function hasBuffer(): boolean {", // 4
      '  return typeof Buffer !== "undefined";', // 5
      "}", // 6
    ],
    expected: [],
  },
  "probe-shape-on-declared-binding": {
    source: [
      "declare const maybeWindow: unknown;", // 1
      "export function hasDom(): boolean {", // 2
      '  return typeof maybeWindow !== "undefined";', // 3
      "}", // 4
      "export function hasParam(candidate: unknown): boolean {", // 5
      '  return typeof candidate !== "undefined";', // 6
      "}", // 7
    ],
    expected: [3, 6],
  },
  // Exemption (b): the result is consumed as a value, so it narrows nothing.
  "template-literal": {
    source: [
      "export function explain(value: unknown): string {", // 1
      "  return `expected a string, got ${typeof value}`;", // 2
      "}", // 3
    ],
    expected: [],
  },
  "returned-value": {
    source: [
      "export function kindOf(value: unknown): string {", // 1
      "  return typeof value;", // 2
      "}", // 3
      "export const kindOfArrow = (value: unknown): string => {", // 4
      "  return typeof value;", // 5
      "};", // 6
    ],
    expected: [],
  },
  "laundered-through-a-local": {
    source: [
      "export function read(value: unknown): boolean {", // 1
      "  const kind = typeof value;", // 2
      '  return kind === "string";', // 3
      "}", // 4
    ],
    expected: [2],
  },
  "compared-then-interpolated": {
    source: [
      "export function read(value: unknown): string {", // 1
      '  if (typeof value === "string") return `got ${typeof value}`;', // 2
      '  return "";', // 3
      "}", // 4
    ],
    expected: [2],
  },
};

const workDir = mkdtempSync(join(tmpdir(), "no-runtime-typeof-"));
const reported = new Map<string, number[]>();

beforeAll(() => {
  for (const [name, { source }] of Object.entries(cases)) {
    writeFileSync(join(workDir, `${name}.ts`), `${source.join("\n")}\n`);
    reported.set(name, []);
  }
  const run = spawnSync(oxlint, ["--config", configPath, "--format", "json", workDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const stdout = run.stdout ?? "";
  const envelope = stdout.slice(stdout.indexOf("{"));
  if (envelope === "") {
    throw new Error(`oxlint produced no JSON: ${run.stderr?.slice(0, 400) ?? ""}`);
  }
  const { diagnostics } = JSON.parse(envelope) as { diagnostics: Diagnostic[] };
  for (const diagnostic of diagnostics) {
    if (!diagnostic.code.includes("no-runtime-typeof")) continue;
    const name = basename(diagnostic.filename, ".ts");
    reported.get(name)?.push(diagnostic.labels[0].span.line);
  }
  for (const lines of reported.values()) {
    lines.sort((a, b) => a - b);
  }
}, 120_000);

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("no-runtime-typeof", () => {
  it("lints every fixture", () => {
    expect([...reported.keys()].sort()).toEqual(Object.keys(cases).sort());
  });

  for (const [name, { expected }] of Object.entries(cases)) {
    it(`reports lines ${JSON.stringify(expected)} in ${name}`, () => {
      expect(reported.get(name)).toEqual(expected);
    });
  }
});
