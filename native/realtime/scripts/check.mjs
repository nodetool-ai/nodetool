import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("..", import.meta.url));
const budget = JSON.parse(readFileSync(new URL("../budgets/offline.json", import.meta.url), "utf8"));

export function requireTestInventory(inventory) {
  const names = new Set(inventory.tests?.map((test) => test.name));
  const missing = budget.requiredTests.filter((name) => !names.has(name));
  if (missing.length) { throw new Error(`Missing required offline checks: ${missing.join(", ")}`); }
}

export function check({ build = process.env.NODETOOL_REALTIME_BUILD_DIR || join(source, "build-gpu") } = {}) {
  if (budget.schemaVersion !== 1 || !Array.isArray(budget.requiredTests) || budget.requiredTests.length === 0 ||
      !budget.requiredTests.every((name) => typeof name === "string" && name.startsWith("realtime-")) ||
      !Number.isSafeInteger(budget.commandTimeoutSeconds) || budget.commandTimeoutSeconds <= 0 ||
      !Number.isSafeInteger(budget.ctestTimeoutSeconds) || budget.ctestTimeoutSeconds <= 0) {
    throw new Error("Invalid offline verification budget");
  }
  function run(command, args, capture = false) {
    const result = spawnSync(command, args, {
      cwd: resolve(source, "../.."),
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      timeout: budget.commandTimeoutSeconds * 1000,
      maxBuffer: 16 * 1024 * 1024
    });
    if (result.error || result.status !== 0) {
      throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.signal || result.status}`);
    }
    return result.stdout;
  }
  console.log("Offline realtime prerequisites: CMake >= 3.24, C++20 compiler, built protocol/gpu packages and a software WebGPU adapter. Linux needs a Vulkan ICD such as lavapipe. This does not qualify M0 hardware timing.");
  run("cmake", ["--version"]);
  run("ctest", ["--version"]);
  run(process.execPath, ["--test", join(source, "scripts/check.test.mjs")]);
  run("cmake", ["-S", source, "-B", build, "-DCMAKE_BUILD_TYPE=Release", "-DNT_REALTIME_BUILD_SPIKES=OFF", "-DNT_REALTIME_OFFLINE_GPU=ON"]);
  run("cmake", ["--build", build, "--config", "Release", "--parallel", "2"]);
  const inventory = JSON.parse(run("ctest", ["--test-dir", build, "-C", "Release", "--show-only=json-v1"], true));
  requireTestInventory(inventory);
  console.log(`Verified ${budget.requiredTests.length} required CTest entries before execution.`);
  run("ctest", ["--test-dir", build, "-C", "Release", "--output-on-failure", "--no-tests=error", "--timeout", String(budget.ctestTimeoutSeconds)]);
  const filename = process.platform === "win32" ? "nodetool-realtime.exe" : "nodetool-realtime";
  const executable = [join(build, "Release", filename), join(build, filename)].find(existsSync);
  if (!executable) { throw new Error(`Built CLI not found under ${build}`); }
  run(process.execPath, [join(source, "scripts/cli-check.mjs"), executable]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) { throw new Error("Usage: node native/realtime/scripts/check.mjs (optional NODETOOL_REALTIME_BUILD_DIR)"); }
    check();
  } catch (error) {
    console.error(`Offline realtime check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
