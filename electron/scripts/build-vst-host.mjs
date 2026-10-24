// electron/scripts/build-vst-host.mjs
// Build NodeToolVstHost (native/vst-host) with CMake and stage it in
// electron/vst-host/, which electron-builder packs as resources/vst-host/.
// macOS builds a universal binary, so one build serves the arm64 and x64 apps.
// Needs CMake 3.22+ and a C++17 compiler. JUCE is fetched at configure time.
//
//   node scripts/build-vst-host.mjs           # build and stage the helper
//   node scripts/build-vst-host.mjs --test    # also build and run vst_host_test
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = path.join(ELECTRON_DIR, "..", "native", "vst-host");
const BUILD_DIR = path.join(SOURCE_DIR, "build");
const STAGE_DIR = path.join(ELECTRON_DIR, "vst-host");
const EXE = process.platform === "win32" ? "NodeToolVstHost.exe" : "NodeToolVstHost";

const test = process.argv.includes("--test");

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

const configure = ["-S", SOURCE_DIR, "-B", BUILD_DIR, "-DCMAKE_BUILD_TYPE=Release", `-DVSTHOST_BUILD_TESTS=${test ? "ON" : "OFF"}`];
if (process.platform === "darwin") {
  configure.push("-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0");
}
run("cmake", configure);

const targets = test ? ["NodeToolVstHost", "vst_host_test"] : ["NodeToolVstHost"];
run("cmake", ["--build", BUILD_DIR, "--config", "Release", "--parallel", "--target", ...targets]);
if (test) {
  run("ctest", ["--test-dir", BUILD_DIR, "-C", "Release", "--output-on-failure"]);
}

const built = path.join(BUILD_DIR, "NodeToolVstHost_artefacts", "Release", EXE);
fs.mkdirSync(STAGE_DIR, { recursive: true });
fs.copyFileSync(built, path.join(STAGE_DIR, EXE));
fs.chmodSync(path.join(STAGE_DIR, EXE), 0o755);
console.log(`Staged ${path.join(STAGE_DIR, EXE)}`);
