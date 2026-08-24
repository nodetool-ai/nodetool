/**
 * Tests for `resolveWorkerHfToken` — the credential a host forwards to a
 * remote worker with `models.download`.
 *
 * A rented worker has no secret store and no HF_TOKEN in its environment, so
 * gated repos answer 401 there (nodetool-ai/nodetool#5184). The host resolves
 * the token instead: the user's stored secret first, then this process's own
 * environment and HF token file.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

import { resolveWorkerHfToken, clearHfTokenCache } from "../src/hf-auth.js";

const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_TOKEN_PATH",
  "HF_HOME",
  "XDG_CACHE_HOME"
];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // A directory with no token file, so the default ~/.cache/huggingface/token
  // never leaks into a test.
  process.env["HF_HOME"] = path.join(os.tmpdir(), "hf-worker-token-no-dir");
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

describe("resolveWorkerHfToken", () => {
  it("prefers the user's stored secret over the environment", async () => {
    process.env["HF_TOKEN"] = "hf_from_env";
    const asked: string[] = [];

    const token = await resolveWorkerHfToken((key) => {
      asked.push(key);
      return "hf_from_secret_store";
    });

    expect(token).toBe("hf_from_secret_store");
    expect(asked).toEqual(["HF_TOKEN"]);
  });

  it("falls back to the environment when nothing is stored", async () => {
    process.env["HF_TOKEN"] = "hf_from_env";

    expect(await resolveWorkerHfToken(async () => null)).toBe("hf_from_env");
    expect(await resolveWorkerHfToken()).toBe("hf_from_env");
  });

  it("treats a blank stored secret as absent", async () => {
    process.env["HF_TOKEN"] = "hf_from_env";

    expect(await resolveWorkerHfToken(async () => "   ")).toBe("hf_from_env");
    expect(await resolveWorkerHfToken(async () => "")).toBe("hf_from_env");
  });

  it("returns undefined when no token exists anywhere", async () => {
    expect(await resolveWorkerHfToken(async () => null)).toBeUndefined();
  });

  it("falls through to the environment when the secret store throws", async () => {
    process.env["HF_TOKEN"] = "hf_from_env";

    const token = await resolveWorkerHfToken(async () => {
      throw new Error("secret store is locked");
    });

    expect(token).toBe("hf_from_env");
  });

  it("trims surrounding whitespace off a stored token", async () => {
    expect(await resolveWorkerHfToken(async () => "  hf_padded  ")).toBe(
      "hf_padded"
    );
  });
});
