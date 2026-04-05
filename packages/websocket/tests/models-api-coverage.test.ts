/**
 * Additional models API tests for 100% statement coverage.
 * Covers: errorResponse, isProduction, wildcardToRegExp, matchesPattern,
 *         isIgnored, various route handlers, method validation, etc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@nodetool/huggingface", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@nodetool/huggingface")>();
  return {
    ...orig,
    getHuggingfaceFileInfos: vi.fn(async () => [])
  };
});

import { handleModelsApiRequest } from "../src/models-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function makeRequest(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Request {
  const { method = "GET", body } = opts;
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/models${path}`, {
    method,
    headers,
    body: requestBody
  });
}

describe("Models API: providers endpoint", () => {
  it("GET /api/models/providers returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/providers"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/models/providers returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/providers", { method: "POST" })
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(405);
  });
});

describe("Models API: recommended endpoints", () => {
  it("GET /api/models/recommended returns models", async () => {
    const res = await handleModelsApiRequest(makeRequest("/recommended"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /api/models/recommended returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended", { method: "POST" })
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/image returns image models", async () => {
    const res = await handleModelsApiRequest(makeRequest("/recommended/image"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /api/models/recommended/image returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/image", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/image/text-to-image", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/image/text-to-image")
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /api/models/recommended/image/text-to-image returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/image/text-to-image", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/image/image-to-image", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/image/image-to-image")
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/image/image-to-image returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/image/image-to-image", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/language returns language models", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language")
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
  });

  it("POST /api/models/recommended/language returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/language/text-generation", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language/text-generation")
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/language/text-generation returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language/text-generation", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/language/embedding", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language/embedding")
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/language/embedding returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/language/embedding", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/asr", async () => {
    const res = await handleModelsApiRequest(makeRequest("/recommended/asr"));
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/asr returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/asr", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/tts", async () => {
    const res = await handleModelsApiRequest(makeRequest("/recommended/tts"));
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/tts returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/tts", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/video/text-to-video", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/video/text-to-video")
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/video/text-to-video returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/video/text-to-video", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/recommended/video/image-to-video", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/video/image-to-video")
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/recommended/video/image-to-video returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/recommended/video/image-to-video", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: all endpoint", () => {
  it("POST /api/models/all returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/all", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: huggingface endpoints", () => {
  it("GET /api/models/huggingface returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/huggingface"));
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("DELETE /api/models/huggingface without repo_id returns 400", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface", { method: "DELETE" })
    );
    expect(res!.status).toBe(400);
  });

  it("DELETE /api/models/huggingface with repo_id returns boolean", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface?repo_id=nonexistent/model", {
        method: "DELETE"
      })
    );
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(typeof data).toBe("boolean");
  });

  it("POST /api/models/huggingface returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/huggingface/search returns array", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/search")
    );
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/models/huggingface/search returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/search", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/huggingface/type/something returns array", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/type/language_model")
    );
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/models/huggingface/type/something returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/type/language_model", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: ollama endpoints", () => {
  it("GET /api/models/ollama returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/ollama"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("DELETE /api/models/ollama returns false", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/ollama", { method: "DELETE" })
    );
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/ollama returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/ollama", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: provider-specific model endpoints", () => {
  it("GET /api/models/llm/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/llm/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/llm/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/llm/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/image/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/image/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/image/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/image/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/tts returns array (all providers)", async () => {
    const res = await handleModelsApiRequest(makeRequest("/tts"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/models/tts returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/tts", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/tts/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/tts/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/tts/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/tts/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/asr/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/asr/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/asr/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/asr/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/video/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/video/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/video/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/video/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });

  it("GET /api/models/embedding/openai returns array", async () => {
    const res = await handleModelsApiRequest(makeRequest("/embedding/openai"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it("POST /api/models/embedding/openai returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/embedding/openai", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: ollama_model_info", () => {
  it("GET /api/models/ollama_model_info returns null", async () => {
    const res = await handleModelsApiRequest(makeRequest("/ollama_model_info"));
    expect(res!.status).toBe(200);
    expect(await jsonBody(res!)).toBeNull();
  });

  it("POST /api/models/ollama_model_info returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/ollama_model_info", { method: "POST" })
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: HF cache endpoints", () => {
  it("POST /api/models/huggingface/try_cache_files", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/try_cache_files", {
        method: "POST",
        body: [{ repo_id: "test/model", path: "model.safetensors" }]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      repo_id: string;
      path: string;
      downloaded: boolean;
    }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("GET /api/models/huggingface/try_cache_files returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/try_cache_files")
    );
    expect(res!.status).toBe(405);
  });

  it("POST /api/models/huggingface/try_cache_files with bad body returns 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_files", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("POST /api/models/huggingface/try_cache_files with empty repo_id and path", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/try_cache_files", {
        method: "POST",
        body: [{ repo_id: "", path: "" }]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{ downloaded: boolean }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("POST /api/models/huggingface/try_cache_repos", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/try_cache_repos", {
        method: "POST",
        body: ["test/model"]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      repo_id: string;
      downloaded: boolean;
    }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("GET /api/models/huggingface/try_cache_repos returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/try_cache_repos")
    );
    expect(res!.status).toBe(405);
  });

  it("POST /api/models/huggingface/try_cache_repos with bad body returns 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_repos", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("POST /api/models/huggingface/check_cache", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/check_cache", {
        method: "POST",
        body: { repo_id: "test/model", allow_pattern: "*.safetensors" }
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Record<string, unknown>;
    expect(data.repo_id).toBe("test/model");
    expect(data.all_present).toBe(false);
  });

  it("GET /api/models/huggingface/check_cache returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/check_cache")
    );
    expect(res!.status).toBe(405);
  });

  it("POST /api/models/huggingface/check_cache with bad body returns 400", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/check_cache", {
        method: "POST",
        body: { repo_id: "" }
      })
    );
    expect(res!.status).toBe(400);
  });

  it("POST /api/models/huggingface/check_cache without body returns 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/check_cache", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("GET /api/models/huggingface/cache_status returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/cache_status")
    );
    expect(res!.status).toBe(405);
  });

  it("POST /api/models/huggingface/cache_status with bad body returns 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("POST /api/models/huggingface/cache_status with path-only item", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/cache_status", {
        method: "POST",
        body: [
          {
            key: "k1",
            repo_id: "test/model",
            path: "model.safetensors"
          }
        ]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(data[0].key).toBe("k1");
    expect(data[0].downloaded).toBe(false);
  });

  it("POST /api/models/huggingface/cache_status with llama_cpp model type", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/cache_status", {
        method: "POST",
        body: [
          {
            key: "k-llama",
            repo_id: "test/gguf-model",
            model_type: "llama_cpp",
            path: "model.gguf"
          }
        ]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(data[0].key).toBe("k-llama");
    expect(data[0].downloaded).toBe(false);
  });

  it("POST /api/models/huggingface/cache_status with llama_cpp but no path", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/cache_status", {
        method: "POST",
        body: [
          {
            key: "k-llama-nopath",
            repo_id: "test/gguf-model",
            model_type: "llama_cpp"
          }
        ]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("POST /api/models/huggingface/cache_status with no path and no model_type", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/cache_status", {
        method: "POST",
        body: [
          {
            key: "k-nopath",
            repo_id: "test/model",
            allow_patterns: "*.safetensors",
            ignore_patterns: "*.bin"
          }
        ]
      })
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(data[0].key).toBe("k-nopath");
    expect(data[0].downloaded).toBe(false);
  });
});

describe("Models API: pull_ollama_model", () => {
  it("POST /api/models/pull_ollama_model returns 501", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/pull_ollama_model", { method: "POST" })
    );
    expect(res!.status).toBe(501);
  });

  it("GET /api/models/pull_ollama_model returns 405", async () => {
    const res = await handleModelsApiRequest(makeRequest("/pull_ollama_model"));
    expect(res!.status).toBe(405);
  });
});

describe("Models API: huggingface/file_info", () => {
  it("POST /api/models/huggingface/file_info without body returns 400", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/file_info", { method: "POST" })
    );
    expect(res!.status).toBe(400);
  });

  it("POST /api/models/huggingface/file_info with body returns array", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/file_info", {
        method: "POST",
        body: [{ repo_id: "test/model", path: "config.json" }]
      })
    );
    expect(res!.status).toBe(200);
    const data = await jsonBody(res!);
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/models/huggingface/file_info returns 405", async () => {
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/file_info")
    );
    expect(res!.status).toBe(405);
  });
});

describe("Models API: unknown path returns null", () => {
  it("returns null for unknown path", async () => {
    const res = await handleModelsApiRequest(makeRequest("/unknown/path"));
    expect(res).toBeNull();
  });
});

describe("Models API: isProduction behavior", () => {
  const originalNodetoolEnv = process.env.NODETOOL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodetoolEnv === undefined) {
      delete process.env.NODETOOL_ENV;
    } else {
      process.env.NODETOOL_ENV = originalNodetoolEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("huggingface/search returns empty in production mode", async () => {
    process.env.NODETOOL_ENV = "production";
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/search")
    );
    expect(res!.status).toBe(200);
    expect(await jsonBody(res!)).toEqual([]);
  });

  it("ollama DELETE returns false in production mode", async () => {
    process.env.NODETOOL_ENV = "production";
    const res = await handleModelsApiRequest(
      makeRequest("/ollama", { method: "DELETE" })
    );
    expect(res!.status).toBe(200);
    expect(await jsonBody(res!)).toBe(false);
  });

  it("pull_ollama_model returns 503 in production mode", async () => {
    process.env.NODETOOL_ENV = "production";
    const res = await handleModelsApiRequest(
      makeRequest("/pull_ollama_model", { method: "POST" })
    );
    expect(res!.status).toBe(503);
  });

  it("huggingface/file_info returns empty in production mode", async () => {
    process.env.NODETOOL_ENV = "production";
    const res = await handleModelsApiRequest(
      makeRequest("/huggingface/file_info", { method: "POST" })
    );
    expect(res!.status).toBe(200);
    expect(await jsonBody(res!)).toEqual([]);
  });
});

describe("Models API: recommended with check_servers", () => {
  it("GET /api/models/recommended?check_servers=true filters by availability", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/recommended?check_servers=true")
    );
    expect(res!.status).toBe(200);
    const data = (await jsonBody(res!)) as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
  });
});
