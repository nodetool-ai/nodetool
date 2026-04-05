/**
 * Tests for hf-downloader.ts — pure functions: URL building, cache paths.
 *
 * We test the exported pure functions without making real HTTP requests.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hfCacheRoot,
  hfRepoCacheDir,
  hfHubFileUrl,
  HF_ENDPOINT
} from "../src/hf-downloader.js";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// hfCacheRoot
// ---------------------------------------------------------------------------

describe("hfCacheRoot", () => {
  const envKeys = [
    "HF_HUB_CACHE",
    "HUGGINGFACE_HUB_CACHE",
    "HF_HOME",
    "XDG_CACHE_HOME"
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("defaults to ~/.cache/huggingface/hub", () => {
    const result = hfCacheRoot();
    expect(result).toBe(
      path.join(os.homedir(), ".cache", "huggingface", "hub")
    );
  });

  it("respects HF_HUB_CACHE", () => {
    process.env.HF_HUB_CACHE = "/custom/cache";
    expect(hfCacheRoot()).toBe("/custom/cache");
  });

  it("respects HUGGINGFACE_HUB_CACHE (deprecated)", () => {
    process.env.HUGGINGFACE_HUB_CACHE = "/legacy/cache";
    expect(hfCacheRoot()).toBe("/legacy/cache");
  });

  it("respects HF_HOME", () => {
    process.env.HF_HOME = "/hf/home";
    expect(hfCacheRoot()).toBe(path.join("/hf/home", "hub"));
  });

  it("respects XDG_CACHE_HOME", () => {
    process.env.XDG_CACHE_HOME = "/xdg/cache";
    expect(hfCacheRoot()).toBe(path.join("/xdg/cache", "huggingface", "hub"));
  });

  it("HF_HUB_CACHE takes priority over HF_HOME", () => {
    process.env.HF_HUB_CACHE = "/priority";
    process.env.HF_HOME = "/lower";
    expect(hfCacheRoot()).toBe("/priority");
  });

  it("expands tilde in HF_HUB_CACHE", () => {
    process.env.HF_HUB_CACHE = "~/my-cache";
    expect(hfCacheRoot()).toBe(path.join(os.homedir(), "my-cache"));
  });

  it("expands tilde in HF_HOME", () => {
    process.env.HF_HOME = "~/hf";
    expect(hfCacheRoot()).toBe(path.join(os.homedir(), "hf", "hub"));
  });
});

// ---------------------------------------------------------------------------
// hfRepoCacheDir
// ---------------------------------------------------------------------------

describe("hfRepoCacheDir", () => {
  it("builds correct path for model repo", () => {
    const result = hfRepoCacheDir("org/model-name", "model", "/cache");
    expect(result).toBe(path.join("/cache", "models--org--model-name"));
  });

  it("builds correct path for dataset repo", () => {
    const result = hfRepoCacheDir("org/dataset", "dataset", "/cache");
    expect(result).toBe(path.join("/cache", "datasets--org--dataset"));
  });

  it("uses default cache root when no cacheDir", () => {
    // Just verify it returns a string (actual path depends on env)
    const result = hfRepoCacheDir("org/repo");
    expect(typeof result).toBe("string");
    expect(result).toContain("models--org--repo");
  });
});

// ---------------------------------------------------------------------------
// hfHubFileUrl
// ---------------------------------------------------------------------------

describe("hfHubFileUrl", () => {
  it("builds model URL", () => {
    const url = hfHubFileUrl("org/model", "config.json");
    expect(url).toBe(`${HF_ENDPOINT}/org/model/resolve/main/config.json`);
  });

  it("builds dataset URL", () => {
    const url = hfHubFileUrl("org/data", "train.csv", "main", "dataset");
    expect(url).toBe(`${HF_ENDPOINT}/datasets/org/data/resolve/main/train.csv`);
  });

  it("builds space URL", () => {
    const url = hfHubFileUrl("org/app", "app.py", "main", "space");
    expect(url).toBe(`${HF_ENDPOINT}/spaces/org/app/resolve/main/app.py`);
  });

  it("uses custom revision", () => {
    const url = hfHubFileUrl("org/model", "model.safetensors", "abc123");
    expect(url).toContain("/resolve/abc123/");
  });

  it("uses custom endpoint", () => {
    const url = hfHubFileUrl(
      "org/model",
      "config.json",
      "main",
      "model",
      "https://custom.endpoint.co"
    );
    expect(url).toBe(
      "https://custom.endpoint.co/org/model/resolve/main/config.json"
    );
  });

  it("strips leading slashes from filename", () => {
    const url = hfHubFileUrl("org/model", "///file.txt");
    expect(url).toContain("/resolve/main/file.txt");
    expect(url).not.toContain("///");
  });

  it("strips trailing slashes from endpoint", () => {
    const url = hfHubFileUrl(
      "org/model",
      "file.txt",
      "main",
      "model",
      "https://example.com///"
    );
    expect(url).toBe("https://example.com/org/model/resolve/main/file.txt");
  });

  it("throws for unsupported repo type", () => {
    expect(() => hfHubFileUrl("org/repo", "f.txt", "main", "unknown")).toThrow(
      "Unsupported repoType"
    );
  });
});
