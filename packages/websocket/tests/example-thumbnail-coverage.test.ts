import { describe, it, expect, vi, beforeEach } from "vitest";

const statSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  statSync: (p: string) => statSyncMock(p),
  readFileSync: (p: string) => readFileSyncMock(p)
}));

import { thumbnailHash, withCacheBuster } from "../src/lib/example-thumbnail.js";

describe("thumbnailHash", () => {
  beforeEach(() => {
    statSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("returns null when statSync throws (missing file)", () => {
    statSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(thumbnailHash("/missing.jpg")).toBeNull();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("returns an 8-char hex hash of file contents", () => {
    statSyncMock.mockReturnValue({ mtimeMs: 100 });
    readFileSyncMock.mockReturnValue(Buffer.from("hello world"));
    const h = thumbnailHash("/a.jpg");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("memoises by (path, mtime): second call with same mtime does not re-read", () => {
    statSyncMock.mockReturnValue({ mtimeMs: 200 });
    readFileSyncMock.mockReturnValue(Buffer.from("cached"));
    const first = thumbnailHash("/cache.jpg");
    const second = thumbnailHash("/cache.jpg");
    expect(second).toBe(first);
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("re-hashes when mtime changes", () => {
    statSyncMock.mockReturnValueOnce({ mtimeMs: 1 });
    readFileSyncMock.mockReturnValueOnce(Buffer.from("v1"));
    const first = thumbnailHash("/change.jpg");

    statSyncMock.mockReturnValueOnce({ mtimeMs: 2 });
    readFileSyncMock.mockReturnValueOnce(Buffer.from("v2-different"));
    const second = thumbnailHash("/change.jpg");

    expect(second).not.toBe(first);
    expect(readFileSyncMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when readFileSync throws after a successful stat", () => {
    statSyncMock.mockReturnValue({ mtimeMs: 5 });
    readFileSyncMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    expect(thumbnailHash("/unreadable.jpg")).toBeNull();
  });

  it("produces a stable md5 for known input", () => {
    statSyncMock.mockReturnValue({ mtimeMs: 999 });
    readFileSyncMock.mockReturnValue(Buffer.from("abc"));
    // md5("abc") = 900150983cd24fb0d6963f7d28e17f72 -> first 8 = 90015098
    expect(thumbnailHash("/known.jpg")).toBe("90015098");
  });
});

describe("withCacheBuster", () => {
  beforeEach(() => {
    statSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("appends ?v=<hash> when the file is readable", () => {
    statSyncMock.mockReturnValue({ mtimeMs: 7 });
    readFileSyncMock.mockReturnValue(Buffer.from("abc"));
    expect(withCacheBuster("/thumb.jpg", "/known2.jpg")).toBe(
      "/thumb.jpg?v=90015098"
    );
  });

  it("returns the url unchanged when the file is missing", () => {
    statSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(withCacheBuster("/thumb.jpg", "/gone.jpg")).toBe("/thumb.jpg");
  });
});
