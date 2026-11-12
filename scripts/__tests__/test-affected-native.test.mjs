/**
 * Selection rules for `npm run test:affected:native`. The fixture in
 * fixtures/test-affected-native/ is a synthetic graph-runner build: a File API
 * reply, Makefile depfiles, a custom target's rule file and a ctest listing.
 * `@ROOT@` and `@BUILD@` are replaced with temporary paths before each case.
 *
 *   gr_util <- gr_core <- gr_core_tests, gr_ctx_tests (+ gr_bundle), nodetool-graph-runner
 *   gr_standalone_tests stands alone
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildModel,
  configureCommand,
  ctestRegex,
  GUEST_INPUTS,
  diskReaders,
  executionPlan,
  parseMakeDepfile,
  parseNinjaDeps,
  planProjects,
  planStatus,
  producersOf,
  readCache,
  readDepfiles,
  readFileApi,
  resolveBuildDir,
  runPlans,
  selectTests,
  targetOfObject
} from "../test-affected-native.mjs";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "test-affected-native");
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile());
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Copy the fixture, fill in its paths, and build the model. */
function setup({ drop = [], unbuilt = [], config } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "native-affected-"));
  temporary.push(tmp);
  const root = join(tmp, "repo");
  const build = join(tmp, "out");
  const fill = (text) => text.replaceAll("@ROOT@", root).replaceAll("@BUILD@", build);
  cpSync(join(FIXTURE, "out"), build, { recursive: true });
  for (const path of filesUnder(build)) writeFileSync(path, fill(readFileSync(path, "utf8")));
  for (const path of drop) rmSync(join(build, path));
  const source = join(root, "native", "graph-runner");
  write(join(source, "unittests", "verify.mjs"), 'import { run } from "./helper.mjs";\nrun(process.argv[2]);\n');
  write(join(source, "unittests", "helper.mjs"), 'export const run = () => spawnSync(join(dir, "nodetool-graph-runner"));\n');
  write(join(source, "cmake", "compare.cmake"), "execute_process(COMMAND ${PROBE})\n");
  write(join(root, "packages", "timeline", "fonts", "a.ttf"), "font");
  const ctest = JSON.parse(fill(readFileSync(join(FIXTURE, "ctest.json"), "utf8")));
  // ctest omits the command of a test whose executable was never built.
  for (const name of unbuilt) ctest.tests.push({ name });
  const cache = readCache(build);
  const api = readFileApi(build);
  const model = buildModel({
    name: "graph-runner",
    root,
    buildDir: build,
    ctest,
    api,
    depfiles: readDepfiles(build, cache),
    cache,
    producers: producersOf([join(build, "ctx-test.mjs")], api.targets, build, cache),
    fs: diskReaders(),
    config
  });
  return { model, root, build };
}

const names = (selection) => selection.selected.map((s) => s.test).sort();
const select = (files, options) => selectTests(setup().model, files, options);
const ALL = [
  "gr_compare_tests",
  "gr_core_tests",
  "gr_ctx_tests",
  "gr_fonts_tests",
  "gr_library_tests",
  "gr_standalone_tests",
  "gr_verify_tests"
];

