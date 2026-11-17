// electron/scripts/build-account-helper.mjs
// Build nodetool-account-helper (native/account-helper) with CMake and stage
// it in electron/account-helper/, which electron-builder packs as
// resources/account-helper/. macOS builds a universal binary, so one build
// serves the arm64 and x64 apps. Needs CMake 3.28+ and a C++20 compiler.
// Linux links libsecret when its development files are installed. Without
// them the helper keeps a sign-in in memory only.
//
//   node scripts/build-account-helper.mjs           # build and stage the helper
//   node scripts/build-account-helper.mjs --test    # also run the helper's
//                                                   # and the account library's tests
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = path.join(ELECTRON_DIR, "..", "native", "account-helper");
const BUILD_DIR = path.join(SOURCE_DIR, "build-release");
const STAGE_DIR = path.join(ELECTRON_DIR, "account-helper");
const EXT = process.platform === "win32" ? ".exe" : "";
const EXE = `nodetool-account-helper${EXT}`;

const test = process.argv.includes("--test");

function run(command, args, env = process.env) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

const configure = [
  "-S",
  SOURCE_DIR,
  "-B",
  BUILD_DIR,
  "-DCMAKE_BUILD_TYPE=Release",
  `-DNODETOOL_ACCOUNT_HELPER_TESTS=${test ? "ON" : "OFF"}`,
];
if (process.platform === "darwin") {
  configure.push("-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0");
}
run("cmake", configure);
run("cmake", ["--build", BUILD_DIR, "--config", "Release", "--parallel"]);

/** A built executable, in a single-config or a multi-config build folder. */
function built(name) {
  const candidates = [path.join(BUILD_DIR, name), path.join(BUILD_DIR, "Release", name)];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`${name} was not built (looked in ${candidates.join(", ")})`);
  }
  return found;
}

if (test) {
  run("ctest", ["--test-dir", BUILD_DIR, "-C", "Release", "--output-on-failure"]);
  run("node", ["--test", path.join(SOURCE_DIR, "tests", "process.test.mjs")], {
    ...process.env,
    NODETOOL_ACCOUNT_HELPER_TEST_BINARY: built(`nodetool-account-helper-test${EXT}`),
  });
}

fs.mkdirSync(STAGE_DIR, { recursive: true });
fs.copyFileSync(built(EXE), path.join(STAGE_DIR, EXE));
fs.chmodSync(path.join(STAGE_DIR, EXE), 0o755);
console.log(`Staged ${path.join(STAGE_DIR, EXE)}`);
