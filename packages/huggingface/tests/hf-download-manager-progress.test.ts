import { beforeEach, describe, expect, it, vi } from "vitest";

const { asyncHfDownloadMock, listFilesMock, llamaDownloadMock } = vi.hoisted(
  () => ({
    asyncHfDownloadMock: vi.fn(),
    listFilesMock: vi.fn(),
    llamaDownloadMock: vi.fn()
  })
);

vi.mock("../src/llama-cpp-download.js", () => ({
  downloadLlamaCppModel: llamaDownloadMock
}));

vi.mock("@huggingface/hub", () => ({
  listFiles: listFilesMock
}));

vi.mock("../src/hf-downloader.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/hf-downloader.js")>();
  return {
    ...original,
    asyncHfDownload: asyncHfDownloadMock,
    hfRepoCacheDir: () => "Z:/cache-that-does-not-exist"
  };
});

import { DownloadManager } from "../src/hf-download-manager.js";

describe("DownloadManager terminal progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("snaps successful under-reported byte progress to the total", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "file", path: "voice.json", size: 100 };
    });
    asyncHfDownloadMock.mockImplementation(
      async (
        _repoId: string,
        _path: string,
        opts: { progressCallback?: (delta: number) => void }
      ) => {
        opts.progressCallback?.(78);
        return "Z:/cache/voice.json";
      }
    );
    const updates: Array<{
      status: string;
      downloaded_bytes: number;
      total_bytes: number;
    }> = [];

    await new DownloadManager().startDownload("org/model", {
      onProgress: (update) => updates.push(update)
    });

    expect(updates.at(-1)).toMatchObject({
      status: "completed",
      downloaded_bytes: 100,
      total_bytes: 100
    });
  });

  it("authenticates with a per-download token over the manager's", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "file", path: "model.json", size: 1 };
    });
    asyncHfDownloadMock.mockResolvedValue("Z:/cache/model.json");

    await new DownloadManager("manager-token").startDownload("org/gated", {
      token: "settings-token"
    });

    expect(listFilesMock.mock.calls[0][0]).toMatchObject({
      accessToken: "settings-token"
    });
    expect(asyncHfDownloadMock.mock.calls[0][2]).toMatchObject({
      token: "settings-token"
    });
  });

  it("keeps a cacheDir download in the HF cache instead of the llama.cpp cache", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "file", path: "config.json", size: 1 };
    });
    asyncHfDownloadMock.mockResolvedValue("/custom/config.json");

    await new DownloadManager().startDownload("org/model", {
      cacheDir: "/custom"
    });

    expect(llamaDownloadMock).not.toHaveBeenCalled();
    expect(asyncHfDownloadMock.mock.calls[0][2]).toMatchObject({
      cacheDir: "/custom"
    });
  });

  it("downloads only GGUF files of a whole-repo llama_cpp request", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "file", path: "README.md", size: 1 };
      yield { type: "file", path: "config.json", size: 1 };
      yield { type: "file", path: "model-Q4_K_M.gguf", size: 1 };
    });
    llamaDownloadMock.mockResolvedValue("/llama/model.gguf");

    await new DownloadManager().startDownload("org/model-GGUF", {
      modelType: "llama_cpp"
    });

    expect(llamaDownloadMock.mock.calls.map((c) => c[1])).toEqual([
      "model-Q4_K_M.gguf"
    ]);
    expect(asyncHfDownloadMock).not.toHaveBeenCalled();
  });
});
