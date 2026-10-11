/** Locate packages, their test commands, and their coverage reports. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export function toPosix(path: string): string {
  return path.split("\\").join("/");
}

export function relativeKey(root: string, path: string): string {
  return toPosix(relative(resolve(root), resolve(path)));
}

/** The nearest directory at or above `file` that holds a package.json. */
export function packageDirOf(file: string, root: string): string {
  const top = resolve(root);
  let directory = dirname(resolve(file));
  while (directory.startsWith(top)) {
    if (existsSync(join(directory, "package.json"))) {
      return directory;
    }
    if (directory === top) {
      break;
    }
    directory = dirname(directory);
  }
  return top;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

function readPackage(directory: string): PackageJson {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as PackageJson;
  } catch {
    return {};
  }
}

export function usesVitest(directory: string): boolean {
  const test = readPackage(directory).scripts?.test ?? "";
  if (/vitest/.test(test)) {
    return true;
  }
  return ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"].some((name) =>
    existsSync(join(directory, name))
  );
}

export function hasScript(directory: string, name: string): boolean {
  return typeof readPackage(directory).scripts?.[name] === "string";
}

/** POSIX single-quote a shell argument. */
export function quote(value: string): string {
  return /^[\w./@:=+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The default test command for a package. unclebob/mutator runs `npm test`.
 * A Vitest package runs only the tests whose import graph reaches the mutated
 * file, which is the same verdict at a fraction of a full suite's cost.
 */
export function defaultTestCommand(packageDir: string): string {
  if (usesVitest(packageDir)) {
    return "npx --no-install vitest related --run --passWithNoTests {file}";
  }
  return "npm test";
}

/** `{file}` is the mutated file relative to the command's directory. */
export function expandCommand(command: string, file: string, cwd: string): string {
  return command.replace(/\{file\}/g, quote(toPosix(relative(cwd, file))));
}
