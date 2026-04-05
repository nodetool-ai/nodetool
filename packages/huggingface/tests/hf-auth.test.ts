import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getHfToken,
  resolveHfToken,
  clearHfTokenCache
} from "../src/hf-auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and restore the relevant env vars around each test. */
const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_TOKEN_PATH",
  "HF_HOME",
  "XDG_CACHE_HOME",
  "HF_HUB_DISABLE_IMPLICIT_TOKEN"
];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Point HF_HOME to a non-existent directory so the default token file
  // at ~/.cache/huggingface/token is never picked up during tests.
  process.env["HF_HOME"] = path.join(os.tmpdir(), "hf-auth-test-no-token-dir");
  clearHfTokenCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  clearHfTokenCache();
});

// ---------------------------------------------------------------------------
// getHfToken
// ---------------------------------------------------------------------------

describe("getHfToken", () => {
  it("returns null when no token is configured", async () => {
    const token = await getHfToken();
    expect(token).toBeNull();
  });

  it("picks up HF_TOKEN from environment", async () => {
    process.env["HF_TOKEN"] = "hf_test_token_1";
    const token = await getHfToken();
    expect(token).toBe("hf_test_token_1");
  });

  it("picks up HF_API_TOKEN from environment", async () => {
    process.env["HF_API_TOKEN"] = "hf_api_token_2";
    const token = await getHfToken();
    expect(token).toBe("hf_api_token_2");
  });

  it("picks up HUGGING_FACE_HUB_TOKEN from environment", async () => {
    process.env["HUGGING_FACE_HUB_TOKEN"] = "hf_hub_token_3";
    const token = await getHfToken();
    expect(token).toBe("hf_hub_token_3");
  });

  it("trims whitespace from env token", async () => {
    process.env["HF_TOKEN"] = "  hf_trimmed  ";
    const token = await getHfToken();
    expect(token).toBe("hf_trimmed");
  });

  it("prefers HF_TOKEN over HF_API_TOKEN", async () => {
    process.env["HF_TOKEN"] = "hf_first";
    process.env["HF_API_TOKEN"] = "hf_second";
    const token = await getHfToken();
    expect(token).toBe("hf_first");
  });

  it("reads token from file when no env var is set", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-auth-test-"));
    const tokenPath = path.join(tmpDir, "token");
    await fs.writeFile(tokenPath, "hf_file_token\n");
    process.env["HF_TOKEN_PATH"] = tokenPath;

    try {
      const token = await getHfToken();
      expect(token).toBe("hf_file_token");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null when token file is empty", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-auth-test-"));
    const tokenPath = path.join(tmpDir, "token");
    await fs.writeFile(tokenPath, "   \n");
    process.env["HF_TOKEN_PATH"] = tokenPath;

    try {
      const token = await getHfToken();
      expect(token).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null when token file does not exist", async () => {
    process.env["HF_TOKEN_PATH"] = "/nonexistent/path/to/token";
    const token = await getHfToken();
    expect(token).toBeNull();
  });

  it("caches the result so the second call returns the same value", async () => {
    process.env["HF_TOKEN"] = "hf_cached";
    const first = await getHfToken();
    // Remove the env var — cache should still return the value
    delete process.env["HF_TOKEN"];
    const second = await getHfToken();
    expect(first).toBe("hf_cached");
    expect(second).toBe("hf_cached");
  });
});

// ---------------------------------------------------------------------------
// clearHfTokenCache
// ---------------------------------------------------------------------------

describe("clearHfTokenCache", () => {
  it("clears cache so next call re-reads environment", async () => {
    process.env["HF_TOKEN"] = "hf_before_clear";
    await getHfToken(); // populate cache
    delete process.env["HF_TOKEN"];

    clearHfTokenCache();

    const token = await getHfToken();
    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveHfToken
// ---------------------------------------------------------------------------

describe("resolveHfToken", () => {
  it("returns null when token=false (explicit disable)", async () => {
    process.env["HF_TOKEN"] = "hf_should_be_ignored";
    const token = await resolveHfToken(false);
    expect(token).toBeNull();
  });

  it("returns the string as-is when a string token is provided", async () => {
    const token = await resolveHfToken("hf_explicit_string");
    expect(token).toBe("hf_explicit_string");
  });

  it("returns the cached token when token=true and token exists", async () => {
    process.env["HF_TOKEN"] = "hf_required_token";
    const token = await resolveHfToken(true);
    expect(token).toBe("hf_required_token");
  });

  it("throws when token=true and no token is available", async () => {
    await expect(resolveHfToken(true)).rejects.toThrow(/required/i);
  });

  it("returns cached token when token=null", async () => {
    process.env["HF_TOKEN"] = "hf_implicit";
    const token = await resolveHfToken(null);
    expect(token).toBe("hf_implicit");
  });

  it("returns null when token=null and HF_HUB_DISABLE_IMPLICIT_TOKEN is set", async () => {
    process.env["HF_TOKEN"] = "hf_implicit";
    process.env["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1";
    const token = await resolveHfToken(null);
    expect(token).toBeNull();
  });

  it("returns null when token=undefined", async () => {
    const token = await resolveHfToken(undefined);
    expect(token).toBeNull();
  });
});
