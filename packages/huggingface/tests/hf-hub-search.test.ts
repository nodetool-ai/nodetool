import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  searchHfHub,
  listAllHfModels,
  SUPPORTED_MODEL_TYPES
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockResponse {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body: unknown;
}

function fetchMockOnce(response: MockResponse) {
  const fn = vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    headers: new Headers(),
    url: "",
    json: async () => response.body,
    text: async () =>
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body)
  }));
  (globalThis as { fetch: unknown }).fetch = fn as unknown;
  return fn;
}

const SAMPLE_MODEL = {
  id: "owner/my-model",
  pipeline_tag: "text-to-image",
  tags: ["diffusers"],
  downloads: 100,
  likes: 5,
  library_name: "diffusers"
};

// ---------------------------------------------------------------------------
// Env shim so resolveHfToken doesn't read ~/.cache/huggingface/token
// ---------------------------------------------------------------------------

let savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_HOME",
  "HF_TOKEN_PATH",
  "HF_HUB_DISABLE_IMPLICIT_TOKEN"
];

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1";
  process.env["HF_HOME"] = "/tmp/hf-hub-search-test-no-token";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// searchHfHub
// ---------------------------------------------------------------------------

describe("searchHfHub", () => {
  it("calls the HF API with params derived from the model type", async () => {
    const fn = fetchMockOnce({ body: [SAMPLE_MODEL] });
    const results = await searchHfHub({ modelType: "hf.flux", limit: 5 });
    expect(fn).toHaveBeenCalledTimes(1);
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toMatch(/^https:\/\/huggingface\.co\/api\/models\?/);
    expect(url).toContain("limit=5");
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("owner/my-model");
    expect(results[0]!.model_type).toBe("hf.flux");
    expect(results[0]!.repo_id).toBe("owner/my-model");
  });

  it("post-filters by library_name=gguf for SUPPORTED_MODEL_TYPES entries", async () => {
    const fn = fetchMockOnce({
      body: [
        { id: "owner/qwen2-gguf", library_name: "gguf" },
        { id: "owner/qwen2-other", library_name: "transformers" }
      ]
    });
    const results = await searchHfHub({ modelType: "qwen2" });
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toMatch(/search=qwen2/);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("owner/qwen2-gguf");
  });

  it("throws for GENERIC types without --task", async () => {
    await expect(
      searchHfHub({ modelType: "hf.text_to_image" })
    ).rejects.toThrow(/requires --task/);
  });

  it("passes --task through as pipeline_tag (normalizing underscores)", async () => {
    const fn = fetchMockOnce({ body: [] });
    await searchHfHub({
      modelType: "hf.text_to_image",
      task: "text_to_image"
    });
    const url = String(fn.mock.calls[0]![0]);
    expect(url).toContain("pipeline_tag=text-to-image");
  });

  it("throws on unknown model types", async () => {
    await expect(
      searchHfHub({ modelType: "not_a_real_type" })
    ).rejects.toThrow(/Unknown model type/);
  });

  it("throws on non-200 HTTP responses", async () => {
    fetchMockOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      body: "boom"
    });
    await expect(searchHfHub({ modelType: "hf.flux" })).rejects.toThrow(
      /HF Hub search failed/
    );
  });
});

// ---------------------------------------------------------------------------
// listAllHfModels
// ---------------------------------------------------------------------------

describe("listAllHfModels", () => {
  it("iterates non-generic types, caps at limit, dedupes by id", async () => {
    let call = 0;
    const fn = vi.fn(async () => {
      call += 1;
      const body = [
        { id: `owner/model-${call}-a` },
        { id: `owner/shared` }, // duplicate across calls — dedup
        { id: `owner/model-${call}-b` }
      ];
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        url: "",
        json: async () => body,
        text: async () => JSON.stringify(body)
      };
    });
    (globalThis as { fetch: unknown }).fetch = fn as unknown;

    const results = await listAllHfModels({ limit: 5 });
    expect(results.length).toBeLessThanOrEqual(5);
    const ids = results.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Should have hit at least one of the non-generic supported types.
    expect(fn).toHaveBeenCalled();
  });

  it("skips a type on failure and continues with the rest", async () => {
    let call = 0;
    const fn = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          headers: new Headers(),
          url: "",
          json: async () => ({}),
          text: async () => "boom"
        };
      }
      const body = [{ id: `owner/ok-${call}`, library_name: "gguf" }];
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        url: "",
        json: async () => body,
        text: async () => JSON.stringify(body)
      };
    });
    (globalThis as { fetch: unknown }).fetch = fn as unknown;
    const logErr = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await listAllHfModels({ limit: 3 });
    // first type throws, later ones succeed
    expect(results.length).toBeGreaterThan(0);
    expect(logErr).toHaveBeenCalled();
  });
});

describe("constants", () => {
  it("re-exports SUPPORTED_MODEL_TYPES from the package index", () => {
    expect(Array.isArray(SUPPORTED_MODEL_TYPES)).toBe(true);
    expect(SUPPORTED_MODEL_TYPES.length).toBeGreaterThan(0);
  });
});
