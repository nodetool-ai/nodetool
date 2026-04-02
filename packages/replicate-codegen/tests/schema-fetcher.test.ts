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

const MODEL_ID = "stability-ai/sdxl";

const FAKE_MODEL_RESPONSE = {
  description: "A text-to-image model",
  latest_version: { id: "abc123def456" }
};

const FAKE_VERSION_RESPONSE = {
  openapi_schema: {
    components: {
      schemas: {
        Input: {
          type: "object",
          properties: {
            prompt: { type: "string" }
          },
          required: ["prompt"]
        },
        Output: {
          type: "array",
          items: { type: "string", format: "uri" }
        }
      }
    }
  }
};

const FAKE_CACHED_SCHEMA = {
  modelId: MODEL_ID,
  owner: "stability-ai",
  name: "sdxl",
  version: "abc123def456",
  description: "A text-to-image model",
  inputSchema: { type: "object", properties: { prompt: { type: "string" } } },
  outputSchema: {}
};

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

    // Default: successful two-step Replicate API fetch
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        json: async () => FAKE_MODEL_RESPONSE
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        json: async () => FAKE_VERSION_RESPONSE
      } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);
  });

  // -------------------------------------------------------------------------
  // cacheKey
  // -------------------------------------------------------------------------

  describe("cacheKey()", () => {
    it("returns the first 16 hex chars of the SHA-256 of the model ID", () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const expected = sha256hex(MODEL_ID).slice(0, 16);
      expect(fetcher.cacheKey(MODEL_ID)).toBe(expected);
    });

    it("produces a 16-character string", () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      expect(fetcher.cacheKey(MODEL_ID)).toHaveLength(16);
    });

    it("produces different keys for different model IDs", () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      expect(fetcher.cacheKey("stability-ai/sdxl")).not.toBe(
        fetcher.cacheKey("black-forest-labs/flux-schnell")
      );
    });

    it("is deterministic", () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      expect(fetcher.cacheKey(MODEL_ID)).toBe(fetcher.cacheKey(MODEL_ID));
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — cache hit
  // -------------------------------------------------------------------------

  describe("fetchSchema() with useCache=true (default)", () => {
    it("returns cached data without calling fetch when cache hit", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_CACHED_SCHEMA));

      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.fetchSchema(MODEL_ID);

      expect(result).toEqual(FAKE_CACHED_SCHEMA);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("calls fetch and writes cache on cache miss", async () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.fetchSchema(MODEL_ID);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.replicate.com/v1/models/stability-ai/sdxl",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(writeFileMock).toHaveBeenCalledOnce();
      expect(result.modelId).toBe(MODEL_ID);
      expect(result.owner).toBe("stability-ai");
      expect(result.name).toBe("sdxl");
    });

    it("stores the version ID in the returned schema", async () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.fetchSchema(MODEL_ID);

      expect(result.version).toBe("abc123def456");
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — cache bypass
  // -------------------------------------------------------------------------

  describe("fetchSchema() with useCache=false", () => {
    it("always calls fetch even when a cached file exists", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_CACHED_SCHEMA));

      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.fetchSchema(MODEL_ID, false);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.modelId).toBe(MODEL_ID);
    });

    it("writes the newly fetched schema to cache", async () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      await fetcher.fetchSchema(MODEL_ID, false);

      expect(mkdirMock).toHaveBeenCalledOnce();
      expect(writeFileMock).toHaveBeenCalledOnce();
      const [, writtenContent] = writeFileMock.mock.calls[0] as [
        unknown,
        string
      ];
      const written = JSON.parse(writtenContent);
      expect(written.modelId).toBe(MODEL_ID);
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — HTTP error handling
  // -------------------------------------------------------------------------

  describe("fetchSchema() — HTTP error handling", () => {
    it("throws when the HTTP response is not ok (404)", async () => {
      vi.resetAllMocks();
      readFileMock.mockRejectedValue(new Error("ENOENT"));
      fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "Model not found",
        json: async () => ({})
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      await expect(fetcher.fetchSchema(MODEL_ID, false)).rejects.toThrow(/404/);
    });

    it("throws for invalid model ID format", async () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      await expect(
        fetcher.fetchSchema("invalid-no-slash", false)
      ).rejects.toThrow(/Invalid model ID/);
    });

    it("throws when model has no latest version", async () => {
      vi.resetAllMocks();
      readFileMock.mockRejectedValue(new Error("ENOENT"));
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        json: async () => ({ description: "No version", latest_version: null })
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      await expect(fetcher.fetchSchema(MODEL_ID, false)).rejects.toThrow(
        /no latest version/
      );
    });
  });

  // -------------------------------------------------------------------------
  // fetchSchema — missing API token
  // -------------------------------------------------------------------------

  describe("fetchSchema() — missing API token", () => {
    it("throws when no API token is set and fetch is attempted", async () => {
      const originalToken = process.env.REPLICATE_API_TOKEN;
      delete process.env.REPLICATE_API_TOKEN;

      const fetcher = new SchemaFetcher(undefined, "/tmp/test-cache");
      await expect(fetcher.fetchSchema(MODEL_ID, false)).rejects.toThrow(
        /REPLICATE_API_TOKEN/
      );

      if (originalToken !== undefined) {
        process.env.REPLICATE_API_TOKEN = originalToken;
      }
    });
  });

  // -------------------------------------------------------------------------
  // getCachedSchema
  // -------------------------------------------------------------------------

  describe("getCachedSchema()", () => {
    it("returns the parsed schema when the cache file exists", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_CACHED_SCHEMA));

      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.getCachedSchema(MODEL_ID);

      expect(result).toEqual(FAKE_CACHED_SCHEMA);
    });

    it("returns null when the cache file does not exist", async () => {
      const fetcher = new SchemaFetcher("test-token", "/tmp/test-cache");
      const result = await fetcher.getCachedSchema(MODEL_ID);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Default cache directory
  // -------------------------------------------------------------------------

  describe("default cacheDir", () => {
    it("uses .schema-cache/replicate relative to cwd when no cacheDir is provided", async () => {
      readFileMock.mockResolvedValue(JSON.stringify(FAKE_CACHED_SCHEMA));

      const fetcher = new SchemaFetcher("test-token");
      await fetcher.fetchSchema(MODEL_ID);

      const [calledPath] = readFileMock.mock.calls[0] as [string];
      expect(calledPath).toContain(".schema-cache");
      expect(calledPath).toContain("replicate");
    });
  });
});
