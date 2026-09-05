import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SETUP_SCRIPT = resolve(ROOT, "scripts/setup-codex.sh");

describe("setup-codex", () => {
  it("passes the ONNX Runtime CUDA setting through the install environment", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "nodetool-setup-codex-"));
    const binDir = join(fixtureDir, "bin");
    const nvmDir = join(fixtureDir, "nvm");
    mkdirSync(binDir);
    mkdirSync(nvmDir);

    const npmPath = join(binDir, "npm");
    writeFileSync(
      npmPath,
      `#!/bin/bash
if [[ "$*" == "config set onnxruntime-node-install-cuda skip" ]]; then
  echo '\`onnxruntime-node-install-cuda\` is not a valid npm option' >&2
  exit 1
fi
if [[ "$1" == "ci" || "$3" == "ci" ]]; then
  echo "onnxruntime-node-install-cuda=\${npm_config_onnxruntime_node_install_cuda:-unset}"
fi
`
    );
    chmodSync(npmPath, 0o755);
    writeFileSync(join(nvmDir, "nvm.sh"), "nvm() { :; }\n");

    try {
      const result = spawnSync("bash", [SETUP_SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          NVM_DIR: nvmDir,
          npm_config_onnxruntime_node_install_cuda: "",
          SKIP_APT: "1",
          SKIP_BUILD: "1",
          SKIP_PLAYWRIGHT: "1",
          SKIP_PYTHON: "1",
        },
      });

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("onnxruntime-node-install-cuda=skip");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
