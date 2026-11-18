import { test } from "vitest";
import assert from "node:assert/strict";
import { findBuildOutput, isBuildOutput } from "../check-build-output.mjs";

test("flags the files PR #7645 committed from native/account/build-qt", () => {
  const paths = [
    "native/account/build-qt/.ninja_deps",
    "native/account/build-qt/.ninja_log",
    "native/account/build-qt/.qt/QtDeploySupport.cmake",
    "native/account/build-qt/CMakeCache.txt",
    "native/account/build-qt/CMakeFiles/nodetool_account.dir/src/session.cpp.o",
    "native/account/build-qt/qt/nodetool_account_qt_autogen/moc_predefs.h",
    "native/account/build-qt/build.ninja"
  ];
  assert.deepEqual(findBuildOutput(paths), paths);
});

test("keeps sources and the allowed CMake fixture", () => {
  for (const path of [
    "native/account/CMakeLists.txt",
    "native/account/src/session.cpp",
    "native/account/qt/AccountController.h",
    "native/parity/fixtures/build.mjs",
    "packages/sandbox-runtime/vendor/quickjs/modules/build/test-lib.js",
    "scripts/__tests__/fixtures/test-affected-native/out/CMakeCache.txt",
    "scripts/__tests__/fixtures/test-affected-native/out/CMakeFiles/gr_util.dir/src/util.cpp.o.d"
  ]) {
    assert.equal(isBuildOutput(path), false, path);
  }
});
