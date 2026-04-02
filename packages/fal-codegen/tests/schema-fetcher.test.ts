import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Mock node:fs/promises before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

import { SchemaFetcher } from "../src/schema-fetcher.js";
import * as fsPromises from "node:fs/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const ENDPOINT = "fal-ai/flux/dev";
const FAKE_SCHEMA = { openapi: "3.0.0", info: { title: "Flux Dev" } };

// Cast mocks for ergonomic typing
const readFileMock = fsPromises.readFile as ReturnType<typeof vi.fn>;
const writeFileMock = fsPromises.writeFile as ReturnType<typeof vi.fn>;
const mkdirMock = fsPromises.mkdir as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SchemaFetcher", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Default: cache miss
    readFileMock.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    writeFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);

    // Default: successful fetch
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => FAKE_SCHEMA
    } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);
  });

  // -------------------------------------------------------------------------
  // cacheKey
  // -------------------------------------------------------------------------

  describe("cacheKey()", () => {
    it("returns the first 16 hex chars of the SHA-256 of the endpoint ID", () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const expected = sha256hex(ENDPOINT).slice(0, 16);
      expect(fetcher.cacheKey(ENDPOINT)).toBe(expected);
    });

    it("produces a 16-character string", () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      expect(fetcher.cacheKey(ENDPOINT)).toHaveLength(16);
    });

    it("produces different keys for different endpoint IDs", () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      expect(fetcher.cacheKey("fal-ai/flux/dev")).not.toBe(
        fetcher.cacheKey("fal-ai/flux/schnell")
      );
    });

    it("is deterministic", () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      expect(fetcher.cacheKey(ENDPOINT)).toBe(fetcher.cacheKey(ENDPOINT));
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — cache hit
  // -------------------------------------------------------------------------

  describe("fetchSchema() with useCache=true (default)", () => {
    it("returns cached data without calling fetch when cache hit", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_SCHEMA));

      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const result = await fetcher.fetchSchema(ENDPOINT);

      expect(result).toEqual(FAKE_SCHEMA);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("calls fetch and writes cache on cache miss", async () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const result = await fetcher.fetchSchema(ENDPOINT);

      expect(result).toEqual(FAKE_SCHEMA);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${ENDPOINT}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(writeFileMock).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — cache bypass
  // -------------------------------------------------------------------------

  describe("fetchSchema() with useCache=false", () => {
    it("always calls fetch even when a cached file exists", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_SCHEMA));

      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const result = await fetcher.fetchSchema(ENDPOINT, false);

      expect(result).toEqual(FAKE_SCHEMA);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("writes the newly fetched schema to cache", async () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      await fetcher.fetchSchema(ENDPOINT, false);

      expect(mkdirMock).toHaveBeenCalledOnce();
      expect(writeFileMock).toHaveBeenCalledOnce();
      const [, writtenContent] = writeFileMock.mock.calls[0] as [
        unknown,
        string
      ];
      expect(JSON.parse(writtenContent)).toEqual(FAKE_SCHEMA);
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — HTTP error
  // -------------------------------------------------------------------------

  describe("fetchSchema() — HTTP error handling", () => {
    it("throws when the HTTP response is not ok", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({})
      } as unknown as Response);

      const fetcher = new SchemaFetcher("/tmp/test-cache");
      await expect(fetcher.fetchSchema(ENDPOINT, false)).rejects.toThrow(/404/);
    });
  });

  // -------------------------------------------------------------------------
  // getCachedSchema
  // -------------------------------------------------------------------------

  describe("getCachedSchema()", () => {
    it("returns the parsed schema when the cache file exists", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_SCHEMA));

      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const result = await fetcher.getCachedSchema(ENDPOINT);

      expect(result).toEqual(FAKE_SCHEMA);
    });

    it("returns null when the cache file does not exist", async () => {
      const fetcher = new SchemaFetcher("/tmp/test-cache");
      const result = await fetcher.getCachedSchema(ENDPOINT);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Default cache directory
  // -------------------------------------------------------------------------

  describe("default cacheDir", () => {
    it("uses .codegen-cache relative to cwd when no cacheDir is provided", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_SCHEMA));

      const fetcher = new SchemaFetcher();
      await fetcher.fetchSchema(ENDPOINT);

      const [calledPath] = readFileMock.mock.calls[0] as [string];
      expect(calledPath).toContain(".codegen-cache");
    });
  });
});
