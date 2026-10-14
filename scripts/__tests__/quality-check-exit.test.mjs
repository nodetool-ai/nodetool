import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = resolve(ROOT, ".github/workflows/quality-checks.yml");

function matrixRunScript() {
  const source = readFileSync(WORKFLOW, "utf8");
  const blocks = [...source.matchAll(
    /        run: \|\n((?:          .*\n)+)/g
  )].map((match) => match[1].replace(/^          /gm, ""))
    .filter((script) => script.includes("::group::${{ matrix.check }}"));
  expect(blocks).toHaveLength(2);
  expect(new Set(blocks).size).toBe(1);
  const [script] = blocks;
  expect(source.match(/NODETOOL_CHECK_COMMAND: \$\{\{ matrix.command \}\}/g)).toHaveLength(2);
  expect(script.match(/\$\{\{ matrix.check \}\}/g)).toHaveLength(1);
  return script;
}

describe("quality check matrix exit status", () => {
  it("bounds harness concurrency in both diff and full-run paths", () => {
    const source = readFileSync(WORKFLOW, "utf8");
    const entry = source.match(/"check": "harness-gate",\s*"command": ("(?:\\.|[^"\\])*")/);
    expect(entry).not.toBeNull();
    const command = JSON.parse(entry[1]);
    const paths = command.match(/npm run dev:nodetool -- harness gate [^;]+/g);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain('--base "$CI_BASE_SHA"');
    expect(paths[1]).toContain("--all");
    for (const path of paths) {
      expect(path).toMatch(/--jobs 2(?: |$)/);
      expect(path).toMatch(/--timeout 900(?: |$)/);
    }
    const builtJob = source.slice(source.indexOf("\n  built:"));
    expect(builtJob).toMatch(/timeout-minutes: 45/);
    expect(builtJob).toContain("NODETOOL_TEST_WORKERS: ${{ matrix.check == 'harness-gate' && '1' || '' }}");
    expect(builtJob).toContain("NODETOOL_HARNESS_INCLUDE_SUITES: ${{ inputs.skip-tests && '--include-suites' || '' }}");
    for (const base of ["", "fixture-base"]) {
      for (const skipTests of [false, true]) {
        const result = spawnSync("bash", ["-e", "-c", `npm() { printf '%s\\n' "$@"; }\n${command}`], {
          encoding: "utf8",
          env: {
            ...process.env,
            CI_BASE_SHA: base,
            NODETOOL_HARNESS_INCLUDE_SUITES: skipTests ? "--include-suites" : ""
          },
          timeout: 5000
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        const args = result.stdout.trim().split("\n");
        expect(args.filter((arg) => arg === "--include-suites")).toHaveLength(skipTests ? 1 : 0);
        expect(args).toContain(base ? "--base" : "--all");
        expect(args.slice(args.indexOf("--jobs"), args.indexOf("--jobs") + 2)).toEqual(["--jobs", "2"]);
      }
    }
  });

  it("runs the offline agentic QA origin checks in the always-selected lint job", () => {
    const source = readFileSync(WORKFLOW, "utf8");
    const guard = source.match(/      - name: Check agentic QA origin restrictions\n        if: (.*)\n        run: (.*)\n/g);
    expect(guard).toHaveLength(1);
    expect(guard[0]).toContain("if: matrix.check == 'lint'");
    expect(guard[0]).toContain("run: npm --prefix web run test:agentic-qa");
    const staticJob = source.slice(source.indexOf("\n  static:"), source.indexOf("\n  build:"));
    const install = staticJob.match(/      - name: Install Chromium for agentic QA checks\n        if: matrix.check == 'lint'\n        run: npx playwright install --with-deps chromium\n/g);
    expect(install).toHaveLength(1);
    expect(staticJob.indexOf(install[0])).toBeLessThan(staticJob.indexOf(guard[0]));
    expect(source).toMatch(/"check": "lint",\s*"command": "npm run lint && npm run lint:anti-slop:check",\s*"when": "always"/);
  });

  it.each([
    ["success", "echo EARLY && echo MIDDLE && echo FINAL", 0, ["EARLY", "MIDDLE", "FINAL"], []],
    ["early failure", "(exit 7) && echo MIDDLE && echo FINAL", 7, [], ["MIDDLE", "FINAL"]],
    ["middle failure", "echo EARLY && (exit 9) && echo FINAL", 9, ["EARLY"], ["FINAL"]],
    ["final failure", "echo EARLY && echo MIDDLE && (exit 11)", 11, ["EARLY", "MIDDLE"], []],
    ["branch early failure", "if true; then (exit 13); echo FINAL; fi", 13, [], ["FINAL"]],
    ["branch middle failure", "if true; then echo EARLY; (exit 17); echo FINAL; fi", 17, ["EARLY"], ["FINAL"]],
    ["pipeline failure", "(exit 19) | cat", 19, [], []]
  ])("preserves %s", (_name, command, status, present, absent) => {
    const script = matrixRunScript().replace("${{ matrix.check }}", "fixture");
    const result = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: { ...process.env, NODETOOL_CHECK_COMMAND: command },
      timeout: 5000
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(status);
    for (const marker of present) {
      expect(result.stdout.split("\n")).toContain(marker);
    }
    for (const marker of absent) {
      expect(result.stdout.split("\n")).not.toContain(marker);
    }
    if (status === 0) {
      expect(result.stdout).toContain("::endgroup::");
    } else {
      expect(result.stdout).not.toContain("::endgroup::");
    }
  });
});
