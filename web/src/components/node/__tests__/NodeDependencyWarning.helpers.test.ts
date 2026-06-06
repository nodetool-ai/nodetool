import {
  RUNTIME_LABELS,
  RUNTIME_TO_PACKAGE_ID,
  getCachedRuntimeStatuses,
  refreshRuntimeStatuses,
  ensureRuntimeStatuses
} from "../NodeDependencyWarning.helpers";

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
  it("returns early when window.api is unavailable", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    w.api = undefined;
    await expect(refreshRuntimeStatuses()).resolves.toBeUndefined();
    w.api = origApi;
  });

  it("returns early when packages.getRuntimeStatuses is missing", async () => {
    const w = window as unknown as Record<string, unknown>;
    const origApi = w.api;
    w.api = { packages: {} };
    await expect(refreshRuntimeStatuses()).resolves.toBeUndefined();
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
