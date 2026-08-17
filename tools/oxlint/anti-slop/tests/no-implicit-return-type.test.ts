/**
 * `@oxlint/plugins` ships no RuleTester, so each case is linted the way the repo lints:
 * the real `oxlint` binary over a real file, with only `no-implicit-return-type` enabled.
 * A case states the 1-based lines it expects, so a scope that stops firing and a scope
 * that starts swallowing an unexported helper both fail here.
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
const configPath = join(testsDir, "implicit-return.fixture.json");
const oxlint = join(repoRoot, "node_modules", ".bin", "oxlint");

/** Cases keyed by fixture file name. `expected` is the 1-based lines the rule reports. */
const cases: Record<string, { source: string[]; expected: number[] }> = {
	"exported-functions": {
		source: [
			"export function parse(input: string) {", // 1
			"  return input.length;", // 2
			"}", // 3
			"export const read = (a: string) => a.trim();", // 4
			"export const load = async function (a: string) {", // 5
			"  return a;", // 6
			"};", // 7
			"export default function build() {", // 8
			"  return 1;", // 9
			"}", // 10
		],
		expected: [1, 4, 5, 8],
	},
	// Either place answers the question: on the function, or on the binding it is
	// assigned to. The second is how a typed React component is usually written.
	"annotated-either-place": {
		source: [
			"export function parse(input: string): number {", // 1
			"  return input.length;", // 2
			"}", // 3
			"export const read = (a: string): string => a.trim();", // 4
			"export const load: (a: string) => Promise<string> = async (a) => a;", // 5
			"export default function build(): number {", // 6
			"  return 1;", // 7
			"}", // 8
		],
		expected: [],
	},
	// Inference inside a module is fine — the compiler sees the body, and a helper
	// that never crosses the boundary has no contract to keep.
	"unexported-is-not-a-contract": {
		source: [
			"function helper(a: string) {", // 1
			"  return a.length;", // 2
			"}", // 3
			"const inner = (a: string) => a.trim();", // 4
			"export const sizes = [1, 2].map((n) => n * 2);", // 5
			"export const used = helper(inner('x'));", // 6
		],
		expected: [],
	},
	// A known boundary: the rule walks down from the export declaration, so a
	// function exported through a specifier list is out of its reach. Recorded
	// rather than fixed — reaching it needs a binding resolution this does not do.
	"export-specifier-is-out-of-reach": {
		source: [
			"const f = () => 1;", // 1
			"export { f };", // 2
		],
		expected: [],
	},
	"exported-class-members": {
		source: [
			"export class Job {", // 1
			"  constructor(private readonly id: string) {}", // 2
			"  run() {", // 3
			"    return this.id;", // 4
			"  }", // 5
			"  get label() {", // 6
			"    return this.id;", // 7
			"  }", // 8
			"  set label(next: string) {", // 9
			"    void next;", // 10
			"  }", // 11
			"  static make() {", // 12
			"    return new Job('a');", // 13
			"  }", // 14
			"  handler = () => this.id;", // 15
			"}", // 16
		],
		expected: [3, 6, 12, 15],
	},
	// A constructor has no return type to write and a setter cannot have one;
	// `private` and `#` members are not the module's surface.
	"class-members-out-of-scope": {
		source: [
			"export class Job {", // 1
			"  #secret() {", // 2
			"    return 1;", // 3
			"  }", // 4
			"  private hidden() {", // 5
			"    return 2;", // 6
			"  }", // 7
			"  #cache = () => 3;", // 8
			"  run(): number {", // 9
			"    return this.#secret() + this.hidden() + this.#cache();", // 10
			"  }", // 11
			"}", // 12
			"class Internal {", // 13
			"  run() {", // 14
			"    return 1;", // 15
			"  }", // 16
			"}", // 17
			"void new Internal();", // 18
		],
		expected: [],
	},
	// An overload signature and an ambient declaration are contracts with no body
	// at all, so inference cannot stand in for the annotation.
	"declarations-without-bodies": {
		source: [
			"export declare function widen(value: string);", // 1
			"export interface Port {", // 2
			"  send(payload: string);", // 3
			"}", // 4
		],
		expected: [1],
	},
};

const workDir = mkdtempSync(join(tmpdir(), "no-implicit-return-type-"));
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
		if (!diagnostic.code.includes("no-implicit-return-type")) continue;
		reported.get(basename(diagnostic.filename, ".ts"))?.push(diagnostic.labels[0].span.line);
	}
	for (const lines of reported.values()) {
		lines.sort((a, b) => a - b);
	}
}, 120_000);

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("no-implicit-return-type", () => {
	it("lints every fixture", () => {
		expect([...reported.keys()].sort()).toEqual(Object.keys(cases).sort());
	});

	for (const [name, { expected }] of Object.entries(cases)) {
		it(`reports lines ${JSON.stringify(expected)} in ${name}`, () => {
			expect(reported.get(name)).toEqual(expected);
		});
	}
});
