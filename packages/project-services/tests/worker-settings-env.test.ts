import { afterEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, string>();
vi.mock("@nodetool-ai/models", () => ({
  getSecret: vi.fn(async (key: string) => stored.get(key) ?? null)
}));

const { applyHfEndpointSetting, resolveWorkerSettingsEnv } = await import(
  "../src/worker-settings-env.js"
);

const envBefore = process.env["HF_ENDPOINT"];

afterEach(() => {
  stored.clear();
  if (envBefore === undefined) delete process.env["HF_ENDPOINT"];
  else process.env["HF_ENDPOINT"] = envBefore;
});

describe("resolveWorkerSettingsEnv", () => {
  it("passes a stored Hugging Face mirror to the Python worker", async () => {
    stored.set("HF_ENDPOINT", " https://hf-mirror.com ");
    expect(await resolveWorkerSettingsEnv()).toEqual({ HF_ENDPOINT: "https://hf-mirror.com" });
  });

  it("leaves unset settings out of the worker environment", async () => {
    expect(await resolveWorkerSettingsEnv()).toEqual({});
  });
});

describe("applyHfEndpointSetting", () => {
  it("puts a stored mirror in the environment for in-process Hub calls", async () => {
    stored.set("HF_ENDPOINT", "https://hf-mirror.com");
    expect(await applyHfEndpointSetting()).toBe("https://hf-mirror.com");
    expect(process.env["HF_ENDPOINT"]).toBe("https://hf-mirror.com");
  });

  it("leaves the environment alone when nothing is stored", async () => {
    process.env["HF_ENDPOINT"] = "https://operator.example";
    expect(await applyHfEndpointSetting()).toBeNull();
    expect(process.env["HF_ENDPOINT"]).toBe("https://operator.example");
  });
});