describe("selectTests", () => {
  it("selects an executable test when one of its sources changed", () => {
    const selection = select(["native/graph-runner/unittests/core_test.cpp"]);
    expect(names(selection)).toEqual(["gr_core_tests", "gr_library_tests"]);
    expect(selection.selected[0]).toMatchObject({
      trigger: "native/graph-runner/unittests/core_test.cpp",
      why: "compiled into gr_core_tests"
    });
    expect(selection.leftOut).toBe(5);
  });

  it("selects through a header that only a depfile names", () => {
    expect(names(select(["native/graph-runner/unittests/standalone.h"]))).toEqual([
      "gr_compare_tests",
      "gr_fonts_tests",
      "gr_standalone_tests",
      "gr_verify_tests"
    ]);
  });

  it.each(["native/graph-runner/src/util.cpp", "native/graph-runner/src/util.h"])(
    "selects every test that links the library %s is part of, transitively",
    (file) => {
      expect(names(select([file]))).toEqual(["gr_core_tests", "gr_ctx_tests", "gr_library_tests", "gr_verify_tests"]);
    }
  );

  it("follows a node script's imports and the executable it names", () => {
    const selection = select(["native/graph-runner/unittests/helper.mjs"]);
    expect(names(selection)).toEqual(["gr_ctx_tests", "gr_verify_tests"]);
    expect(selection.selected.find((s) => s.test === "gr_verify_tests").why).toBe("script or argument of the test");
    // helper.mjs spawns nodetool-graph-runner, so the CLI's sources count.
    expect(names(select(["native/graph-runner/src/main.cpp"]))).toEqual(["gr_verify_tests"]);
  });

  it("maps a cmake -P script and a directory argument to the tests that use them", () => {
    expect(names(select(["native/graph-runner/cmake/compare.cmake"]))).toEqual(["gr_compare_tests"]);
    expect(names(select(["packages/timeline/fonts/a.ttf"]))).toEqual(["gr_fonts_tests"]);
  });

  it.each(["native/graph-runner/guest/entry.mjs", "packages/base-nodes/src/index.ts"])(
    "selects the tests that load the guest bundle or a test bundle for %s",
    (file) => {
      const { model } = setup();
      const selection = selectTests(model, [file]);
      expect(names(selection)).toEqual(["gr_ctx_tests", "gr_library_tests"]);
      const plan = executionPlan(model, selection);
      expect(plan.prepare).toEqual(["guest bundle"]);
      expect(plan.targets).toEqual(["gr_bundle", "gr_core_tests", "gr_ctx_tests"]);
    }
  );

  it("prepares the guest bundle for tests that link a target compiled with its path", () => {
    const config = {
      prepare: [{ cacheVar: "NODETOOL_GUEST_BUNDLE", label: "guest bundle", script: "x.mjs", linkedTarget: "gr_core" }],
      bundleInputs: GUEST_INPUTS
    };
    const { model } = setup({ config });
    const selection = selectTests(model, ["native/graph-runner/guest/entry.mjs"]);
    expect(names(selection)).toEqual(["gr_core_tests", "gr_ctx_tests", "gr_library_tests", "gr_verify_tests"]);
    expect(executionPlan(model, selection).prepare).toEqual(["guest bundle"]);
    const standalone = model.tests.find((t) => t.name === "gr_standalone_tests");
    expect(standalone.prepare).toEqual([]);
    expect(standalone.guest).toBe(false);
  });

  it("leaves package tests out of the guest bundle's inputs", () => {
    expect(names(select(["packages/base-nodes/tests/index.test.ts"]))).toEqual([]);
  });

  it.each([
    ["native/graph-runner/CMakeLists.txt", "CMake read it while configuring"],
    ["native/graph-runner/cmake/deps.cmake", "CMake read it while configuring"],
    ["native/graph-runner/cmake/stage.cmake", "CMake build file of the project"],
    ["native/graph-runner/CMakePresets.json", "CMake build file of the project"]
  ])("selects every test when %s changed", (file, why) => {
    const selection = select([file]);
    expect(selection.all).toBe(true);
    expect(selection.reason).toBe(`${file}: ${why}`);
    expect(names(selection)).toEqual(ALL);
  });

  it.each(["native/graph-runner/src/new_feature.cpp", "native/graph-runner/src/new_feature.h"])(
    "selects every test for %s, which no target compiles",
    (file) => {
      const selection = select([file]);
      expect(selection.all).toBe(true);
      expect(selection.reason).toContain("compiled by no target");
      expect(names(selection)).toEqual(ALL);
    }
  );

  it("selects every test for an unknown file under the project", () => {
    const selection = select(["native/graph-runner/unittests/fixtures/input.json"]);
    expect(selection.all).toBe(true);
    expect(selection.reason).toContain("maps to no test input");
  });

  it("treats an unknown file under a shared directory as the project's own", () => {
    const file = "native/ui_primitives/qml/Button.qml";
    expect(select([file]).selected).toEqual([]);
    const { model } = setup({ config: { prepare: [], bundleInputs: [], sharedDirs: ["native/ui_primitives"] } });
    const selection = selectTests(model, [file]);
    expect(selection.all).toBe(true);
    expect(selection.reason).toBe(`${file}: file under the project that maps to no test input`);
  });

  it("selects nothing for documentation", () => {
    const selection = select(["native/graph-runner/README.md", "native/graph-runner/guest/host/README.md", "docs/cli.md"]);
    expect(selection.selected).toEqual([]);
    expect(selection.notes).toEqual([]);
    expect(selection.all).toBe(false);
  });

  it("reports a compiled file that no test runs", () => {
    const { model } = setup();
    const ownTests = model.tests.filter((t) => t.name !== "gr_verify_tests");
    const selection = selectTests({ ...model, tests: ownTests }, ["native/graph-runner/src/main.cpp"]);
    expect(selection.selected).toEqual([]);
    expect(selection.notes).toEqual([
      { file: "native/graph-runner/src/main.cpp", note: "compiled only into nodetool-graph-runner, which no test runs" }
    ]);
  });

  it("selects every test for a C++ change when the build has no depfiles", () => {
    const { model } = setup({
      drop: [
        "CMakeFiles/gr_util.dir/src/util.cpp.o.d",
        "CMakeFiles/gr_core.dir/src/core.cpp.o.d",
        "CMakeFiles/gr_core_tests.dir/unittests/core_test.cpp.o.d",
        "CMakeFiles/gr_ctx_tests.dir/unittests/ctx_test.cpp.o.d",
        "CMakeFiles/gr_standalone_tests.dir/unittests/standalone.cpp.o.d",
        "CMakeFiles/nodetool-graph-runner.dir/src/main.cpp.o.d"
      ]
    });
    const selection = selectTests(model, ["native/graph-runner/src/core.cpp"]);
    expect(selection.all).toBe(true);
    expect(selection.reason).toContain("no compiler depfiles");
  });

  it("selects a target's tests for any header when that target has no depfiles", () => {
    const { model } = setup({ drop: ["CMakeFiles/gr_standalone_tests.dir/unittests/standalone.cpp.o.d"] });
    const selection = selectTests(model, ["native/graph-runner/src/core.h"]);
    expect(names(selection)).toEqual(ALL);
    expect(selection.all).toBe(false);
    expect(selection.selected.find((s) => s.test === "gr_standalone_tests").why).toBe(
      "gr_standalone_tests has no depfiles (not built yet)"
    );
  });

  it("builds every target when a selected test was never built", () => {
    const { model } = setup({ unbuilt: ["gr_new_tests"] });
    const selection = selectTests(model, ["native/graph-runner/unittests/core_test.cpp"]);
    expect(names(selection)).toContain("gr_new_tests");
    const plan = executionPlan(model, selection);
    expect(plan.buildAll).toBe(true);
    expect(plan.untraced).toEqual(["gr_new_tests"]);
  });

  it("builds only the traced targets when every selected test was built", () => {
    const { model } = setup();
    const plan = executionPlan(model, selectTests(model, ["native/graph-runner/unittests/core_test.cpp"]));
    expect(plan.buildAll).toBe(false);
    expect(plan.untraced).toEqual([]);
  });

  it("selects every test with --all", () => {
    expect(names(select([], { all: true }))).toEqual(ALL);
  });
});

