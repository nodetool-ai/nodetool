/**
 * `download_hf_model` and `get_hf_download` — an approval-gated Hugging Face
 * download into the host cache, and its progress.
 *
 * The Hugging Face package is mocked: the plan, the manager and the secrets
 * are the boundary, and no test reaches the Hub or writes to disk.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { CapabilityGate } from "../src/capabilities/index.js";
import type { ApprovalRequest } from "../src/tools/tool-permissions.js";

const hf = vi.hoisted(() => ({
  planHfDownload: vi.fn(),
  startDownload: vi.fn(),
  getDownloadState: vi.fn(),
  getDownloadManager: vi.fn(),
  getExistingDownloadManager: vi.fn(),
  resolveWorkerHfToken: vi.fn(),
  resolveStoredHfEndpoint: vi.fn()
}));

vi.mock("@nodetool-ai/huggingface", () => ({
  planHfDownload: hf.planHfDownload,
  getDownloadManager: hf.getDownloadManager,
  getExistingDownloadManager: hf.getExistingDownloadManager,
  resolveWorkerHfToken: hf.resolveWorkerHfToken,
  resolveStoredHfEndpoint: hf.resolveStoredHfEndpoint
}));

import { createCapabilityRun } from "../src/capabilities/index.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import {
  MIN_FREE_BYTES_AFTER_DOWNLOAD,
  setFreeBytesProbeForTesting,
  type FreeBytesProbe
} from "../src/capabilities/hf-downloads.js";

const GB = 1024 ** 3;
const ctx = {
  userId: "hf-user",
  getSecret: async (key: string) => (key === "HF_TOKEN" ? "hf_secret" : null)
} as unknown as ProcessingContext;

let approvals: ApprovalRequest[];
let answer: "allow" | "deny" | "allow_for_chat";
let previousProbe: FreeBytesProbe;
let freeBytes: number;

function gate(mode: CapabilityGate["mode"] = "auto"): CapabilityGate {
  return {
    mode,
    sessionAllow: new Set<string>(),
    requestApproval: async (request) => {
      approvals.push(request);
      return answer;
    }
  };
}

function toolFor(name: string, runGate: CapabilityGate = gate()) {
  return toolForCapabilityName(name, () => createCapabilityRun({ context: ctx, gate: runGate }));
}

beforeEach(() => {
  vi.clearAllMocks();
  approvals = [];
  answer = "allow";
  freeBytes = 100 * GB;
  previousProbe = setFreeBytesProbeForTesting(async () => freeBytes);
  delete process.env["NODETOOL_ENV"];
  hf.resolveWorkerHfToken.mockImplementation(async (read: (k: string) => Promise<string | null>) =>
    (await read("HF_TOKEN")) ?? undefined
  );
  hf.resolveStoredHfEndpoint.mockResolvedValue("https://huggingface.co");
  hf.planHfDownload.mockResolvedValue({
    files: [
      { path: "config.json", size: 1024 },
      { path: "model.safetensors", size: 2 * GB }
    ],
    totalBytes: 2 * GB + 1024,
    cachedFiles: ["tokenizer.json"]
  });
  hf.startDownload.mockResolvedValue(undefined);
  hf.getDownloadManager.mockReturnValue({ startDownload: hf.startDownload });
  hf.getExistingDownloadManager.mockReturnValue({ getDownloadState: hf.getDownloadState });
});

afterEach(() => {
  setFreeBytesProbeForTesting(previousProbe);
  delete process.env["NODETOOL_ENV"];
});

describe("download_hf_model", () => {
  it("asks with the repo and size, then starts the download for the run's user", async () => {
    const result = await toolFor("download_hf_model").process(ctx, { repo_id: "org/model" });

    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      toolName: "download_hf_model",
      category: "external",
      args: { repo_id: "org/model" },
      ruleKey: "download_hf_model:org/model"
    });
    expect(approvals[0]!.message).toContain("org/model");
    expect(approvals[0]!.message).toContain("2 files, 2.0 GB");
    expect(hf.getDownloadManager).toHaveBeenCalledWith("hf-user");
    expect(hf.startDownload).toHaveBeenCalledWith("org/model", expect.objectContaining({
      path: null,
      token: "hf_secret",
      endpoint: "https://huggingface.co"
    }));
    expect(result).toMatchObject({
      status: "started",
      repo_id: "org/model",
      files: 2,
      total_bytes: 2 * GB + 1024,
      cached_files: 1
    });
  });

  it("asks in auto mode too, and starts nothing when the user declines", async () => {
    answer = "deny";

    const result = await toolFor("download_hf_model").process(ctx, { repo_id: "org/model" });

    expect(approvals).toHaveLength(1);
    expect(hf.startDownload).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: "permission_denied" });
  });

  it("remembers a standing answer for that repository only", async () => {
    answer = "allow_for_chat";
    const runGate = gate();
    const tool = toolFor("download_hf_model", runGate);

    await tool.process(ctx, { repo_id: "org/model" });
    await tool.process(ctx, { repo_id: "org/model" });
    await tool.process(ctx, { repo_id: "org/other" });

    expect(approvals.map((a) => a.ruleKey)).toEqual([
      "download_hf_model:org/model",
      "download_hf_model:org/other"
    ]);
    expect(hf.startDownload).toHaveBeenCalledTimes(3);
  });

  it("refuses before asking when the download would leave too little free space", async () => {
    freeBytes = 2 * GB + MIN_FREE_BYTES_AFTER_DOWNLOAD - 1;

    const result = await toolFor("download_hf_model").process(ctx, { repo_id: "org/model" });

    expect(result).toMatchObject({ error: "insufficient_disk_space" });
    expect(approvals).toHaveLength(0);
    expect(hf.startDownload).not.toHaveBeenCalled();
  });

  it("accepts a download that leaves exactly the minimum free", async () => {
    freeBytes = 2 * GB + 1024 + MIN_FREE_BYTES_AFTER_DOWNLOAD;

    const result = await toolFor("download_hf_model").process(ctx, { repo_id: "org/model" });

    expect(result).toMatchObject({ status: "started" });
  });

  it("does not ask when every selected file is already cached", async () => {
    hf.planHfDownload.mockResolvedValue({ files: [], totalBytes: 0, cachedFiles: ["a.gguf"] });

    const result = await toolFor("download_hf_model").process(ctx, {
      repo_id: "org/model",
      path: "a.gguf"
    });

    expect(result).toEqual({ status: "already_cached", repo_id: "org/model", path: "a.gguf", cached_files: 1 });
    expect(approvals).toHaveLength(0);
    expect(hf.startDownload).not.toHaveBeenCalled();
  });

  it("refuses on a production server without listing the repository", async () => {
    process.env["NODETOOL_ENV"] = "production";

    const result = await toolFor("download_hf_model").process(ctx, { repo_id: "org/model" });

    expect(result).toEqual({ error: "Hugging Face downloads are disabled on a production server." });
    expect(hf.planHfDownload).not.toHaveBeenCalled();
  });

  it("rejects repository ids and paths that are not inside a repository", async () => {
    for (const args of [
      { repo_id: "model" },
      { repo_id: "../etc" },
      { repo_id: "org/../x" },
      { repo_id: "org/model", path: "/etc/passwd" },
      { repo_id: "org/model", path: "a/../../b" }
    ]) {
      const result = (await toolFor("download_hf_model").process(ctx, args)) as { error?: string };
      expect(result.error, JSON.stringify(args)).toMatch(/must be/);
    }
    expect(hf.planHfDownload).not.toHaveBeenCalled();
  });

  it("is blocked in plan mode by the permission gate", async () => {
    const result = await toolFor("download_hf_model", gate("plan")).process(ctx, { repo_id: "org/model" });

    expect(result).toMatchObject({ error: "blocked_in_plan_mode" });
    expect(hf.planHfDownload).not.toHaveBeenCalled();
  });
});

describe("get_hf_download", () => {
  it("reports the manager's state for the run's user", async () => {
    hf.getDownloadState.mockReturnValue({
      repoId: "org/model",
      path: null,
      modelType: null,
      downloadedBytes: 10,
      totalBytes: 20,
      status: "progress",
      downloadedFiles: ["tokenizer.json"],
      currentFiles: ["model.safetensors"],
      totalFiles: 2,
      errorMessage: null
    });

    const result = await toolFor("get_hf_download").process(ctx, { repo_id: "org/model" });

    expect(hf.getExistingDownloadManager).toHaveBeenCalledWith("hf-user");
    expect(hf.getDownloadState).toHaveBeenCalledWith("org/model");
    expect(result).toEqual({
      status: "progress",
      repo_id: "org/model",
      path: null,
      downloaded_bytes: 10,
      total_bytes: 20,
      downloaded_files: 1,
      total_files: 2,
      current_files: ["model.safetensors"]
    });
  });

  it("returns unknown for a download this process has not run", async () => {
    hf.getExistingDownloadManager.mockReturnValue(null);

    const result = await toolFor("get_hf_download").process(ctx, { repo_id: "org/model", path: "a.gguf" });

    expect(result).toEqual({ status: "unknown", repo_id: "org/model", path: "a.gguf" });
  });
});
