import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "native/graph-runner");
const build = resolve(process.env.NODETOOL_GRAPH_RUNNER_BUILD_DIR || join(source, "build"));
const bundle = join(build, "guest.js");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.message || result.signal || result.status})`);
  }
}

try {
  if (process.argv.length !== 2) {
    throw new Error("Usage: node scripts/check-native-graph-runner.mjs. Set NODETOOL_GRAPH_RUNNER_BUILD_DIR to reuse a CMake build.");
  }
  // Parse every guest and harness module, including parity tooling outside the
  // default guest bundle. Build outputs and fetched dependencies are excluded.
  let inspected = 0;
  for (const directory of ["guest", "tools", "parity", "unittests"]) {
    const base = join(source, directory);
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(mjs|cjs)$/.test(entry.name)) {
        continue;
      }
      run(process.execPath, ["--check", join(entry.parentPath, entry.name)]);
      inspected++;
    }
  }
  if (inspected === 0) {
    throw new Error("No graph-runner JavaScript modules inspected");
  }
  console.log(`Parsed ${inspected} graph-runner modules`);
  run("cmake", ["--version"]);
  run("ctest", ["--version"]);
  run(process.execPath, [join(source, "guest/build.mjs"), bundle]);
  run(process.execPath, [join(source, "guest/host/gpu-catalog.mjs"), join(build, "gpu-catalog.json")]);
  run("cmake", ["-S", source, "-B", build, "-DCMAKE_BUILD_TYPE=Release", `-DNODETOOL_GUEST_BUNDLE=${bundle}`, `-DNODETOOL_GPU_CATALOG=${join(build, "gpu-catalog.json")}`]);
  run("cmake", ["--build", build, "--config", "Release", "--parallel", "2"]);
  run("ctest", ["--test-dir", build, "-C", "Release", "--output-on-failure", "--no-tests=error", "--timeout", "120"]);
  run(process.execPath, ["--test", join(source, "guest/values.test.mjs")]);
  const executable = process.platform === "win32" ? "nodetool-graph-runner.exe" : "nodetool-graph-runner";
  const runner = [join(build, executable), join(build, "Release", executable)].find(existsSync);
  if (!runner) {
    throw new Error(`Built runner not found in ${build}`);
  }
  run(process.execPath, [join(source, "tools/conformance.mjs"), "--runner", runner, "--bundle", bundle]);
} catch (error) {
  console.error(`Native graph runner check failed: ${error.message}`);
  process.exitCode = 1;
}
