import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AceStepInstallError, aceStepModelFile } from "@nodetool-ai/config";
import { aceStepSetupResultSchema, type AceStepSetupOperation } from "@nodetool-ai/protocol";
import { AceStepProvider } from "@nodetool-ai/runtime";
import { AceStepSetupService, type AceStepSetupDeps } from "../src/acestep-setup.js";

const roots: string[] = [];
const SHA = "a".repeat(64);

function setup(overrides: Partial<AceStepSetupDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), "acestep-setup-"));
  roots.push(root);
  const aceStep = join(root, "acestep");
  const aceStepModels = join(root, "acestep-models");
  const service = new AceStepSetupService({
    locations: () => ({ aceStep, aceStepModels }),
    platform: "darwin",
    arch: "arm64",
    resolve: async () => ({ remote: false, binary: null, modelsDir: null }),
    asset: () => ({ name: "ace-server.zip", sha256: SHA, sizeBytes: 1 }),
    install: vi.fn(async () => ({ installed: true })),
    downloadModels: vi.fn(async () => []),
    ...overrides
  });
  return { service, aceStep, aceStepModels };
}

afterEach(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("AceStepSetupService status", () => {
  it("reports nothing installed, every role missing, and a schema-valid status", async () => {
    const { service } = setup();
    const status = await service.status();
    expect(aceStepSetupResultSchema.parse({ accepted: true, reason: null, status })).toBeTruthy();
    expect(status.binary).toMatchObject({ installed: false, blocked: null, version: null });
    expect(status.models.first_run.missing).toEqual(["textEncoder", "languageModel", "ditTurbo", "vae"]);
    expect(status.models.first_run.missing_bytes).toBe(status.models.first_run.approx_bytes);
    expect(status.models.add_instrument.missing).toEqual(["ditBase"]);
    expect(status.models.available).toBe(true);
    expect(status.operation).toBeNull();
  });

  it("sees the files on disk", async () => {
    const { service, aceStepModels } = setup();
    mkdirSync(aceStepModels, { recursive: true });
    writeFileSync(join(aceStepModels, aceStepModelFile("ditTurbo").file), "x");
    writeFileSync(join(aceStepModels, aceStepModelFile("ditBase").file), "x");
    const status = await service.status();
    expect(status.models.first_run.present).toEqual(["ditTurbo"]);
    expect(status.models.add_instrument.missing).toEqual([]);
    expect(status.models.add_instrument.missing_bytes).toBe(0);
  });

  it("names why the install is blocked: unset digest, platform, and no install folder", async () => {
    const unset = setup({ asset: () => ({ name: "a.zip", sha256: null, sizeBytes: 1 }) });
    expect((await unset.service.status()).binary).toMatchObject({ blocked: "digest-unset" });
    const linux = setup({ platform: "linux", arch: "x64", asset: () => null });
    expect((await linux.service.status()).binary).toMatchObject({ blocked: "unsupported-platform" });
    const hosted = setup({ locations: () => ({ aceStep: null, aceStepModels: null }) });
    const status = await hosted.service.status();
    expect(status.binary.blocked).toBe("no-install-dir");
    expect(status.models.available).toBe(false);
  });

  it("reports a remote server", async () => {
    const { service } = setup({ resolve: async () => ({ remote: true, binary: null, modelsDir: null }) });
    expect((await service.status()).remote).toBe(true);
  });

  /** The acestep provider's resolution for a user with these settings. */
  function userResolution(settings: Record<string, string>) {
    return new AceStepProvider(settings, {
      locateInstall: async () => ({ binary: null, modelsDir: null })
    }).resolution();
  }

  it("reports remote for a user-level ACESTEP_SERVER_URL setting (item 3)", async () => {
    const { service } = setup();
    const status = await service.status(await userResolution({ ACESTEP_SERVER_URL: "http://10.0.0.2:8085" }));
    expect(status.remote).toBe(true);
  });

  it("reports the binary a user-level ACESTEP_SERVER_PATH names as installed (item 3)", async () => {
    const { service } = setup({ platform: "linux", arch: "x64", asset: () => null });
    const root = mkdtempSync(join(tmpdir(), "acestep-user-"));
    roots.push(root);
    const binary = join(root, "ace-server");
    writeFileSync(binary, "#!/bin/sh\n");
    chmodSync(binary, 0o755);
    const status = await service.status(await userResolution({ ACESTEP_SERVER_PATH: binary }));
    expect(status.remote).toBe(false);
    expect(status.binary).toMatchObject({ installed: true, blocked: null, version: null });
  });

  it("reads the models folder a user-level ACESTEP_MODELS_DIR names (item 3)", async () => {
    const { service } = setup();
    const models = mkdtempSync(join(tmpdir(), "acestep-user-models-"));
    roots.push(models);
    writeFileSync(join(models, aceStepModelFile("ditBase").file), "x");
    const status = await service.status(await userResolution({ ACESTEP_MODELS_DIR: models }));
    expect(status.models.add_instrument.missing).toEqual([]);
  });
});

describe("AceStepSetupService install", () => {
  it("refuses while blocked and starts nothing", async () => {
    const install = vi.fn();
    const { service } = setup({ asset: () => ({ name: "a.zip", sha256: null, sizeBytes: 1 }), install });
    const result = await service.startInstall();
    expect(result).toMatchObject({ accepted: false, reason: "blocked" });
    expect(install).not.toHaveBeenCalled();
  });

  it("runs the install with stage and percent events, then reports done", async () => {
    const seen: AceStepSetupOperation[] = [];
    const install = vi.fn<AceStepSetupDeps["install"]>(async (options) => {
      options.onEvent?.({ type: "stage", label: "Downloading ace-server" });
      options.onEvent?.({ type: "percent", value: 40 });
      return { installed: true };
    });
    const { service, aceStep } = setup({ install });
    service.subscribe((op) => seen.push(op));
    const result = await service.startInstall();
    expect(result).toMatchObject({ accepted: true, status: { operation: { kind: "install" } } });
    await service.settled();
    expect(install).toHaveBeenCalledWith(expect.objectContaining({ installDir: aceStep, platform: "darwin", arch: "arm64" }));
    expect(seen.map((op) => op.stage)).toContain("Downloading ace-server");
    expect(seen.some((op) => op.percent === 40)).toBe(true);
    expect((await service.status()).operation).toMatchObject({ state: "done", percent: 100 });
  });

  it("reports an installer error with its code", async () => {
    const install = vi.fn(async () => {
      throw new AceStepInstallError("digest-mismatch", "The archive digest differs");
    });
    const { service } = setup({ install });
    await service.startInstall();
    await service.settled();
    expect((await service.status()).operation).toMatchObject({
      state: "failed",
      error: "The archive digest differs",
      error_code: "digest-mismatch"
    });
  });
});

describe("AceStepSetupService model download", () => {
  it("downloads the named role set and reports cumulative progress", async () => {
    const downloadModels = vi.fn<AceStepSetupDeps["downloadModels"]>(async (options) => {
      options.onProgress?.({
        role: "ditBase",
        file: "acestep-v15-base-Q8_0.gguf",
        fileIndex: 1,
        fileCount: 1,
        downloadedBytes: 1_000,
        totalBytes: 4_000
      });
      return [...options.roles];
    });
    const { service, aceStepModels } = setup({ downloadModels });
    const result = await service.startModelDownload("add_instrument");
    expect(result.accepted).toBe(true);
    await service.settled();
    expect(downloadModels).toHaveBeenCalledWith(
      expect.objectContaining({ modelsDir: aceStepModels, roles: ["ditBase"] })
    );
    expect((await service.status()).operation).toMatchObject({
      kind: "models",
      set: "add_instrument",
      state: "done",
      file: "acestep-v15-base-Q8_0.gguf",
      downloaded_bytes: 1_000,
      total_bytes: 4_000
    });
  });

  it("passes the first-run roles for the first_run set", async () => {
    const downloadModels = vi.fn(async () => []);
    const { service } = setup({ downloadModels });
    await service.startModelDownload("first_run");
    await service.settled();
    expect(downloadModels).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["textEncoder", "languageModel", "ditTurbo", "vae"] })
    );
  });

  it("refuses a second operation while one runs, and cancel aborts the download", async () => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const downloadModels = vi.fn<AceStepSetupDeps["downloadModels"]>(
      (options) =>
        new Promise((_resolve, reject) => {
          started();
          options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const { service } = setup({ downloadModels });
    await service.startModelDownload("first_run");
    await running;
    expect(await service.startModelDownload("add_instrument")).toMatchObject({ accepted: false, reason: "busy" });
    expect(await service.startInstall()).toMatchObject({ accepted: false, reason: "busy" });
    expect(await service.cancel()).toMatchObject({ accepted: true });
    await service.settled();
    expect((await service.status()).operation).toMatchObject({ state: "cancelled" });
  });

  it("refuses cancel with nothing running, and a download with no models folder", async () => {
    const { service } = setup();
    expect(await service.cancel()).toMatchObject({ accepted: false, reason: "nothing_running" });
    const hosted = setup({ locations: () => ({ aceStep: null, aceStepModels: null }) });
    expect(await hosted.service.startModelDownload("first_run")).toMatchObject({
      accepted: false,
      reason: "no_models_dir"
    });
  });

  it("reports a failed download", async () => {
    const { service } = setup({ downloadModels: vi.fn(async () => { throw new Error("HTTP 503"); }) });
    await service.startModelDownload("first_run");
    await service.settled();
    expect((await service.status()).operation).toMatchObject({ state: "failed", error: "HTTP 503", error_code: null });
  });
});
