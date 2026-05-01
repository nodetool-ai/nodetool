import { checkHfCache, HfCacheCheckResponse } from "../checkHfCache";

const mockMutate = jest.fn();

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      huggingfaceCheckCache: {
        mutate: (...args: unknown[]) => mockMutate(...args)
      }
    }
  }
}));

describe("checkHfCache", () => {
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

    mockMutate.mockResolvedValueOnce(mockResponse);

    const result = await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: "*.safetensors",
    });

    expect(result).toEqual(mockResponse);
    expect(mockMutate).toHaveBeenCalledWith({
      repo_id: "test/repo",
      allow_pattern: "*.safetensors",
    });
  });

  it("throws error with status code on failure", async () => {
    mockMutate.mockRejectedValueOnce(
      new Error("HF cache check failed (404): Repo not found")
    );

    await expect(
      checkHfCache({ repo_id: "nonexistent/repo" })
    ).rejects.toThrow("HF cache check failed (404): Repo not found");
  });

  it("handles missing error text", async () => {
    mockMutate.mockRejectedValueOnce(
      new Error("HF cache check failed (500): Internal Server Error")
    );

    await expect(
      checkHfCache({ repo_id: "test/repo" })
    ).rejects.toThrow("HF cache check failed (500): Internal Server Error");
  });

  it("sends request with ignore_pattern", async () => {
    mockMutate.mockResolvedValueOnce({
      repo_id: "test/repo",
      all_present: false,
      total_files: 10,
      missing: ["file1.bin"],
    });

    await checkHfCache({
      repo_id: "test/repo",
      ignore_pattern: "*.txt",
    });

    expect(mockMutate).toHaveBeenCalledWith({
      repo_id: "test/repo",
      ignore_pattern: "*.txt",
    });
  });

  it("handles null allow_pattern and ignore_pattern", async () => {
    mockMutate.mockResolvedValueOnce({
      repo_id: "test/repo",
      all_present: true,
      total_files: 1,
      missing: [],
    });

    await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: null,
      ignore_pattern: null,
    });

    expect(mockMutate).toHaveBeenCalledWith({
      repo_id: "test/repo",
      allow_pattern: null,
      ignore_pattern: null,
    });
  });

  it("handles array patterns", async () => {
    mockMutate.mockResolvedValueOnce({
      repo_id: "test/repo",
      all_present: true,
      total_files: 2,
      missing: [],
    });

    await checkHfCache({
      repo_id: "test/repo",
      allow_pattern: ["*.safetensors", "*.bin"],
    });

    expect(mockMutate).toHaveBeenCalledWith({
      repo_id: "test/repo",
      allow_pattern: ["*.safetensors", "*.bin"],
    });
  });
});
