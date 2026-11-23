/**
 * The pure parts of scripts/native-lint.mjs: which lines a diff changed,
 * which translation units cover the changed files, and which findings fail
 * the run.
 */
import { describe, expect, it } from "vitest";

import {
  classify,
  headerFilter,
  isLintable,
  parseDiagnostics,
  parseDiff,
  parseNinjaDeps,
  selectUnits
} from "../native-lint.mjs";

const ROOT = "/repo";

describe("parseDiff", () => {
  it("records added line ranges on the new side and skips deletions", () => {
    const patch = [
      "diff --git a/native/a/src/x.cpp b/native/a/src/x.cpp",
      "--- a/native/a/src/x.cpp",
      "+++ b/native/a/src/x.cpp",
      "@@ -10,0 +11,3 @@ void f()",
      "@@ -20 +23 @@",
      "@@ -30,2 +32,0 @@",
      "diff --git a/native/a/src/gone.h b/native/a/src/gone.h",
      "--- a/native/a/src/gone.h",
      "+++ /dev/null",
      "@@ -1,4 +0,0 @@"
    ].join("\n");
    expect([...parseDiff(patch)]).toEqual([["native/a/src/x.cpp", [[11, 13], [23, 23]]]]);
  });
});

describe("parseDiagnostics", () => {
  it("reads clang-tidy, clazy and compiler diagnostics", () => {
    const output = [
      "src/a.cpp:3:5: warning: leak [clang-analyzer-cplusplus.NewDeleteLeaks]",
      "/abs/b.h:7:1: warning: Pass a context object [-Wclazy-connect-3arg-lambda]",
      "src/a.cpp:9:2: warning: unused variable [-Wunused-variable]",
      "src/a.cpp:4:1: error: use of undeclared identifier 'x' [clang-diagnostic-error]",
      "src/a.cpp:5:1: warning: two names [bugprone-x,cert-y]",
      "src/a.cpp:3:5: note: allocated here"
    ].join("\n");
    expect(parseDiagnostics(output, ROOT).map((d) => [d.file, d.line, d.severity, d.check])).toEqual([
      ["/repo/src/a.cpp", 3, "warning", "clang-analyzer-cplusplus.NewDeleteLeaks"],
      ["/abs/b.h", 7, "warning", "clazy-connect-3arg-lambda"],
      ["/repo/src/a.cpp", 9, "warning", "clang-diagnostic-unused-variable"],
      ["/repo/src/a.cpp", 4, "error", "clang-diagnostic-error"],
      ["/repo/src/a.cpp", 5, "warning", "bugprone-x"]
    ]);
  });
});

describe("classify", () => {
  const changed = new Map([["native/a/x.cpp", [[10, 12]]]]);
  const d = (file, line, check, severity = "warning") => ({
    file: `${ROOT}/${file}`,
    line,
    column: 1,
    severity,
    message: "m",
    check
  });

  it("fails only on changed lines and keeps the rest of a changed file as context", () => {
    const result = classify(
      [
        d("native/a/x.cpp", 11, "bugprone-use-after-move"),
        d("native/a/x.cpp", 11, "bugprone-use-after-move"),
        d("native/a/x.cpp", 40, "cppcoreguidelines-owning-memory"),
        d("native/a/other.cpp", 11, "bugprone-use-after-move"),
        d("native/a/x.cpp", 10, "clang-diagnostic-unused-variable"),
        d("native/a/x.cpp", 12, "clang-diagnostic-error", "error")
      ],
      changed,
      ROOT
    );
    expect(result.blocking.map((e) => [e.line, e.check])).toEqual([[11, "bugprone-use-after-move"]]);
    expect(result.context.map((e) => e.line)).toEqual([40]);
    expect(result.errors.map((e) => e.check)).toEqual(["clang-diagnostic-error"]);
  });
});

describe("selectUnits", () => {
  const entries = [
    { directory: "/repo/build", file: "/repo/native/a/src/x.cpp", output: "obj/x.o" },
    { directory: "/repo/build", file: "/repo/native/a/src/y.cpp", output: "obj/y.o" }
  ];

  it("covers a source, a header by its sibling, and a header by an includer", () => {
    const includers = parseNinjaDeps(
      ["obj/y.o: #deps 2, deps mtime 1 (VALID)", "    /repo/native/a/src/y.cpp", "    ../native/a/inc/shared.h", ""].join(
        "\n"
      ),
      "/repo/build"
    );
    const { units, uncovered } = selectUnits({
      files: ["native/a/src/x.cpp", "native/a/src/x.h", "native/a/inc/shared.h", "native/a/inc/orphan.h", "native/a/src/new.cpp"],
      entries,
      root: ROOT,
      includers
    });
    expect(units.map((u) => u.file)).toEqual(["/repo/native/a/src/x.cpp", "/repo/native/a/src/y.cpp"]);
    expect(uncovered).toEqual(["native/a/inc/orphan.h"]);
  });
});

describe("headerFilter", () => {
  it("matches exactly the changed headers, or nothing", () => {
    const filter = new RegExp(headerFilter(["native/a/x.cpp", "native/a/x+y.h"], ROOT));
    expect(filter.test("/repo/native/a/x+y.h")).toBe(true);
    expect(filter.test("/repo/native/a/xy.h")).toBe(false);
    expect(headerFilter(["native/a/x.cpp"], ROOT)).toBe("^$");
  });
});

describe("isLintable", () => {
  it("keeps native C++ and skips vendored, generated and other files", () => {
    expect(isLintable("native/timeline/src/a.cpp")).toBe(true);
    expect(isLintable("native/timeline/src/a.h")).toBe(true);
    expect(isLintable("native/graph-runner/third_party/q/q.c")).toBe(false);
    expect(isLintable("native/timeline/build-sanitize/moc_a.cpp")).toBe(false);
    expect(isLintable("native/timeline/qml/A.qml")).toBe(false);
    expect(isLintable("packages/x/a.cpp")).toBe(false);
  });
});
