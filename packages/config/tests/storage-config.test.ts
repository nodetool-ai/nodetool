import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStorageConfig } from "../src/storage-config.js";

const STORAGE_ENV_KEYS = [
  "NODETOOL_STORAGE_BACKEND",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_PREFIX",
  "SUPABASE_STORAGE_URL",
  "SUPABASE_STORAGE_SERVICE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_STORAGE_PREFIX",
  "ASSET_FOLDER",
  "STORAGE_PATH"
];

describe("loadStorageConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(STORAGE_ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of STORAGE_ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults to file backend with default assets path", () => {
    const config = loadStorageConfig();
    expect(config.kind).toBe("file");
    if (config.kind === "file") {
      expect(config.rootDir).toMatch(/assets$/);
    }
  });

  it("file backend honors STORAGE_PATH override", () => {
    process.env.STORAGE_PATH = "/tmp/custom-assets";
    const config = loadStorageConfig();
    expect(config).toEqual({ kind: "file", rootDir: "/tmp/custom-assets" });
  });

  it("loads s3 config from env", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "s3";
    process.env.S3_BUCKET = "my-bucket";
    process.env.S3_REGION = "eu-west-1";
    process.env.S3_PREFIX = "assets";
    expect(loadStorageConfig()).toEqual({
      kind: "s3",
      bucket: "my-bucket",
      region: "eu-west-1",
      endpoint: undefined,
      prefix: "assets"
    });
  });

  it("s3 backend requires S3_BUCKET", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "s3";
    expect(() => loadStorageConfig()).toThrow(/S3_BUCKET/);
  });

  it("loads supabase config from env", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "supabase";
    process.env.SUPABASE_STORAGE_URL = "https://x.supabase.co";
    process.env.SUPABASE_STORAGE_SERVICE_KEY = "service-key";
    process.env.SUPABASE_STORAGE_BUCKET = "uploads";
    expect(loadStorageConfig()).toEqual({
      kind: "supabase",
      url: "https://x.supabase.co",
      serviceKey: "service-key",
      bucket: "uploads",
      prefix: undefined
    });
  });

  it("supabase backend lists each missing var", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "supabase";
    expect(() => loadStorageConfig()).toThrow(/SUPABASE_STORAGE_URL/);

    process.env.SUPABASE_STORAGE_URL = "https://x.supabase.co";
    expect(() => loadStorageConfig()).toThrow(/SUPABASE_STORAGE_SERVICE_KEY/);

    process.env.SUPABASE_STORAGE_SERVICE_KEY = "k";
    expect(() => loadStorageConfig()).toThrow(/SUPABASE_STORAGE_BUCKET/);
  });

  it("rejects unknown backend names", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "azure";
    expect(() => loadStorageConfig()).toThrow(/Unknown NODETOOL_STORAGE_BACKEND/);
  });

  it("accepts case-insensitive backend names", () => {
    process.env.NODETOOL_STORAGE_BACKEND = "FILE";
    expect(loadStorageConfig().kind).toBe("file");
  });
});
