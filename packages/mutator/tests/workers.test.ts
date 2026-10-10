import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorker, mappedPath, workerCount } from "../src/workers.js";
import { MATH_PACKAGE, project } from "./fixture.js";

describe("createWorker", () => {
  it("copies the package, links its heavy directories, and links every sibling", () => {
    const root = project({
      ...MATH_PACKAGE,
      "packages/other/index.mjs": "",
      "packages/math/node_modules/dep/index.js": "",
      "scripts/tool.mjs": "",
      "target/old": ""
    });
    mkdirSync(join(root, ".git"));
    const worker = join(root, "target/mutation-workers/run-x/worker-0");
    createWorker(worker, root, "packages/math");

    expect(lstatSync(join(worker, "scripts")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(worker, "packages/other")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(worker, "packages")).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(worker, "packages/math/src/math.mjs")).isFile()).toBe(true);
    expect(lstatSync(join(worker, "packages/math/tests/run.mjs")).isFile()).toBe(true);
    expect(lstatSync(join(worker, "packages/math/node_modules")).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(worker, "packages/math/node_modules"))).toBe(join(root, "packages/math/node_modules"));
    expect(() => lstatSync(join(worker, "target"))).toThrow();
    expect(() => lstatSync(join(worker, ".git"))).toThrow();
    expect(readFileSync(join(worker, "packages/math/src/math.mjs"), "utf8")).toBe(MATH_PACKAGE["packages/math/src/math.mjs"]);
  });

  it("refuses the project root itself", () => {
    const root = project({ "package.json": "{}" });
    expect(() => createWorker(join(root, "w"), root, "")).toThrow();
  });
});

describe("workerCount", () => {
  it("is the smallest of sites, cores, and the cap", () => {
    expect(workerCount(10, null, 4)).toBe(4);
    expect(workerCount(2, null, 4)).toBe(2);
    expect(workerCount(10, 3, 8)).toBe(3);
    expect(workerCount(0, null, 4)).toBe(1);
  });
});

describe("mappedPath", () => {
  it("maps a real path into the worker", () => {
    expect(mappedPath("/w", "/root", "/root/packages/a/src/x.ts")).toBe("/w/packages/a/src/x.ts");
  });
});
