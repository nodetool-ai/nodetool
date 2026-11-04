import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wrapper = resolve("scripts/check-torch-workflow.mjs");

describe("Torch check wrapper", () => {
  it.each([undefined, "/existing/cuda"])("prepares or preserves CUDA_HOME=%s", (cudaHome) => {
    const directory = mkdtempSync(join(tmpdir(), "torch-wrapper-"));
    const log = join(directory, "calls.jsonl");
    try {
      const executable = `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';\nappendFileSync(process.env.WRAPPER_LOG, JSON.stringify({args:process.argv.slice(2),cudaHome:process.env.CUDA_HOME})+'\\n');\n`;
      for (const name of ["python", "cmake"]) {
        writeFileSync(join(directory, name), executable, { mode: 0o755 });
      }
      const environment = { ...process.env, NODETOOL_TORCH_PYTHON: join(directory, "python"), PATH: `${directory}${delimiter}${process.env.PATH}`, WRAPPER_LOG: log };
      delete environment.CUDA_HOME;
      if (cudaHome) {
        environment.CUDA_HOME = cudaHome;
      }
      const result = spawnSync(process.execPath, [wrapper, "--targets", "cuda"], { env: environment, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const setup = calls.filter((call) => call.args[0] === "native/workflow/setup_cuda.py");
      expect(setup).toHaveLength(cudaHome ? 0 : 1);
      const expectedHome = cudaHome || resolve("build/cuda");
      if (!cudaHome) {
        expect(setup[0].args[1]).toBe(expectedHome);
      }
      expect(calls.at(-1)).toEqual({ args: ["native/workflow/tests/check.py", "--targets", "cuda"], cudaHome: expectedHome });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
