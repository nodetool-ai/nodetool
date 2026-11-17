#!/usr/bin/env node
// Fails when the git index holds CMake, Ninja or Qt build output. PR #7645
// committed native/account/build-qt/ (165 files) by mistake, and the removal
// commit cannot take the blobs back out of history. This check stops the next
// one at review time instead.
//
// It reads `git ls-files`, so it sees committed and staged files alike.
// Fixtures that are build output on purpose go in ALLOWED_PREFIXES.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_PREFIXES = [
  // Recorded CMake file-API reply that test-affected-native reads.
  "scripts/__tests__/fixtures/test-affected-native/out/"
];

// The build folders of a native project, as .gitignore names them. Any file
// in one is build output, a library or program as much as CMake's own files.
const NATIVE_BUILD_DIR = /^native\/[^/]+\/(build|build-[^/]+|cmake-build-[^/]+)\//;
const BUILD_DIR_SEGMENT = /(^|\/)(CMakeFiles|\.qt|[^/]+_autogen)\//;
const BUILD_FILE_NAME = /(^|\/)(CMakeCache\.txt|\.ninja_deps|\.ninja_log|build\.ninja|cmake_install\.cmake|CTestTestfile\.cmake|compile_commands\.json)$/;
// GCC and Clang objects. MSVC's `.obj` is left out because a Wavefront
// model has the same extension; an MSVC object sits under CMakeFiles/ or a
// native build folder, which the rules above catch.
const OBJECT_FILE = /\.(o|o\.d)$/;

export function isBuildOutput(path) {
  if (ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return (
    NATIVE_BUILD_DIR.test(path) ||
    BUILD_DIR_SEGMENT.test(path) ||
    BUILD_FILE_NAME.test(path) ||
    OBJECT_FILE.test(path)
  );
}

export function findBuildOutput(paths) {
  return paths.filter(isBuildOutput);
}

function trackedFiles(repoRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 });
  return output.toString("utf8").split("\0").filter(Boolean);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = trackedFiles(repoRoot);
  if (files.length === 0) {
    console.error("check-build-output: git ls-files returned no files");
    process.exit(1);
  }
  const offenders = findBuildOutput(files);
  if (offenders.length > 0) {
    const shown = offenders.slice(0, 20).map((path) => `  ${path}`).join("\n");
    const more = offenders.length > 20 ? `\n  … and ${offenders.length - 20} more` : "";
    console.error(
      `check-build-output: ${offenders.length} tracked file(s) look like build output:\n${shown}${more}\n` +
        "Remove them with `git rm -r --cached <dir>` and add the build directory to .gitignore."
    );
    process.exit(1);
  }
  console.log(`check-build-output: ${files.length} tracked files, no build output`);
}