describe("planProjects", () => {
  it("fails a run, not a dry run, for a changed project without a build", () => {
    const tmp = mkdtempSync(join(tmpdir(), "native-affected-"));
    temporary.push(tmp);
    const plans = planProjects({
      names: ["demo", "graph-runner"],
      files: ["native/demo/src/app.cpp", "native/graph-runner/README.md"],
      builds: { demo: join(tmp, "missing"), "graph-runner": join(tmp, "also-missing") },
      root: tmp,
      load: () => {
        throw new Error("an unconfigured project has no model");
      }
    });
    expect(plans).toEqual([
      {
        name: "demo",
        status: "unconfigured",
        buildDir: join(tmp, "missing"),
        reason: `no CMakeCache.txt in ${join(tmp, "missing")} (--build)`,
        configure: "cmake -S native/demo -B native/demo/build"
      }
    ]);
    expect(planStatus(plans, { dryRun: false })).toBe(1);
    expect(planStatus(plans, { dryRun: true })).toBe(0);
  });

  it("checks a project with no changes of its own without reconfiguring it", () => {
    const { root, build } = setup();
    mkdirSync(join(root, "native", "graph-runner"), { recursive: true });
    const calls = [];
    const plans = planProjects({
      names: ["graph-runner"],
      files: ["packages/base-nodes/src/index.ts"],
      builds: { "graph-runner": build },
      root,
      load: (name, dir, cache, options) => {
        calls.push(options);
        return null;
      }
    });
    expect(calls).toEqual([{ refresh: false }]);
    expect(plans).toEqual([]);
  });

  it("treats a changed file of a project it depends on as its own", () => {
    const tmp = mkdtempSync(join(tmpdir(), "native-affected-"));
    temporary.push(tmp);
    const plans = planProjects({
      names: ["chat", "graph-runner", "node-editor"],
      files: ["native/jobs/src/job_core.cpp"],
      builds: { chat: join(tmp, "chat"), "graph-runner": join(tmp, "runner"), "node-editor": join(tmp, "editor") },
      root: tmp,
      load: () => {
        throw new Error("an unconfigured project has no model");
      }
    });
    expect(plans.map((plan) => [plan.name, plan.status])).toEqual([
      ["graph-runner", "unconfigured"],
      ["node-editor", "unconfigured"]
    ]);
  });

  it("refreshes a configured project's model when a project it depends on changed", () => {
    const { root, build } = setup();
    mkdirSync(join(root, "native", "graph-runner"), { recursive: true });
    const calls = [];
    planProjects({
      names: ["graph-runner"],
      files: ["native/jobs/include/nodetool/jobs/job_core.h"],
      builds: { "graph-runner": build },
      root,
      load: (name, dir, cache, options) => {
        calls.push(options);
        return null;
      }
    });
    expect(calls).toEqual([{ refresh: true }]);
  });

  it("runs the remaining projects after one fails and reports every failure", () => {
    const selected = (name) => ({ name, status: "selected", selection: { selected: [{ test: `${name}_t` }] } });
    const plans = [
      selected("graph-runner"),
      { name: "chat", status: "selected", selection: { selected: [] } },
      { name: "timeline", status: "unconfigured" },
      selected("node-editor"),
      selected("model-picker")
    ];
    const codes = { "graph-runner": 8, "node-editor": 0, "model-picker": 2 };
    const ran = [];
    const failed = runPlans(plans, (plan) => {
      ran.push(plan.name);
      return codes[plan.name];
    });
    expect(ran).toEqual(["graph-runner", "node-editor", "model-picker"]);
    expect(failed).toEqual([
      { name: "graph-runner", code: 8 },
      { name: "model-picker", code: 2 }
    ]);
  });
});

