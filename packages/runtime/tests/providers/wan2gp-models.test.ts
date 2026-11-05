import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as config from "@nodetool-ai/config";
import { WAN2GP_HELPER_SOURCE, readWan2GPCatalog, type Wan2GPInstallStatus } from "@nodetool-ai/config";
import {
  captureWan2GPModelAvailability,
  downloadWan2GPModel,
  markWan2GPModelAvailable,
  resetWan2GPFileStatus,
  wan2gpCatalog,
  wan2gpFileStatus
} from "../../src/providers/wan2gp-models.js";

/**
 * A stand-in for Wan2GP's interpreter running NodeTool's helper. It logs each
 * run and answers `catalog <path>` and `prepare <model>` with the helper's
 * protocol, with Wan2GP's own chatter on stderr and stdout.
 */
const FAKE_PYTHON = `#!/usr/bin/env node
const fs = require("node:fs");
const [script, command, argument] = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_HELPER_LOG, JSON.stringify({ script, command, argument, cwd: process.cwd() }) + "\\n");
console.error("Loading WanGP runtime...");
const out = (payload) => process.stdout.write(JSON.stringify(payload) + "\\n");
const row = (model_type, status) => ({ model_type, name: model_type, main_output: ["video"], capabilities: ["text_to_video"], media_inputs: {}, status });
if (command === "catalog") {
  process.stdout.write("not a protocol line\\n");
  fs.writeFileSync(argument, JSON.stringify({ version: 1, models: [row("t2v_2_2", "available"), row("flux", "missing"), row("ace_step_v1", "partial")] }));
  out({ type: "catalog", count: 3 });
} else if (command === "prepare" && argument === "broken") {
  console.error("HTTP 404: DeepBeepMeep/Wan2.2 has no such file");
  process.exit(3);
} else if (command === "prepare" && argument === "slow") {
  setTimeout(() => {}, 30000);
} else if (command === "prepare") {
  out({ type: "total", total_bytes: 4096, total_files: 1 });
  out({ type: "progress", downloaded_bytes: 1024, current_files: ["flux1-dev_bf16.safetensors"] });
  out({ type: "progress", downloaded_bytes: 4096, current_files: [] });
  out({ type: "progress", downloaded_bytes: 5000, current_files: ["config.json"] });
  if (process.env.FAKE_HELPER_RELEASE) {
    const timer = setInterval(() => {
      if (fs.existsSync(process.env.FAKE_HELPER_RELEASE)) {
        clearInterval(timer);
        out({ type: "done", status: "available" });
      }
    }, 10);
  } else {
    out({ type: "done", status: "available" });
  }
}
`;

let root: string;
let install: Wan2GPInstallStatus;
let log: string;
let catalogFile: string;

beforeEach(async () => {
  resetWan2GPFileStatus();
  root = await mkdtemp(join(tmpdir(), "wan2gp-models-"));
  const sourceDir = join(root, "616e60506aff", "Wan2GP");
  await mkdir(join(sourceDir, "env_uv", "bin"), { recursive: true });
  const python = join(sourceDir, "env_uv", "bin", "python");
  await writeFile(python, FAKE_PYTHON);
  await chmod(python, 0o755);
  log = join(root, "helper.log");
  catalogFile = join(root, "616e60506aff", "catalog.json");
  process.env.FAKE_HELPER_LOG = log;
  install = { installed: true, version: "v19.02", commit: "616e605", sourceDir, python };
});

afterEach(async () => {
  delete process.env.FAKE_HELPER_LOG;
  delete process.env.FAKE_HELPER_RELEASE;
  await rm(root, { recursive: true, force: true });
});

