import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSourceFile, parseArgs, run, selectFiles, UsageError } from "../src/cli.js";
import { ShellRunner, type CommandRunner } from "../src/runner.js";
import { gitInit, MATH_PACKAGE, project } from "./fixture.js";

function capture() {
  let out = "";
  let err = "";
  return {
    io: { out: (text: string) => void (out += text), err: (text: string) => void (err += text) },
    get out() {
      return out;
    },
    get err() {
      return err;
    }
  };
}

class CountingRunner implements CommandRunner {
  verbose = false;
  calls = 0;
  private readonly shell = new ShellRunner();
  run(command: string, cwd: string, timeout: number | null) {
    this.calls += 1;
    return this.shell.run(command, cwd, timeout);
  }
}

const TEST = ["--no-coverage", "--test-command", "node tests/run.mjs"];

describe("run", () => {
  it("kills, survives, records the snapshot, and leaves the source alone", async () => {
    const root = project(MATH_PACKAGE);
    const source = join(root, "packages/math/src/math.mjs");
    const before = readFileSync(source, "utf8");
    const output = capture();

    const code = await run(["--root", root, ...TEST, source], output.io);

    // `n > 0` -> `n >= 0` survives: no test checks zero. `0 -> 1` survives
    // for the same reason. `*` -> `/` and `2 -> ...` change double(3).
    expect(output.out).toContain("SURVIVED  packages/math/src/math.mjs:2 > -> >=");
    expect(output.out).toContain("SURVIVED  packages/math/src/math.mjs:2 0 -> 1");
    expect(output.out).toContain("KILLED    packages/math/src/math.mjs:5 * -> /");
    expect(code).toBe(3);
    expect(readFileSync(source, "utf8")).toBe(before);

    const snapshot = JSON.parse(readFileSync(join(root, ".metrics/mutate/packages.math.src.math.json"), "utf8"));
    expect(snapshot).toMatchObject({ version: 1, source: "packages/math/src/math.mjs", namespace: "packages.math.src.math" });
    expect(snapshot.forms).toEqual([
      expect.objectContaining({ id: "defn/isPositive", killed: 0, survived: 2, uncovered: 0, sites: 2 }),
      expect.objectContaining({ id: "defn/double", killed: 1, survived: 0, sites: 1 })
    ]);
    expect(Object.values(snapshot.outcomes).sort()).toEqual(["killed", "survived", "survived"]);
  });

  it("reruns only survivors and rewritten functions on the next run", async () => {
    const root = project(MATH_PACKAGE);
    const source = join(root, "packages/math/src/math.mjs");
    await run(["--root", root, ...TEST, source], capture().io);

    const again = new CountingRunner();
    await run(["--root", root, ...TEST, source], capture().io, again);
    // One baseline and the two survivors. The killed mutant is carried forward.
    expect(again.calls).toBe(3);
    const snapshot = JSON.parse(readFileSync(join(root, ".metrics/mutate/packages.math.src.math.json"), "utf8"));
    expect(snapshot.forms[1]).toMatchObject({ id: "defn/double", killed: 1, survived: 0 });

    writeFileSync(source, readFileSync(source, "utf8").replace("n * 2", "n * 2 "));
    const rewritten = new CountingRunner();
    await run(["--root", root, ...TEST, source], capture().io, rewritten);
    expect(rewritten.calls).toBe(4);

    const all = new CountingRunner();
    await run(["--root", root, ...TEST, "--mutate-all", source], capture().io, all);
    expect(all.calls).toBe(4);
  });

  it("exits 0 when every mutant is killed", async () => {
    const root = project({
      ...MATH_PACKAGE,
      "packages/math/tests/run.mjs": `${MATH_PACKAGE["packages/math/tests/run.mjs"]}check(isPositive(0) === false);\ncheck(isPositive(1) === true);\n`
    });
    expect(await run(["--root", root, ...TEST, join(root, "packages/math/src/math.mjs")], capture().io)).toBe(0);
  });

  it("exits 2 and writes nothing when the baseline fails", async () => {
    const root = project(MATH_PACKAGE);
    const output = capture();
    const code = await run(
      ["--root", root, "--no-coverage", "--test-command", "exit 4", join(root, "packages/math/src/math.mjs")],
      output.io
    );
    expect(code).toBe(2);
    expect(output.err).toContain("Baseline failed for packages/math/src/math.mjs");
    expect(existsSync(join(root, ".metrics"))).toBe(false);
  });

  it("counts a mutant that hangs as killed", async () => {
    const root = project({
      "packages/loop/package.json": "{}\n",
      "packages/loop/src/loop.mjs": "export function go() {\n  while (false) {}\n}\n",
      "packages/loop/tests/run.mjs": 'import { go } from "../src/loop.mjs";\ngo();\n'
    });
    const output = capture();
    const code = await run(
      ["--root", root, ...TEST, "--timeout-factor", "1", join(root, "packages/loop/src/loop.mjs")],
      output.io
    );
    expect(output.out).toContain("KILLED    packages/loop/src/loop.mjs:2 false -> true");
    expect(code).toBe(0);
  });

  it("marks sites uncovered when the coverage report misses the file", async () => {
    const root = project({ ...MATH_PACKAGE, "packages/math/coverage/lcov.info": "SF:src/other.mjs\nend_of_record\n" });
    const output = capture();
    const code = await run(
      ["--root", root, "--use-existing-coverage", "--test-command", "node tests/run.mjs", join(root, "packages/math/src/math.mjs")],
      output.io
    );
    expect(code).toBe(0);
    expect(output.err).toContain("No coverage data for packages/math/src/math.mjs");
    expect(output.out).toContain("UNCOVERED packages/math/src/math.mjs:2 > -> >=");
  });

  it("runs only the lines a coverage report hits", async () => {
    const root = project({ ...MATH_PACKAGE, "packages/math/coverage/lcov.info": "SF:src/math.mjs\nDA:5,1\nend_of_record\n" });
    const output = capture();
    const code = await run(
      ["--root", root, "--use-existing-coverage", "--test-command", "node tests/run.mjs", join(root, "packages/math/src/math.mjs")],
      output.io
    );
    expect(code).toBe(0);
    expect(output.out).toContain("KILLED    packages/math/src/math.mjs:5 * -> /");
    expect(output.out).toContain("UNCOVERED packages/math/src/math.mjs:2 > -> >=");
  });

  it("with --base, mutates only functions changed since the base", async () => {
    const root = project(MATH_PACKAGE);
    gitInit(root);
    const source = join(root, "packages/math/src/math.mjs");
    writeFileSync(source, readFileSync(source, "utf8").replace("n * 2", "n * 2 + 0"));
    const output = capture();
    await run(["--root", root, ...TEST, "--base", "HEAD"], output.io);
    expect(output.out).not.toContain("math.mjs:2");
    expect(output.out).toContain("math.mjs:5 * -> /");
    expect(output.out).toContain("math.mjs:5 + -> -");
  });

  it("lists sites with --scan without running anything", async () => {
    const root = project(MATH_PACKAGE);
    const runner = new CountingRunner();
    const output = capture();
    expect(await run(["--root", root, "--scan", join(root, "packages")], output.io, runner)).toBe(0);
    expect(runner.calls).toBe(0);
    expect(output.out).toContain("Scan: 3 mutation sites in packages/math/src/math.mjs");
    expect(output.out).toContain("  packages/math/src/math.mjs:2 > -> >=  [defn/isPositive]");
  });

  it("prints help and rejects bad options", async () => {
    const output = capture();
    expect(await run(["--help"], output.io)).toBe(0);
    expect(output.out).toContain("Usage: nodetool-mutator");
    expect(await run(["--bogus"], capture().io)).toBe(1);
  });
});