describe("build directories and helpers", () => {
  it("derives the environment variable from the project name", () => {
    expect(resolveBuildDir("node-editor", {}, { NODETOOL_NODE_EDITOR_BUILD_DIR: "/b/editor" }, "/repo")).toEqual({
      dir: "/b/editor",
      source: "NODETOOL_NODE_EDITOR_BUILD_DIR"
    });
    expect(resolveBuildDir("graph-runner", { "graph-runner": "/b/gr" }, { NODETOOL_GRAPH_RUNNER_BUILD_DIR: "/b/env" }, "/repo").dir).toBe("/b/gr");
    expect(resolveBuildDir("timeline", {}, {}, "/repo")).toEqual({ dir: "/repo/native/timeline/build", source: "default" });
    expect(configureCommand("graph-runner")).toBe("cmake -S native/graph-runner -B native/graph-runner/build -DCMAKE_BUILD_TYPE=Release");
  });

  it("parses Makefile depfiles with continuations, escaped spaces and relative paths", () => {
    const parsed = parseMakeDepfile("CMakeFiles/t.dir/a.cpp.o: ../src/a.cpp \\\n /abs/my\\ dir/b.h \\\n  c.h\n", "/build/sub");
    expect(parsed).toEqual({ object: "CMakeFiles/t.dir/a.cpp.o", files: ["/build/src/a.cpp", "/abs/my dir/b.h", "/build/sub/c.h"] });
  });

  it("parses ninja -t deps output", () => {
    const text = "CMakeFiles/gr_js.dir/src/js/engine.cpp.o: #deps 2, deps mtime 1 (VALID)\n    ../src/js/engine.cpp\n    /usr/include/stdio.h\n\n";
    expect(parseNinjaDeps(text, "/repo/build")).toEqual([
      { object: "CMakeFiles/gr_js.dir/src/js/engine.cpp.o", files: ["/repo/src/js/engine.cpp", "/usr/include/stdio.h"] }
    ]);
    expect(targetOfObject("_deps/quickjs-build/CMakeFiles/qjs.dir/quickjs.c.o")).toBe("qjs");
  });

  it("anchors and escapes ctest names", () => {
    expect(ctestRegex(["gr_a", "gr.b+"])).toBe("^(gr_a|gr\\.b\\+)$");
  });
});