async function runs(): Promise<Array<Record<string, string>>> {
  return (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

describe.skipIf(process.platform === "win32")("Wan2GP models", () => {
  it("writes the catalog once when the install has none, then reads it from memory", async () => {
    const status = await wan2gpFileStatus(install);
    expect(Object.fromEntries(status)).toEqual({ t2v_2_2: "available", flux: "missing", ace_step_v1: "partial" });
    await wan2gpCatalog(install);
    const calls = await runs();
    expect(calls).toEqual([
      { script: join(root, "616e60506aff", "nodetool_wan2gp.py"), command: "catalog", argument: catalogFile, cwd: install.sourceDir }
    ]);
    expect(await readFile(join(root, "616e60506aff", "nodetool_wan2gp.py"), "utf8")).toBe(WAN2GP_HELPER_SOURCE);
  });

  it("reads the catalog the installer wrote without running Wan2GP", async () => {
    const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "available" };
    await writeFile(catalogFile, JSON.stringify({ version: 1, models: [row] }));
    expect((await wan2gpCatalog(install)).map((model) => model.model_type)).toEqual(["flux"]);
    await expect(readFile(log, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("downloads a model with its total size and records it as available on disk", async () => {
    await wan2gpCatalog(install);
    const progress: Array<[number, number]> = [];
    const status = await downloadWan2GPModel(install, "flux", {
      onProgress: (p) => progress.push([p.downloadedBytes, p.totalBytes])
    });
    expect(status).toBe("available");
    // Past the estimate the total is unknown, not a bar stuck at 100%.
    expect(progress).toEqual([
      [1024, 4096],
      [4096, 4096],
      [5000, 0]
    ]);
    expect((await runs())[1]).toMatchObject({ command: "prepare", argument: "flux" });
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("available");
    // The download resolves once the catalog on disk holds the status.
    expect((await readWan2GPCatalog(install.sourceDir!))?.find((model) => model.model_type === "flux")?.status).toBe(
      "available"
    );
  });

  it("forgets cached availability after reinstalling the same release", async () => {
    await wan2gpCatalog(install);
    await markWan2GPModelAvailable("flux");
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("available");
    // Uninstall removes this release, and reinstall writes a fresh catalog
    // at exactly the same source path and commit.
    await rename(install.sourceDir!, `${install.sourceDir}-removed`);
    await mkdir(install.sourceDir!);
    const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "missing" };
    await writeFile(catalogFile, JSON.stringify({ version: 1, models: [row] }));
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
  });

  it("reads a catalog replaced by repair without keeping an earlier generation's proof", async () => {
    await wan2gpCatalog(install);
    await markWan2GPModelAvailable("flux");
    const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "missing" };
    await writeFile(`${catalogFile}.replacement`, JSON.stringify({ version: 1, models: [row] }));
    await rename(`${catalogFile}.replacement`, catalogFile);
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
  });

  it("discards a generation's late proof after a catalog repair", async () => {
    await wan2gpCatalog(install);
    const markAvailable = await captureWan2GPModelAvailability(install);
    const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "missing" };
    await writeFile(`${catalogFile}.replacement`, JSON.stringify({ version: 1, models: [row] }));
    await rename(`${catalogFile}.replacement`, catalogFile);
    await markAvailable("flux");
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
    expect((await readWan2GPCatalog(install.sourceDir!))?.[0].status).toBe("missing");
  });

  it("discards a download's late completion after reinstalling the same release", async () => {
    await wan2gpCatalog(install);
    const release = join(root, "release-download");
    process.env.FAKE_HELPER_RELEASE = release;
    let started: (() => void) | undefined;
    const progress = new Promise<void>((resolve) => { started = resolve; });
    const download = downloadWan2GPModel(install, "flux", { onProgress: () => started?.() });
    try {
      await progress;
      await rename(install.sourceDir!, `${install.sourceDir}-removed`);
      await mkdir(install.sourceDir!);
      const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "missing" };
      await writeFile(catalogFile, JSON.stringify({ version: 1, models: [row] }));
      expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
    } finally {
      await writeFile(release, "done");
      await download;
    }
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
    expect((await readWan2GPCatalog(install.sourceDir!))?.[0].status).toBe("missing");
  });

  it("does not retain old rows when the catalog is replaced during a read", async () => {
    await wan2gpCatalog(install);
    resetWan2GPFileStatus();
    const read = config.readWan2GPCatalog;
    vi.spyOn(config, "readWan2GPCatalog").mockImplementationOnce(async (sourceDir) => {
      const rows = await read(sourceDir);
      const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: [], media_inputs: {}, status: "missing" };
      await writeFile(`${catalogFile}.replacement`, JSON.stringify({ version: 1, models: [row] }));
      await rename(`${catalogFile}.replacement`, catalogFile);
      return rows;
    });
    await expect(wan2gpCatalog(install)).rejects.toThrow("installation changed");
    expect((await wan2gpFileStatus(install)).get("flux")).toBe("missing");
  });

  it("keeps independent completions from two catalog snapshots", async () => {
    const first = await captureWan2GPModelAvailability(install);
    resetWan2GPFileStatus();
    const second = await captureWan2GPModelAvailability(install);
    await first("flux");
    await second("ace_step_v1");
    const status = await wan2gpFileStatus(install);
    expect(status.get("flux")).toBe("available");
    expect(status.get("ace_step_v1")).toBe("available");
  });

  it.each(["generation", "download"])("cancels %s preflight while the installer owns the lock", async (operation) => {
    const lock = `${root}.nodetool-lock`;
    await mkdir(lock);
    const started = Promise.withResolvers<void>();
    const originalWrite = config.writeWan2GPCatalog;
    vi.spyOn(config, "writeWan2GPCatalog").mockImplementationOnce((target, signal) => {
      started.resolve();
      return originalWrite(target, signal);
    });
    const controller = new AbortController();
    const pending = operation === "generation"
      ? captureWan2GPModelAvailability(install, controller.signal)
      : downloadWan2GPModel(install, "flux", { signal: controller.signal });
    const observed = expect(pending).rejects.toThrow("cancelled preflight");
    try {
      await started.promise;
      controller.abort(new Error("cancelled preflight"));
      await observed;
      await expect(readFile(log, "utf8")).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
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

  it("keeps a generation's proof that a model is present, in memory and in the catalog", async () => {
    await wan2gpCatalog(install);
    const written = markWan2GPModelAvailable("ace_step_v1");
    expect((await wan2gpFileStatus(install)).get("ace_step_v1")).toBe("available");
    await written;
    resetWan2GPFileStatus();
    expect((await wan2gpFileStatus(install)).get("ace_step_v1")).toBe("available");
  });

  it("tries again after a failed catalog run", async () => {
    await writeFile(install.python!, "#!/usr/bin/env bash\necho 'No module named shared' >&2\nexit 1\n");
    await expect(wan2gpCatalog(install)).rejects.toThrow(/No module named shared/);
    await writeFile(install.python!, FAKE_PYTHON);
    expect((await wan2gpFileStatus(install)).get("t2v_2_2")).toBe("available");
  });
});

describe("helper source", () => {
  it("uses only Wan2GP's public API and download functions", () => {
    expect(WAN2GP_HELPER_SOURCE).toContain("from shared.api import init");
    expect(WAN2GP_HELPER_SOURCE).toContain("session.list_model_metadata()");
    expect(WAN2GP_HELPER_SOURCE).toContain("session.list_model_availability()");
    expect(WAN2GP_HELPER_SOURCE).toContain("module.download_models(");
    // Python 3.10 environments (the GTX 10xx profile) have no contextlib.chdir.
    expect(WAN2GP_HELPER_SOURCE).not.toContain("contextlib.chdir");
  });
});
