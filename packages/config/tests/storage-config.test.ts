import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadAssetStorageConfig,
  loadTempStorageConfig
} from "../src/storage-config.js";

const STORAGE_ENV_KEYS = [
  "NODETOOL_STORAGE_BACKEND",
  "ASSET_BUCKET",
  "TEMP_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ENDPOINT_URL",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "ASSET_FOLDER",
  "STORAGE_PATH"
];

function saveEnv(): Record<string, string | undefined> {
  return Object.fromEntries(STORAGE_ENV_KEYS.map((k) => [k, process.env[k]]));
}

function clearStorageEnv(): void {
  for (const k of STORAGE_ENV_KEYS) {
    delete process.env[k];
  }
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("loadAssetStorageConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
    clearStorageEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it("defaults to file backend with default assets path", () => {
    const config = loadAssetStorageConfig();
    expect(config.kind).toBe("file");
    if (config.kind === "file") {
      expect(config.rootDir).toMatch(/assets$/);
    }
  });

  it("file backend honors STORAGE_PATH override", () => {
    process.env.STORAGE_PATH = "/tmp/custom-assets";
    const config = loadAssetStorageConfig();
    expect(config).toEqual({ kind: "file", rootDir: "/tmp/custom-assets" });
  });

  it("loads s3 config from env", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "s3";
    process.env.ASSET_BUCKET = "my-bucket";
    process.env.S3_REGION = "eu-west-1";

    expect(loadAssetStorageConfig()).toEqual({
      kind: "s3",
      bucket: "my-bucket",
      region: "eu-west-1",
      endpoint: undefined
    });
  });

  it("s3 backend requires ASSET_BUCKET", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "s3";
    expect(() => loadAssetStorageConfig()).toThrow(/ASSET_BUCKET/);
  });

  it("loads supabase config from env", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "supabase";
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_KEY = "service-key";
    process.env.ASSET_BUCKET = "uploads";

    expect(loadAssetStorageConfig()).toEqual({
      kind: "supabase",
      url: "https://x.supabase.co",
      apiKey: "service-key",
      bucket: "uploads"
    });
  });

  it("supabase backend lists each missing var", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "supabase";
    expect(() => loadAssetStorageConfig()).toThrow(/SUPABASE_URL/);

    process.env.SUPABASE_URL = "https://x.supabase.co";
    expect(() => loadAssetStorageConfig()).toThrow(/SUPABASE_KEY/);

    process.env.SUPABASE_KEY = "k";
    expect(() => loadAssetStorageConfig()).toThrow(/ASSET_BUCKET/);
  });

  it("rejects unknown backend names", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "azure";
    expect(() => loadAssetStorageConfig()).toThrow(
      /Unknown NODETOOL_STORAGE_BACKEND/
    );
  });

  it("accepts case-insensitive backend names", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "FILE";
    expect(loadAssetStorageConfig().kind).toBe("file");
  });
});

describe("loadTempStorageConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
    clearStorageEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it("uses TEMP_BUCKET for remote temp storage", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "s3";
    process.env.TEMP_BUCKET = "temp-bucket";

    expect(loadTempStorageConfig()).toEqual({
      kind: "s3",
      bucket: "temp-bucket",
      region: undefined,
      endpoint: undefined
    });
  });
});
