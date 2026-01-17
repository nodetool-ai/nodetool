import { checkHfCache } from "../checkHfCache";

global.fetch = jest.fn();

describe("checkHfCache", () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns cache check response on success", async () => {
    const mockResponse: HfCacheCheckResponse = {
      repo_id: "test/repo",
      all_present: true,
      total_files: 5,
      missing: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
      status: 200,
      statusText: "OK",
      text: async () => "",
    } as unknown as Response);

    const result = await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: "*.safetensors",
    });

    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/models/huggingface/check_cache"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: "test/repo",
          allow_pattern: "*.safetensors",
        }),
      }
    );
  });

  it("throws error with status code on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Repo not found",
    } as unknown as Response);

    await expect(
      checkHfCache({ repo_id: "nonexistent/repo" })
    ).rejects.toThrow("HF cache check failed (404): Repo not found");
  });

  it("handles missing error text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "",
    } as unknown as Response);

    await expect(
      checkHfCache({ repo_id: "test/repo" })
    ).rejects.toThrow("HF cache check failed (500): Internal Server Error");
  });

  it("sends request with ignore_pattern", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo_id: "test/repo",
        all_present: false,
        total_files: 10,
        missing: ["file1.bin"],
      }),
      status: 200,
      statusText: "OK",
      text: async () => "",
    } as unknown as Response);

    await checkHfCache({
      repo_id: "test/repo",
      ignore_pattern: "*.txt",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          repo_id: "test/repo",
          ignore_pattern: "*.txt",
        }),
      })
    );
  });

  it("handles null allow_pattern and ignore_pattern", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo_id: "test/repo",
        all_present: true,
        total_files: 1,
        missing: [],
      }),
      status: 200,
      statusText: "OK",
      text: async () => "",
    } as unknown as Response);

    await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: null,
      ignore_pattern: null,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          repo_id: "test/repo",
          allow_pattern: null,
          ignore_pattern: null,
        }),
      })
    );
  });

  it("handles array patterns", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        repo_id: "test/repo",
        all_present: true,
        total_files: 2,
        missing: [],
      }),
      status: 200,
      statusText: "OK",
      text: async () => "",
    } as unknown as Response);

    await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: ["*.safetensors", "*.bin"],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          repo_id: "test/repo",
          allow_pattern: ["*.safetensors", "*.bin"],
        }),
      })
    );
  });
});
