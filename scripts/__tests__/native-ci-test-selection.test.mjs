/**
 * The CI decision of scripts/native-ci-test-selection.mjs: which ctest tests
 * a native pull request job runs, given the selection of
 * `npm run test:affected:native`.
 */
import { describe, expect, it } from "vitest";

import { decide } from "../native-ci-test-selection.mjs";

const TESTS = [
  { name: "tst_core", labels: [] },
  { name: "tst_render", labels: ["render"] },
  { name: "tst_ui", labels: ["window"] }
];
const some = (...names) => ({ all: false, reason: null, selected: names.map((test) => ({ test })), notes: [] });
const FORCE = [".github/workflows/native-timeline.yml", "packages/"];

describe("decide", () => {
  it("runs a ctest filter of the selected tests and reports their labels", () => {
    const decision = decide({
      files: ["native/timeline/src/a.cpp"],
      force: FORCE,
      selection: some("tst_render", "tst_core"),
      tests: TESTS,
      labels: ["render"]
    });
    expect(decision).toMatchObject({ run: true, filter: "^(tst_core|tst_render)$", render: true, others: true });
    expect(decision.reason).toBe("2 of 3 tests depend on the changed files");
  });

  it("reports when no selected test has the label, or only labelled ones are selected", () => {
    const args = { files: ["native/timeline/src/a.cpp"], tests: TESTS, labels: ["render"] };
    expect(decide({ ...args, selection: some("tst_core") })).toMatchObject({ render: false, others: true });
    expect(decide({ ...args, selection: some("tst_render") })).toMatchObject({ render: true, others: false });
  });

  it("runs nothing when no test depends on the changed files", () => {
    const decision = decide({ files: ["native/timeline/README.md"], selection: some(), tests: TESTS, labels: ["render"] });
    expect(decision).toMatchObject({ run: false, filter: "", render: false, others: false });
  });

  it.each([
    ["no base commit", { files: null, selection: null }, "no base commit"],
    ["a forced path", { files: ["packages/timeline/src/x.ts"], selection: some() }, "packages/timeline/src/x.ts changed"],
    ["the workflow", { files: [".github/workflows/native-timeline.yml"], selection: some() }, "native-timeline.yml changed"],
    ["a whole-project selection", { files: ["native/timeline/CMakeLists.txt"], selection: { all: true, reason: "x: CMake" } }, "x: CMake"],
    ["a failed selection", { files: ["native/timeline/a.cpp"], selection: null, error: "boom" }, "selection failed (boom)"]
  ])("runs every test for %s", (_, input, reason) => {
    const decision = decide({ force: FORCE, tests: TESTS, labels: ["render"], ...input });
    expect(decision).toMatchObject({ run: true, filter: "", render: true, others: true });
    expect(decision.reason).toContain(reason);
  });

  it("does not treat a path that only shares a prefix's text as forced", () => {
    const decision = decide({
      files: ["native/timeline/packages/x.cpp"],
      force: FORCE,
      selection: some("tst_core"),
      tests: TESTS
    });
    expect(decision.filter).toBe("^(tst_core)$");
  });
});
