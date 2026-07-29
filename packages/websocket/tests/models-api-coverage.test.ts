/**
 * Coverage tests for models-api.ts:
 *  - toUnifiedModelsFromLanguage: pure transform, exhaustive branch coverage.
 *  - handleModelsApiRequest: HTTP routing, method guards, 400/405/501/503
 *    branches, production short-circuits, and JSON body validation.
 *  - relayWorkerDownload: server-not-configured error frame.
 *
 * These deliberately avoid the network: no route exercised here performs an
 * outbound fetch (check_servers is left off), and production paths that would
 * import HF helpers return early with []/false.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  handleModelsApiRequest,
  toUnifiedModelsFromLanguage,
  relayWorkerDownload,
  type ModelsApiDeps
} from "../src/models-api.js";

// A minimal LanguageModel shape; the transform only reads id/name/provider.
type LM = { id: string; name: string; provider: string };
const lm = (id: string, name: string, provider: string): LM => ({
  id,
  name,
  provider
});

function get(path: string): Request {
  return new Request(`http://localhost/api/models${path}`, { method: "GET" });
}
function req(path: string, method: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request(`http://localhost/api/models${path}`, init);
}

// ── toUnifiedModelsFromLanguage ──────────────────────────────────────────────

describe("toUnifiedModelsFromLanguage", () => {
  it("maps fields and sets type=language_model", () => {
    const out = toUnifiedModelsFromLanguage([
      lm("gpt-x", "GPT X", "openai")
    ] as never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "gpt-x",
      name: "GPT X",
      type: "language_model",
      repo_id: null,
      path: null
    });
  });

  it("marks ollama and llama_cpp models as downloaded", () => {
    const out = toUnifiedModelsFromLanguage([
      lm("a", "A", "ollama"),
      lm("b", "B", "llama_cpp")
    ] as never);
    expect(out[0].downloaded).toBe(true);
    expect(out[1].downloaded).toBe(true);
  });

  it("marks non-local providers as not downloaded", () => {
    const out = toUnifiedModelsFromLanguage([
      lm("c", "C", "openai"),
      lm("d", "D", "anthropic")
    ] as never);
    expect(out[0].downloaded).toBe(false);
    expect(out[1].downloaded).toBe(false);
  });

  it("puts the provider into tags", () => {
    const out = toUnifiedModelsFromLanguage([
      lm("e", "E", "gemini")
    ] as never);
    expect(out[0].tags).toEqual(["gemini"]);
  });

  it("returns an empty array for empty input", () => {
    expect(toUnifiedModelsFromLanguage([])).toEqual([]);
  });

  it("preserves order and count for multiple models", () => {
    const out = toUnifiedModelsFromLanguage([
      lm("1", "One", "openai"),
      lm("2", "Two", "ollama"),
      lm("3", "Three", "groq")
    ] as never);
    expect(out.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });
});

// ── handleModelsApiRequest: recommended selectors ────────────────────────────

describe("handleModelsApiRequest recommended selectors", () => {
  const paths = [
    "/recommended/image",
    "/recommended/image/text-to-image",
    "/recommended/image/image-to-image",
    "/recommended/language",
    "/recommended/language/text-generation",
    "/recommended/language/embedding",
    "/recommended/asr",
    "/recommended/tts",
    "/recommended/music",
    "/recommended/video/text-to-video",
    "/recommended/video/image-to-video"
  ];

  for (const p of paths) {
    it(`GET ${p} returns a 200 JSON array`, async () => {
      const res = await handleModelsApiRequest(get(p));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      expect(Array.isArray(await res!.json())).toBe(true);
    });

    it(`POST ${p} returns 405`, async () => {
      const res = await handleModelsApiRequest(req(p, "POST"));
      expect(res!.status).toBe(405);
    });
  }

  it("GET /recommended (no check_servers) returns an array", async () => {
    const res = await handleModelsApiRequest(get("/recommended"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });

  it("GET /recommended?check_servers=false skips the server probe", async () => {
    const res = await handleModelsApiRequest(
      get("/recommended?check_servers=false")
    );
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });
});

// ── handleModelsApiRequest: simple routes ────────────────────────────────────

describe("handleModelsApiRequest simple routes", () => {
  it("GET /providers returns an array", async () => {
    const res = await handleModelsApiRequest(get("/providers"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });

  it("POST /providers returns 405", async () => {
    const res = await handleModelsApiRequest(req("/providers", "POST"));
    expect(res!.status).toBe(405);
  });

  it("GET /all returns an array", async () => {
    const res = await handleModelsApiRequest(get("/all"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });

  it("GET /ollama_model_info returns null body", async () => {
    const res = await handleModelsApiRequest(get("/ollama_model_info"));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toBeNull();
  });

  it("POST /ollama_model_info returns 405", async () => {
    const res = await handleModelsApiRequest(req("/ollama_model_info", "POST"));
    expect(res!.status).toBe(405);
  });

  it("GET /ollama returns an array of ollama-shaped models", async () => {
    const res = await handleModelsApiRequest(get("/ollama"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });

  it("DELETE /ollama returns false", async () => {
    const res = await handleModelsApiRequest(req("/ollama", "DELETE"));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toBe(false);
  });

  it("PUT /ollama returns 405", async () => {
    const res = await handleModelsApiRequest(req("/ollama", "PUT"));
    expect(res!.status).toBe(405);
  });

  it("returns null for an unknown path", async () => {
    const res = await handleModelsApiRequest(get("/definitely-not-a-route"));
    expect(res).toBeNull();
  });

  it("GET /tts aggregates provider models into an array", async () => {
    const res = await handleModelsApiRequest(get("/tts"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });

  it("GET /music aggregates provider models into an array", async () => {
    const res = await handleModelsApiRequest(get("/music"));
    expect(res!.status).toBe(200);
    expect(Array.isArray(await res!.json())).toBe(true);
  });
});

// ── handleModelsApiRequest: per-provider routes ──────────────────────────────

describe("handleModelsApiRequest per-provider routes", () => {
  const prefixes = [
    "/llm/",
    "/image/",
    "/tts/",
    "/music/",
    "/asr/",
    "/video/",
    "/embedding/"
  ];

  for (const prefix of prefixes) {
    it(`GET ${prefix}openai returns an array`, async () => {
      const res = await handleModelsApiRequest(get(`${prefix}openai`));
      expect(res!.status).toBe(200);
      expect(Array.isArray(await res!.json())).toBe(true);
    });

    it(`POST ${prefix}openai returns 405`, async () => {
      const res = await handleModelsApiRequest(req(`${prefix}openai`, "POST"));
      expect(res!.status).toBe(405);
    });
  }
});

// ── handleModelsApiRequest: JSON-body POST routes ────────────────────────────

describe("handleModelsApiRequest POST body validation", () => {
  it("try_cache_files rejects non-JSON body with 400", async () => {
    // No content-type header => parseJsonBody returns null.
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_files", {
        method: "POST",
        body: "not json"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("try_cache_files accepts an empty array and returns []", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/try_cache_files", "POST", [])
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual([]);
  });

  it("try_cache_files marks entries with missing repo/path as not downloaded", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/try_cache_files", "POST", [
        { repo_id: "", path: "" },
        { repo_id: "org/m" }
      ])
    );
    const body = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(body).toHaveLength(2);
    expect(body[0].downloaded).toBe(false);
    expect(body[1].downloaded).toBe(false);
  });

  it("try_cache_files with GET returns 405", async () => {
    const res = await handleModelsApiRequest(get("/huggingface/try_cache_files"));
    expect(res!.status).toBe(405);
  });

  it("try_cache_repos rejects invalid body with 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_repos", {
        method: "POST",
        body: "x"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("try_cache_repos returns downloaded=false for uncached repos", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/try_cache_repos", "POST", ["org/never-cached-xyz"])
    );
    const body = (await res!.json()) as Array<{
      repo_id: string;
      downloaded: boolean;
    }>;
    expect(body[0]).toEqual({
      repo_id: "org/never-cached-xyz",
      downloaded: false
    });
  });

  it("check_cache rejects a body without repo_id with 400", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/check_cache", "POST", { repo_id: "" })
    );
    expect(res!.status).toBe(400);
  });

  it("check_cache returns a status object for a valid repo_id", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/check_cache", "POST", {
        repo_id: "org/model",
        allow_pattern: "*.bin"
      })
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      repo_id: string;
      all_present: boolean;
      missing: string[];
    };
    expect(body.repo_id).toBe("org/model");
    // Nothing is cached in the test env, so the allow pattern is reported missing.
    expect(body.all_present).toBe(false);
    expect(body.missing).toContain("*.bin");
  });

  it("cache_status rejects invalid body with 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        body: "nope"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("cache_status returns per-item downloaded flags", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/cache_status", "POST", [
        { key: "k1", repo_id: "org/m", path: "weights.bin" },
        { key: "k2", repo_id: "org/m" }
      ])
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(body.map((b) => b.key)).toEqual(["k1", "k2"]);
    expect(body.every((b) => b.downloaded === false)).toBe(true);
  });

  it("cache_status treats llama_cpp model_type without a path as not downloaded", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/cache_status", "POST", [
        { key: "g", repo_id: "org/m", model_type: "llama_cpp_model" }
      ])
    );
    const body = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(body[0].downloaded).toBe(false);
  });
});

// ── handleModelsApiRequest: huggingface search / type ────────────────────────

describe("handleModelsApiRequest huggingface search & type", () => {
  it("GET /huggingface/type/ (empty type) returns []", async () => {
    const res = await handleModelsApiRequest(get("/huggingface/type/"));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual([]);
  });

  it("POST /huggingface/search returns 405", async () => {
    const res = await handleModelsApiRequest(req("/huggingface/search", "POST"));
    expect(res!.status).toBe(405);
  });

  it("PUT /huggingface/type/foo returns 405", async () => {
    const res = await handleModelsApiRequest(req("/huggingface/type/foo", "PUT"));
    expect(res!.status).toBe(405);
  });
});

// ── handleModelsApiRequest: development-only guards ───────────────────────────

describe("handleModelsApiRequest dev guards", () => {
  it("POST /pull_ollama_model returns 501 (not implemented) in dev", async () => {
    const res = await handleModelsApiRequest(req("/pull_ollama_model", "POST"));
    expect(res!.status).toBe(501);
  });

  it("GET /pull_ollama_model returns 405", async () => {
    const res = await handleModelsApiRequest(get("/pull_ollama_model"));
    expect(res!.status).toBe(405);
  });

  it("DELETE /huggingface without repo_id returns 400", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface", {
        method: "DELETE"
      })
    );
    expect(res!.status).toBe(400);
  });

  it("PUT /huggingface returns 405", async () => {
    const res = await handleModelsApiRequest(req("/huggingface", "PUT"));
    expect(res!.status).toBe(405);
  });
});

// ── handleModelsApiRequest: production short-circuits ─────────────────────────

describe("handleModelsApiRequest production behavior", () => {
  const prev = process.env.NODETOOL_ENV;
  beforeEach(() => {
    process.env.NODETOOL_ENV = "production";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.NODETOOL_ENV;
    else process.env.NODETOOL_ENV = prev;
  });

  it("GET /huggingface returns [] in production", async () => {
    const res = await handleModelsApiRequest(get("/huggingface"));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual([]);
  });

  it("DELETE /huggingface?repo_id=... returns false in production", async () => {
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface?repo_id=org%2Fm", {
        method: "DELETE"
      })
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toBe(false);
  });

  it("GET /huggingface/search returns [] in production", async () => {
    const res = await handleModelsApiRequest(
      get("/huggingface/search?query=whisper")
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual([]);
  });

  it("POST /pull_ollama_model returns 503 in production", async () => {
    const res = await handleModelsApiRequest(req("/pull_ollama_model", "POST"));
    expect(res!.status).toBe(503);
    const body = (await res!.json()) as { detail: { status: string } };
    expect(body.detail.status).toBe("unavailable");
  });

  it("POST /huggingface/file_info returns [] in production", async () => {
    const res = await handleModelsApiRequest(
      req("/huggingface/file_info", "POST", [{ repo_id: "org/m" }])
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual([]);
  });
});

// ── relayWorkerDownload: server-not-configured ───────────────────────────────

describe("relayWorkerDownload without worker support", () => {
  it("emits an error frame when workerManager is undefined", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };

    await relayWorkerDownload(socket, undefined, undefined, {
      command: "start_download",
      repo_id: "org/m"
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe("error");
    expect(sent[0].error).toMatch(/not configured/i);
  });

  it("swallows a socket send failure without throwing", async () => {
    const socket = {
      send: () => {
        throw new Error("socket gone");
      }
    };
    // Must resolve (the fail() helper catches the send error).
    await expect(
      relayWorkerDownload(socket, undefined, undefined, {
        command: "start_download",
        repo_id: "org/m"
      })
    ).resolves.toBeUndefined();
  });
});
