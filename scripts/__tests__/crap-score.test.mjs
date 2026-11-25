/**
 * The CRAP tool's counting rules, ported from crapper's TypeScript rules.
 * CI thresholds depend on these numbers, so each rule is pinned here.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  analyze,
  coverageCommand,
  crapScore,
  findClangTidy,
  functionsInSource,
  isCppFile,
  isSourceFile,
  loadLcov,
  main,
  parseArgs,
  parseClangTidyComplexity,
  parseLcov,
  percentForSpan,
  selectFiles
} from "../crap-score.mjs";

const byName = (source, path = "src/a.ts") =>
  Object.fromEntries(functionsInSource(source, path).map((fn) => [fn.name, fn]));

describe("crapScore", () => {
  it("is CC² × (1 − coverage)³ + CC", () => {
    expect(crapScore(1, 100)).toBe(1);
    expect(crapScore(5, 0)).toBe(30);
    expect(crapScore(4, 50)).toBe(6);
  });

  it("is null without coverage", () => {
    expect(crapScore(3, null)).toBeNull();
  });
});

describe("complexity", () => {
  it("counts each decision point once", () => {
    const fns = byName(`
      export function f(a: number[], o?: { b?: { c: number } }) {
        if (a.length > 0 && a[0] > 1) { return 1; }
        for (const x of a) { while (x) { break; } }
        for (let i = 0; i < 2; i++) {}
        for (const k in o) {}
        do {} while (false);
        try { g(); } catch { return 2; }
        const v = a.length ? 1 : 2;
        switch (v) { case 1: break; case 2: break; default: break; }
        let w = o?.b?.c ?? 0;
        w ||= 1;
        return a || v;
      }
    `);
    // 1 + if + && + for-of + while + for + for-in + do + catch + ?: + 2 case
    // + default + 2 ?. + ?? + ||= + || = 18
    expect(fns.f.complexity).toBe(18);
  });

  it("counts `?.` once per token, not once per chain link", () => {
    expect(byName("const f = (a: any) => a?.b.c.d;").f.complexity).toBe(2);
    expect(byName("const f = (a: any) => a?.[0]?.();").f.complexity).toBe(3);
  });

  it("keeps nested callbacks inside the enclosing function", () => {
    const fns = byName(`
      function outer(xs: number[]) {
        return xs.map((x) => (x > 0 ? x : -x)).filter(function (x) { return x && true; });
      }
    `);
    expect(Object.keys(fns)).toEqual(["outer"]);
    expect(fns.outer.complexity).toBe(3);
  });
});

describe("entries", () => {
  it("names declarations, arrows, wrapped values, and object members", () => {
    const fns = byName(`
      export default function () { return 1; }
      export function plain() {}
      function overload(a: string): void;
      function overload(a: unknown) { return a; }
      export const arrow = (a: number) => (a ? 1 : 2);
      export const Card = memo(forwardRef((props: any) => props.x ?? null));
      export const api = { get(id: string) { return id || null; }, list: () => [] };
      export const many = [() => 1];
      setTimeout(() => {}, 0);
    `);
    expect(Object.keys(fns)).toEqual([
      "default",
      "plain",
      "overload",
      "arrow",
      "Card",
      "api.get",
      "api.list",
      "many",
      "(anonymous:10)"
    ]);
    expect(fns.Card.complexity).toBe(2);
    expect(fns["api.get"].complexity).toBe(2);
  });

  it("makes every class member with a body an entry", () => {
    const fns = byName(`
      export abstract class Store {
        abstract load(): void;
        private count = 0;
        constructor(private readonly n: number) { if (n) {} }
        get size() { return this.count || 0; }
        set size(v: number) { this.count = v; }
        handle = (e: Event) => e?.target;
        static create() { return class Inner { run() { return 1; } }; }
      }
      const Mixin = class { go() {} };
    `);
    expect(Object.keys(fns)).toEqual([
      "Store.constructor",
      "Store.get size",
      "Store.set size",
      "Store.handle",
      "Store.create",
      "Store.Inner.run",
      "Mixin.go"
    ]);
    expect(fns["Store.constructor"].complexity).toBe(2);
    expect(fns["Store.handle"].complexity).toBe(2);
    // The nested class's methods are their own entries, not part of create.
    expect(fns["Store.create"].complexity).toBe(1);
  });

  it("splits route callbacks out of the function that registers them", () => {
    const fns = byName(`
      export function register(app: any) {
        if (app) {}
        app.get("/users", async (req: any) => (req.q ? 1 : 2));
        app.get("/users", (req: any) => req);
        app.post(\`/items\`, { schema: {} }, function (req: any) { return req && 1; });
        app.route("/things").put((req: any) => req);
        app.use((req: any, res: any, next: any) => next());
        cache.get(key);
      }
    `);
    expect(Object.keys(fns)).toEqual(["register", "GET /users", "GET /users#2", "POST /items", "PUT /things", "USE"]);
    expect(fns.register.complexity).toBe(2);
    expect(fns["GET /users"].complexity).toBe(2);
    expect(fns["POST /items"].complexity).toBe(2);
  });

  it("records the 1-based line span and parses TSX", () => {
    const fns = byName("\nexport const View = () => {\n  return <div>{ok && <span />}</div>;\n};\n", "src/View.tsx");
    expect(fns.View).toMatchObject({ line: 2, endLine: 4, complexity: 2, file: "src/View.tsx" });
  });
});

describe("LCOV", () => {
  const lcov = [
    "TN:",
    "SF:src/a.ts",
    "DA:1,1",
    "DA:2,0",
    "DA:3,4",
    "DA:4,0",
    "BRDA:6,0,0,1",
    "BRDA:6,0,1,0",
    "BRDA:7,1,0,-",
    "end_of_record"
  ].join("\n");

  it("scores by branches when the span has any, otherwise by lines", () => {
    const record = parseLcov(lcov).get("src/a.ts");
    expect(percentForSpan(record, 1, 4)).toBe(50);
    expect(percentForSpan(record, 1, 3)).toBeCloseTo(66.667, 2);
    expect(percentForSpan(record, 5, 8)).toBeCloseTo(33.333, 2);
    expect(percentForSpan(record, 20, 30)).toBe(0);
  });

  describe("on disk", () => {
    let dir;
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("resolves relative SF paths from the folder that holds coverage/", () => {
      dir = mkdtempSync(join(tmpdir(), "crap-"));
      mkdirSync(join(dir, "pkg", "src"), { recursive: true });
      mkdirSync(join(dir, "pkg", "coverage"));
      writeFileSync(join(dir, "pkg", "src", "a.ts"), "export function a(x: number) {\n  return x ? 1 : 2;\n}\n");
      writeFileSync(join(dir, "pkg", "package.json"), "{}");
      writeFileSync(join(dir, "pkg", "coverage", "lcov.info"), "SF:src/a.ts\nDA:1,1\nDA:2,1\nBRDA:2,0,0,1\nBRDA:2,0,1,0\nend_of_record\n");

      const coverage = loadLcov([join(dir, "pkg", "coverage", "lcov.info")], dir);
      const files = selectFiles({ ...parseArgs([]), root: dir });
      expect(files).toEqual([join(dir, "pkg", "src", "a.ts")]);
      const [entry] = analyze(files, dir, coverage);
      // CC 2 at 50% branch coverage: 4 × 0.125 + 2.
      expect(entry).toMatchObject({ name: "a", file: "pkg/src/a.ts", complexity: 2, coverage: 50, crap: 2.5 });
    });

    it("unions reports that cover the same file", () => {
      dir = mkdtempSync(join(tmpdir(), "crap-"));
      mkdirSync(join(dir, "pkg", "src"), { recursive: true });
      mkdirSync(join(dir, "pkg", "coverage"));
      mkdirSync(join(dir, "other", "coverage"), { recursive: true });
      writeFileSync(join(dir, "pkg", "src", "a.ts"), "export function a(x: number) {\n  return x ? 1 : 2;\n}\n");
      writeFileSync(join(dir, "pkg", "package.json"), "{}");
      // Each run takes a different branch, and the second run misses line 1.
      writeFileSync(join(dir, "pkg", "coverage", "lcov.info"), "SF:src/a.ts\nDA:1,1\nDA:2,1\nBRDA:2,0,0,1\nBRDA:2,0,1,0\nend_of_record\n");
      writeFileSync(
        join(dir, "other", "coverage", "lcov.info"),
        "SF:../pkg/src/a.ts\nDA:1,0\nDA:2,1\nBRDA:2,0,0,0\nBRDA:2,0,1,3\nend_of_record\n"
      );

      const coverage = loadLcov(
        [join(dir, "pkg", "coverage", "lcov.info"), join(dir, "other", "coverage", "lcov.info")],
        dir
      );
      const record = coverage.get(join(dir, "pkg", "src", "a.ts"));
      expect(percentForSpan(record, 2, 2)).toBe(100);
      expect(percentForSpan(record, 1, 1)).toBe(100);
    });

    it("scores a file missing from the report at 0% and fails the threshold", () => {
      dir = mkdtempSync(join(tmpdir(), "crap-"));
      writeFileSync(join(dir, "b.ts"), "export const b = (x: number) => (x > 1 && x < 5 ? 1 : 2);\n");
      writeFileSync(join(dir, "b.test.ts"), "export const ignored = () => (1 ? 2 : 3);\n");
      const [entry] = analyze(selectFiles({ ...parseArgs([]), root: dir }), dir, new Map());
      expect(entry).toMatchObject({ name: "b", complexity: 3, coverage: 0, crap: 12 });

      const stderr = process.stderr.write;
      const stdout = process.stdout.write;
      process.stderr.write = () => true;
      process.stdout.write = () => true;
      try {
        expect(main(["--root", dir, "--threshold", "11"])).toBe(2);
        expect(main(["--root", dir, "--threshold", "12"])).toBe(0);
        expect(main(["--root", dir, "--no-coverage", "--threshold", "1"])).toBe(0);
      } finally {
        process.stderr.write = stderr;
        process.stdout.write = stdout;
      }
    });
  });
});

describe("coverageCommand", () => {
  let dir;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("asks Vitest for a report even when a related test fails", () => {
    dir = mkdtempSync(join(tmpdir(), "crap-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const [, args] = coverageCommand(dir, ["src/a.ts"]);
    expect(args).toContain("--coverage.reportOnFailure");
  });
});

describe("parseArgs", () => {
  it("reads options and rejects bad ones", () => {
    expect(
      parseArgs([
        "--base",
        "origin/main",
        "--build",
        "native/timeline/build-sanitize",
        "--clang-tidy",
        "/usr/bin/clang-tidy",
        "--extra-arg",
        "-DFOO=1",
        "--extra-arg",
        "-DBAR=2",
        "--threshold",
        "30",
        "--top",
        "5",
        "--json",
        "src"
      ])
    ).toMatchObject({
      base: "origin/main",
      build: "native/timeline/build-sanitize",
      clangTidy: "/usr/bin/clang-tidy",
      extraArgs: ["-DFOO=1", "-DBAR=2"],
      changed: true,
      threshold: 30,
      top: 5,
      json: true,
      positionals: ["src"]
    });
    expect(() => parseArgs(["--threshold", "x"])).toThrow("--threshold requires a number");
    expect(() => parseArgs(["--lcov"])).toThrow("--lcov requires a value");
    expect(() => parseArgs(["--build"])).toThrow("--build requires a value");
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown option: --bogus");
    expect(() => parseArgs(["--no-coverage", "--run-coverage"])).toThrow();
  });
});

describe("C/C++ clang-tidy CRAP", () => {
  it("recognizes C/C++ source files and skips C/C++ test files", () => {
    expect(isCppFile("native/realtime/src/dsp.cpp")).toBe(true);
    expect(isSourceFile("native/realtime/src/dsp.cpp")).toBe(true);
    expect(isSourceFile("native/realtime/src/dsp_test.cpp")).toBe(false);
    expect(isSourceFile("native/realtime/src/test_dsp.cpp")).toBe(false);
    expect(isSourceFile("native/realtime/src/dsp_tests.cc")).toBe(false);
  });

  it("parses readability-function-size warnings into CC = branches + 1 and line spans", () => {
    const root = "/repo";
    const output = [
      "/repo/native/a.cpp:2:5: warning: function 'simple' exceeds recommended size/complexity thresholds [readability-function-size]",
      "/repo/native/a.cpp:2:5: note: 1 statements (threshold 0)",
      "/repo/native/a.cpp:5:5: warning: function 'branchy' exceeds recommended size/complexity thresholds [readability-function-size]",
      "/repo/native/a.cpp:5:5: note: 7 lines including whitespace and comments (threshold 0)",
      "/repo/native/a.cpp:5:5: note: 3 branches (threshold 0)",
      // Template instantiation duplicate at the same line keeps max values.
      "/repo/native/a.cpp:5:5: warning: function 'branchy' exceeds recommended size/complexity thresholds [readability-function-size]",
      "/repo/native/a.cpp:5:5: note: 7 lines including whitespace and comments (threshold 0)",
      "/repo/native/a.cpp:5:5: note: 3 branches (threshold 0)",
      // Overloaded function in the same file gets disambiguated.
      "/repo/native/a.cpp:20:5: warning: function 'simple' exceeds recommended size/complexity thresholds [readability-function-size]",
      "/repo/native/a.cpp:20:5: note: 3 lines including whitespace and comments (threshold 0)",
      "/repo/native/a.cpp:20:5: note: 1 branches (threshold 0)",
      // Header outside allowedFiles is ignored.
      "/repo/native/a.h:10:5: warning: function 'helper' exceeds recommended size/complexity thresholds [readability-function-size]",
      "/repo/native/a.h:10:5: note: 2 branches (threshold 0)"
    ].join("\n");

    const allowed = new Set(["/repo/native/a.cpp"]);
    const fns = parseClangTidyComplexity(output, root, allowed);
    expect(fns).toEqual([
      { name: "simple", file: "native/a.cpp", absFile: "/repo/native/a.cpp", line: 2, endLine: 2, complexity: 1 },
      { name: "branchy", file: "native/a.cpp", absFile: "/repo/native/a.cpp", line: 5, endLine: 12, complexity: 4 },
      { name: "simple#2", file: "native/a.cpp", absFile: "/repo/native/a.cpp", line: 20, endLine: 23, complexity: 2 }
    ]);
  });

  const clangTidy = findClangTidy();
  describe.skipIf(!clangTidy)("with real clang-tidy", () => {
    let dir;
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("scores C++ functions with LCOV coverage", () => {
      dir = mkdtempSync(join(tmpdir(), "crap-cpp-"));
      mkdirSync(join(dir, "src"), { recursive: true });
      const cppPath = join(dir, "src", "calc.cpp");
      writeFileSync(
        cppPath,
        [
          "int simple(int x) { return x + 1; }",
          "int branchy(int a, int b) {",
          "  if (a > 0) {",
          "    for (int i = 0; i < a; ++i) {",
          "      if (i == b) return i;",
          "    }",
          "  }",
          "  return b;",
          "}"
        ].join("\n") + "\n"
      );
      const lcovPath = join(dir, "lcov.info");
      writeFileSync(
        lcovPath,
        [
          `SF:${cppPath}`,
          "DA:1,1",
          "DA:2,1",
          "DA:3,1",
          "DA:4,0",
          "DA:5,0",
          "DA:8,1",
          "end_of_record"
        ].join("\n") + "\n"
      );

      const coverage = loadLcov([lcovPath], dir);
      const files = selectFiles({ ...parseArgs([]), root: dir });
      expect(files).toEqual([cppPath]);
      const entries = analyze(files, dir, coverage, { clangTidy });
      const branchy = entries.find((entry) => entry.name === "branchy");
      const simple = entries.find((entry) => entry.name === "simple");
      // branchy: 3 branches -> CC 4; 3 of 5 lines covered -> 60% -> 16 * 0.4^3 + 4 = 5.024
      expect(branchy).toMatchObject({ file: "src/calc.cpp", line: 2, complexity: 4, coverage: 60, crap: 5.024 });
      expect(simple).toMatchObject({ file: "src/calc.cpp", line: 1, complexity: 1, coverage: 100, crap: 1 });
    });
  });
});
