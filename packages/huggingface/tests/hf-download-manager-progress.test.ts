import { beforeEach, describe, expect, it, vi } from "vitest";

const { asyncHfDownloadMock, listFilesMock } = vi.hoisted(() => ({
  asyncHfDownloadMock: vi.fn(),
  listFilesMock: vi.fn()
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
});
