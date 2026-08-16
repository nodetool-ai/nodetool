import {
  RUNTIME_LABELS,
  RUNTIME_TO_PACKAGE_ID,
  getCachedRuntimeStatuses,
  refreshRuntimeStatuses,
  ensureRuntimeStatuses
} from "../NodeDependencyWarning.helpers";
import { trpcClient } from "../../../trpc/client";
import { asMock } from "../../../test-utils/doubles";

const runtimeStatusesQuery = asMock(trpcClient.packs.runtimeStatuses
  .query);

describe("RUNTIME_LABELS", () => {
  it("maps every runtime to a human-readable label", () => {
    expect(RUNTIME_LABELS["ffmpeg"]).toBe("FFmpeg & Codecs");
    expect(RUNTIME_LABELS["python"]).toBe("Python");
    expect(RUNTIME_LABELS["yt-dlp"]).toBe("yt-dlp");
    expect(RUNTIME_LABELS["pdftotext"]).toBe("PDF Tools (Poppler)");
  });
});

describe("RUNTIME_TO_PACKAGE_ID", () => {
  it("has the same keys as RUNTIME_LABELS", () => {
    const labelKeys = Object.keys(RUNTIME_LABELS).sort();
    const packageKeys = Object.keys(RUNTIME_TO_PACKAGE_ID).sort();
    expect(packageKeys).toEqual(labelKeys);
  });
});

describe("getCachedRuntimeStatuses", () => {
  it("returns null before any refresh", () => {
    expect(getCachedRuntimeStatuses()).toBeNull();
  });
});

describe("refreshRuntimeStatuses", () => {
  afterEach(() => {
    runtimeStatusesQuery.mockReset();
    runtimeStatusesQuery.mockResolvedValue({ statuses: [] });
  });

  it("asks the server when window.api is unavailable", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    w.api = undefined;
    runtimeStatusesQuery.mockResolvedValue({
      statuses: [{ id: "ffmpeg", installed: true }]
    });
    await refreshRuntimeStatuses();
    expect(runtimeStatusesQuery).toHaveBeenCalled();
    expect(getCachedRuntimeStatuses()?.["ffmpeg"]).toBe(true);
    w.api = origApi;
  });

  it("asks the server when packages.getRuntimeStatuses is missing", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    w.api = { packages: {} };
    runtimeStatusesQuery.mockResolvedValue({
      statuses: [{ id: "ffmpeg", installed: false }]
    });
    await refreshRuntimeStatuses();
    expect(runtimeStatusesQuery).toHaveBeenCalled();
    expect(getCachedRuntimeStatuses()?.["ffmpeg"]).toBe(false);
    w.api = origApi;
  });

  it("prefers the desktop IPC when it is there", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    const getRuntimeStatuses = jest
      .fn()
      .mockResolvedValue([{ id: "ffmpeg", installed: true }]);
    w.api = { packages: { getRuntimeStatuses } };
    await refreshRuntimeStatuses();
    expect(getRuntimeStatuses).toHaveBeenCalled();
    expect(runtimeStatusesQuery).not.toHaveBeenCalled();
    expect(getCachedRuntimeStatuses()?.["ffmpeg"]).toBe(true);
    w.api = origApi;
  });
});

describe("ensureRuntimeStatuses", () => {
  it("resolves without error when api is unavailable", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    w.api = undefined;
    await expect(ensureRuntimeStatuses(true)).resolves.toBeUndefined();
    w.api = origApi;
  });
});