describe("parseArgs", () => {
  it("reads options", () => {
    expect(parseArgs(["--base", "origin/main", "--max-workers", "2", "--lines", "3,4", "src"], "/r")).toMatchObject({
      root: "/r",
      base: "origin/main",
      maxWorkers: 2,
      lines: new Set([3, 4]),
      targets: ["src"]
    });
    expect(() => parseArgs(["--max-workers", "0"])).toThrow(UsageError);
    expect(() => parseArgs(["--changed", "--base", "x"])).toThrow(UsageError);
  });
});

describe("selectFiles", () => {
  it("walks sources and skips tests, declarations, and build output", () => {
    const root = project({
      "pkg/src/a.ts": "",
      "pkg/src/a.test.ts": "",
      "pkg/src/b.d.ts": "",
      "pkg/tests/c.ts": "",
      "pkg/dist/d.js": "",
      "pkg/src/__tests__/e.ts": ""
    });
    expect(selectFiles(parseArgs(["--root", root]) as never, root)).toEqual([join(root, "pkg/src/a.ts")]);
    expect(selectFiles(parseArgs(["--root", root, "a.ts"]) as never, root)).toEqual([join(root, "pkg/src/a.ts")]);
    expect(selectFiles(parseArgs(["--root", root, "nomatch"]) as never, root)).toEqual([]);
    expect(selectFiles(parseArgs(["--root", root, "--exclude", "pkg/src"]) as never, root)).toEqual([]);
  });

  it("knows source files", () => {
    expect(isSourceFile("x.ts")).toBe(true);
    expect(isSourceFile("x.spec.tsx")).toBe(false);
    expect(isSourceFile("x.json")).toBe(false);
  });
});
