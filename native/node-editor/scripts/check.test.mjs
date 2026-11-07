import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { check } from "./check.mjs";

function fixture(body, assertion) {
  const source = mkdtempSync(join(tmpdir(), "node-editor-check-"));
  try {
    writeFileSync(join(source, "CMakeLists.txt"), `cmake_minimum_required(VERSION 3.24)\nproject(CheckFixture NONE)\nenable_testing()\n${body}\n`);
    assertion(() => check({ source, build: join(source, "build") }));
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}

test("builds and executes a real passing CTest test", () => {
  fixture('add_test(NAME passing COMMAND "${CMAKE_COMMAND}" -E true)', (run) => assert.doesNotThrow(run));
});
test("propagates a real CTest failure", () => {
  fixture('add_test(NAME failing COMMAND "${CMAKE_COMMAND}" -E false)', (run) => assert.throws(run, /ctest .*failed/));
});
test("fails when a registered test executable is missing", () => {
  fixture('add_test(NAME missing COMMAND "${CMAKE_CURRENT_BINARY_DIR}/missing-test-executable")', (run) => assert.throws(run, /ctest .*failed/));
});
test("fails when no tests were registered", () => {
  fixture("", (run) => assert.throws(run, /ctest .*failed/));
});
test("propagates configuration errors", () => {
  fixture('message(FATAL_ERROR "deliberately invalid configuration")', (run) => assert.throws(run, /cmake .*failed/));
});
test("propagates build errors before running tests", () => {
  fixture('add_custom_target(broken ALL COMMAND "${CMAKE_COMMAND}" -E false)\nadd_test(NAME passing COMMAND "${CMAKE_COMMAND}" -E true)', (run) => assert.throws(run, /cmake --build .*failed/));
});
test("rejects unrecognized CLI arguments with a nonzero exit", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("check.mjs", import.meta.url)), "--skip-tests"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
