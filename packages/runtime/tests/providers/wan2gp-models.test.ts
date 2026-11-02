import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Wan2GPInstallStatus } from "@nodetool-ai/config";
import {
  WAN2GP_HELPER_SOURCE,
  downloadWan2GPModel,
  markWan2GPModelAvailable,
  resetWan2GPFileStatus,
  wan2gpFileStatus
} from "../../src/providers/wan2gp-models.js";

/**
 * A stand-in for Wan2GP's interpreter running NodeTool's helper. It logs each
 * run and answers `status` and `prepare <model>` with the helper's protocol,
 * with Wan2GP's own chatter on stderr and stdout.
 */
const FAKE_PYTHON = `#!/usr/bin/env node
const fs = require("node:fs");
const [script, command, model] = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_HELPER_LOG, JSON.stringify({ script, command, model, cwd: process.cwd() }) + "\\n");
console.error("Loading WanGP runtime...");
const out = (payload) => process.stdout.write(JSON.stringify(payload) + "\\n");
if (command === "status") {
  process.stdout.write("not a protocol line\\n");
  out({ type: "status", models: { t2v_2_2: "available", flux: "missing", ace_step_v1: "partial", odd: "weird" } });
} else if (command === "prepare" && model === "broken") {
  console.error("HTTP 404: DeepBeepMeep/Wan2.2 has no such file");
  process.exit(3);
} else if (command === "prepare" && model === "slow") {
  setTimeout(() => {}, 30000);
} else if (command === "prepare") {
  out({ type: "progress", downloaded_bytes: 1024, current_files: ["flux1-dev_bf16.safetensors"] });
  out({ type: "progress", downloaded_bytes: 4096, current_files: [] });
  out({ type: "done", status: "available" });
}
`;

let root: string;
let install: Wan2GPInstallStatus;
let log: string;

beforeEach(async () => {
  resetWan2GPFileStatus();
  root = await mkdtemp(join(tmpdir(), "wan2gp-models-"));
  const sourceDir = join(root, "616e60506aff", "Wan2GP");
  await mkdir(join(sourceDir, "env_uv", "bin"), { recursive: true });
  const python = join(sourceDir, "env_uv", "bin", "python");
  await writeFile(python, FAKE_PYTHON);
  await chmod(python, 0o755);
  log = join(root, "helper.log");
  process.env.FAKE_HELPER_LOG = log;
  install = { installed: true, version: "v19.02", commit: "616e605", sourceDir, python };
});

afterEach(async () => {
  delete process.env.FAKE_HELPER_LOG;
  await rm(root, { recursive: true, force: true });
});

async function runs(): Promise<Array<Record<string, string>>> {
  return (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

describe.skipIf(process.platform === "win32")("Wan2GP model files", () => {
  it("writes the helper next to the release and reads every model's status once", async () => {
    const status = await wan2gpFileStatus(install);
    expect(Object.fromEntries(status)).toEqual({ t2v_2_2: "available", flux: "missing", ace_step_v1: "partial" });
    await wan2gpFileStatus(install);
    const calls = await runs();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ script: join(root, "616e60506aff", "nodetool_wan2gp.py"), command: "status", cwd: install.sourceDir });
    expect(await readFile(join(root, "616e60506aff", "nodetool_wan2gp.py"), "utf8")).toBe(WAN2GP_HELPER_SOURCE);
  });

  it("downloads a model with progress and records it as available", async () => {
    const progress: number[] = [];
    const status = await downloadWan2GPModel(install, "flux", { onProgress: (p) => progress.push(p.downloadedBytes) });
    expect(status).toBe("available");
    expect(progress).toEqual([1024, 4096]);
    expect((await runs())[0]).toMatchObject({ command: "prepare", model: "flux" });
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("available");
  });

  it("reports the downloader's error", async () => {
    await expect(downloadWan2GPModel(install, "broken")).rejects.toThrow(/exit code 3:[\s\S]*HTTP 404/);
  });

  it("stops the download when cancelled", async () => {
    const controller = new AbortController();
    const download = downloadWan2GPModel(install, "slow", { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("cancelled by user")), 200);
    await expect(download).rejects.toThrow("cancelled by user");
  });

  it("keeps a generation's proof that a model is present", async () => {
    await wan2gpFileStatus(install);
    markWan2GPModelAvailable("ace_step_v1");
    expect((await wan2gpFileStatus(install)).get("ace_step_v1")).toBe("available");
  });

  it("reads again after a failed status run", async () => {
    await writeFile(install.python!, "#!/usr/bin/env bash\necho 'No module named shared' >&2\nexit 1\n");
    await expect(wan2gpFileStatus(install)).rejects.toThrow(/No module named shared/);
    await writeFile(install.python!, FAKE_PYTHON);
    expect((await wan2gpFileStatus(install)).get("t2v_2_2")).toBe("available");
  });
});

describe("helper source", () => {
  it("uses only Wan2GP's public API and download functions", () => {
    expect(WAN2GP_HELPER_SOURCE).toContain("from shared.api import init");
    expect(WAN2GP_HELPER_SOURCE).toContain("session.list_model_availability()");
    expect(WAN2GP_HELPER_SOURCE).toContain("module.download_models(");
    // Python 3.10 environments (the GTX 10xx profile) have no contextlib.chdir.
    expect(WAN2GP_HELPER_SOURCE).not.toContain("contextlib.chdir");
  });
});
