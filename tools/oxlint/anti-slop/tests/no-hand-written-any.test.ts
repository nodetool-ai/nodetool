/**
 * `@oxlint/plugins` ships no RuleTester, so each case is linted the way the repo lints:
 * the real `oxlint` binary over a real file, with only `no-hand-written-any` and
 * `no-unsafe-dictionary-type` enabled. A case states the 1-based lines it expects from
 * each rule, so an exemption that stops firing, an exemption that swallows a plain
 * annotation, and a `Record<string, any>` reported twice all fail here.
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
const configPath = join(testsDir, "any.fixture.json");
const oxlint = join(repoRoot, "node_modules", ".bin", "oxlint");

/**
 * Cases, keyed by fixture file name. `expected` is the lines `no-hand-written-any`
 * reports; `expectedDictionary` is the lines `no-unsafe-dictionary-type` reports, which
 * exists so the de-duplication cases can assert *which* rule spoke, not merely that one
 * of them did. Line numbers are 1-based.
 */
const cases: Record<string, { source: string[]; expected: number[]; expectedDictionary?: number[] }> =
	{
		"parameters-and-returns": {
			source: [
				"export function parse(input: any): any {", // 1
				"  return input;", // 2
				"}", // 3
				"export const read = (a: string, b: any): void => {", // 4
				"  void a;", // 5
				"  void b;", // 6
				"};", // 7
				"export interface Port {", // 8
				"  send(payload: any): Promise<any>;", // 9
				"}", // 10
			],
			expected: [1, 1, 4, 9, 9],
		},
		"variables-and-properties": {
			source: [
				"export const cache: any = {};", // 1
				"let pending: any;", // 2
				"pending = 1;", // 3
				"export class Job {", // 4
				"  result: any = null;", // 5
				"}", // 6
				"export interface Row {", // 7
				"  value: any;", // 8
				"}", // 9
			],
			expected: [1, 2, 5, 8],
		},
		"type-arguments": {
			source: [
				"export const items: any[] = [];", // 1
				"export const boxed: Array<any> = [];", // 2
				"export const later: Promise<any> = Promise.resolve(1);", // 3
				"export const pairs: Map<string, any> = new Map();", // 4
				"export const nested: Array<Array<any>> = [];", // 5
			],
			expected: [1, 2, 3, 4, 5],
		},
		// The `@prop` decorator contract: 95% of the population, not fixable at the site.
		// If this case starts reporting, the exemption was "simplified" away.
		"declare-class-property": {
			source: [
				"export class ImageNode {", // 1
				"  declare postprocessing: any;", // 2
				"  declare strength: any;", // 3
				"  fixable: any = null;", // 4
				"}", // 5
			],
			expected: [4],
		},
		// `Record<string, any>` is one finding, and it belongs to the other rule.
		"dictionary-belongs-to-the-other-rule": {
			source: [
				"export const meta: Record<string, any> = {};", // 1
				"export function tag(input: Record<string, any>): void {", // 2
				"  void input;", // 3
				"}", // 4
			],
			expected: [],
			expectedDictionary: [1, 2],
		},
		// Line 1: the dictionary is the outer type, so that rule speaks and this one is
		// silent. Line 2: the dictionary's direct value type is `any[]`, not `any`, so
		// `no-unsafe-dictionary-type` classifies nothing and the `any` is this rule's to
		// report. The two rules partition the syntax; neither doubles up.
		"dictionary-nested-in-a-type-argument": {
			source: [
				"export const rows: Array<Record<string, any>> = [];", // 1
				"export const index: Record<string, any[]> = {};", // 2
			],
			expected: [2],
			expectedDictionary: [1],
		},
		// `as any` is `require-safety-comment-for-type-assertion`'s question, not this one.
		"assertions-are-out-of-scope": {
			source: [
				"export function widen(value: string): unknown {", // 1
				"  return value as any;", // 2
				"}", // 3
				"export const forced = <any>{};", // 4
			],
			expected: [],
		},
		// Positions this rule deliberately does not claim.
		"unclaimed-positions": {
			source: [
				"export type Loose = any;", // 1
				"export type LooseList = any[];", // 2
				"export type Box<T = any> = { value: T };", // 3
			],
			expected: [],
		},
	};

const workDir = mkdtempSync(join(tmpdir(), "no-hand-written-any-"));
const reported = new Map<string, number[]>();
const reportedDictionary = new Map<string, number[]>();

beforeAll(() => {
	for (const [name, { source }] of Object.entries(cases)) {
		writeFileSync(join(workDir, `${name}.ts`), `${source.join("\n")}\n`);
		reported.set(name, []);
		reportedDictionary.set(name, []);
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
		const name = basename(diagnostic.filename, ".ts");
		const line = diagnostic.labels[0].span.line;
		if (diagnostic.code.includes("no-hand-written-any")) {
			reported.get(name)?.push(line);
		} else if (diagnostic.code.includes("no-unsafe-dictionary-type")) {
			reportedDictionary.get(name)?.push(line);
		}
	}
	for (const lines of [...reported.values(), ...reportedDictionary.values()]) {
		lines.sort((a, b) => a - b);
	}
}, 120_000);

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("no-hand-written-any", () => {
	it("lints every fixture", () => {
		expect([...reported.keys()].sort()).toEqual(Object.keys(cases).sort());
	});

	for (const [name, { expected, expectedDictionary }] of Object.entries(cases)) {
		it(`reports lines ${JSON.stringify(expected)} in ${name}`, () => {
			expect(reported.get(name)).toEqual(expected);
		});

		it(`leaves ${JSON.stringify(expectedDictionary ?? [])} to no-unsafe-dictionary-type in ${name}`, () => {
			expect(reportedDictionary.get(name)).toEqual(expectedDictionary ?? []);
		});
	}
});
