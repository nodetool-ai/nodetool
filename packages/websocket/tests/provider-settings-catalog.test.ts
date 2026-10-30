import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpenAIProvider,
  registerProvider,
  unregisterProvider,
  listRegisteredProviderIds,
  getRegisteredProvider
} from "@nodetool-ai/runtime";
import { getSecret } from "@nodetool-ai/models";
import { customProviderId } from "@nodetool-ai/protocol";
import { settingsRouter } from "../src/trpc/routers/settings.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (original) => ({
  ...await original<typeof import("@nodetool-ai/models")>(),
  getSecret: vi.fn(async () => null)
}));

const createCaller = createCallerFactory(settingsRouter);
const providerId = "native-settings-test";
// These procedures read caller identity and do not use registry or Python bridge dependencies.
const caller = () => createCaller({ userId: "catalog-user" } as unknown as Context);

describe("provider settings catalog", () => {
  beforeEach(() => {
    vi.stubEnv("NODETOOL_NODE_PROFILE", "full");
    for (const id of listRegisteredProviderIds()) {
      for (const key of Object.keys(getRegisteredProvider(id)?.kwargs ?? {})) {
        if (!key.startsWith("_")) {
          vi.stubEnv(key, "");
        }
      }
    }
    vi.stubEnv("FAL_KEY", "");
    vi.mocked(getSecret).mockReset();
    vi.mocked(getSecret).mockResolvedValue(null);
    registerProvider(providerId, OpenAIProvider,
      { OPENAI_API_KEY: "", _bridge: "private-injection", UNREGISTERED_CONFIG: "private-default" },
      { OLLAMA_API_URL: "http://private-host:11434", OPENAI_API_KEY: "private-default" },
      { displayName: "Test endpoint" });
  });
  afterEach(() => {
    unregisterProvider(providerId);
    unregisterProvider(customProviderId("other-account"));
    vi.unstubAllEnvs();
  });

  it("offers only declared settings keys and reports caller-scoped credential availability without values", async () => {
    vi.mocked(getSecret).mockImplementation(async (key, userId) =>
      userId === "catalog-user" ? `fake-${key}-credential` : null);
    const result = await caller().providerCatalog();
    const row = result.find((entry) => entry.provider === providerId);
    expect(row).toEqual({
      provider: providerId,
      name: "Test endpoint",
      configured: true,
      keys: ["OPENAI_API_KEY", "OLLAMA_API_URL"]
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("fake-");
    expect(serialized).not.toContain("private-");
    expect(serialized).not.toContain("UNREGISTERED_CONFIG");
    expect(serialized).not.toContain("_bridge");
    expect(getSecret).toHaveBeenCalledWith("OPENAI_API_KEY", "catalog-user");
  });

  it("keeps providers needing credentials discoverable before configuration", async () => {
    const result = await caller().providerCatalog();
    expect(result.find((entry) => entry.provider === providerId)?.configured).toBe(false);
    expect(result.find((entry) => entry.provider === "openai")?.keys).toContain("OPENAI_API_KEY");
  });

  it("excludes account-specific custom endpoints from the registered-provider dialog", async () => {
    registerProvider(customProviderId("other-account"), OpenAIProvider,
      { OPENAI_API_KEY: "" }, {}, { displayName: "Private endpoint" });
    const result = await caller().providerCatalog();
    expect(result.some((entry) => entry.provider === customProviderId("other-account"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Private endpoint");
  });

  it("omits host setting keys and local providers from the cloud catalog", async () => {
    vi.stubEnv("NODETOOL_NODE_PROFILE", "cloud");
    const result = await caller().providerCatalog();
    expect(result.find((entry) => entry.provider === providerId)?.keys).toEqual(["OPENAI_API_KEY"]);
    expect(result.some((entry) => entry.provider === "ollama")).toBe(false);
    expect(result.some((entry) => entry.provider === "llama_cpp")).toBe(false);
    expect(result.flatMap((entry) => entry.keys)).not.toContain("OLLAMA_API_URL");
  });
});
