import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A temporary project with files at the given relative paths. */
export function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mutator-")));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

export function gitInit(root: string): void {
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
}

/**
 * A package whose test script imports the source through a relative import
 * from a test directory, so a worker must resolve it to its own copy.
 */
export const MATH_PACKAGE = {
  "packages/math/package.json": '{ "name": "math", "type": "module" }\n',
  "packages/math/src/math.mjs": [
    "export function isPositive(n) {",
    "  return n > 0;",
    "}",
    "export function double(n) {",
    "  return n * 2;",
    "}",
    ""
  ].join("\n"),
  "packages/math/tests/run.mjs": [
    'import { isPositive, double } from "../src/math.mjs";',
    "const check = (ok) => { if (!ok) process.exit(1); };",
    "check(isPositive(5) === true);",
    "check(isPositive(-5) === false);",
    "check(double(3) === 6);",
    ""
  ].join("\n")
};
