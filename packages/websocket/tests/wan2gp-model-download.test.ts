import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelDownloadUpdate } from "@nodetool-ai/runtime";

const runtime = vi.hoisted(() => ({
  findInstalledWan2GP: vi.fn(),
  downloadWan2GPModel: vi.fn()
}));
vi.mock("@nodetool-ai/runtime", () => runtime);

const { runWan2GPModelDownload } = await import("../src/model-download-runtime.js");

const install = { installed: true, sourceDir: "/w/Wan2GP", python: "/w/Wan2GP/env_uv/bin/python" };

async function run(signal = new AbortController().signal): Promise<ModelDownloadUpdate[]> {
  const updates: ModelDownloadUpdate[] = [];
  await runWan2GPModelDownload("wangp/flux", "wangp.flux", signal, (update) => updates.push(update));
  return updates;
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.findInstalledWan2GP.mockResolvedValue(install);
});

describe("Wan2GP model download", () => {
  it("downloads with Wan2GP's downloader and reports progress in the download manager's shape", async () => {
    runtime.downloadWan2GPModel.mockImplementation(async (_install, _model, options) => {
      options.onProgress({ downloadedBytes: 2048, currentFiles: ["flux1-dev_bf16.safetensors"] });
      return "available";
    });
    const updates = await run();
    expect(runtime.downloadWan2GPModel).toHaveBeenCalledWith(install, "flux", expect.anything());
    expect(updates.map((update) => update.status)).toEqual(["start", "progress", "completed"]);
    expect(updates[1]).toMatchObject({
      repo_id: "wangp/flux",
      model_type: "wangp.flux",
      downloaded_bytes: 2048,
      current_files: ["flux1-dev_bf16.safetensors"],
      total_bytes: 0
    });
    expect(updates[2]).toMatchObject({ downloaded_bytes: 2048 });
  });

  it("fails when the files are still incomplete afterwards", async () => {
    runtime.downloadWan2GPModel.mockResolvedValue("partial");
    const updates = await run();
    expect(updates.at(-1)).toMatchObject({ status: "error", error: expect.stringMatching(/as partial/) });
  });

  it("reports the downloader's error, and a cancel as cancelled", async () => {
    runtime.downloadWan2GPModel.mockRejectedValue(new Error("HTTP 404"));
    expect((await run()).at(-1)).toMatchObject({ status: "error", error: "HTTP 404" });
    const controller = new AbortController();
    runtime.downloadWan2GPModel.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    expect((await run(controller.signal)).at(-1)).toMatchObject({ status: "cancelled" });
  });

  it("asks for the install when Wan2GP is not installed", async () => {
    runtime.findInstalledWan2GP.mockResolvedValue(null);
    const updates = await run();
    expect(updates).toEqual([expect.objectContaining({ status: "error", error: expect.stringMatching(/Package Manager/) })]);
    expect(runtime.downloadWan2GPModel).not.toHaveBeenCalled();
  });
});
