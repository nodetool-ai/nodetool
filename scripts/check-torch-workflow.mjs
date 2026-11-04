#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = { ...process.env };
const python = process.env.NODETOOL_TORCH_PYTHON || fileURLToPath(
  new URL("../native/workflow/.venv/bin/python", import.meta.url)
);
if (!existsSync(python)) {
  process.stderr.write(
    "Torch workflow Python is missing. Follow native/workflow/README.md to install the pinned toolchain, or set NODETOOL_TORCH_PYTHON to its absolute Python path.\n"
  );
  process.exit(1);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: environment });
  if (result.error) {
    process.stderr.write(`Torch workflow check failed to start: ${result.error.message}\n`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.argv.slice(2).includes("cuda") && !environment.CUDA_HOME) {
  const cudaHome = fileURLToPath(new URL("../build/cuda", import.meta.url));
  run(python, ["native/workflow/setup_cuda.py", cudaHome]);
  environment.CUDA_HOME = cudaHome;
}

run("cmake", [
  "-S", "native/workflow", "-B", "build/native-workflow",
  "-DCMAKE_BUILD_TYPE=Release", `-DPython3_EXECUTABLE=${python}`
]);
run("cmake", ["--build", "build/native-workflow", "--parallel", "2"]);
run(python, ["native/workflow/tests/check.py", ...process.argv.slice(2)]);
