import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as models from "@nodetool/models";
const { Secret } = models;
import * as runtime from "@nodetool/runtime";
import { handleSettingsRequest } from "../src/settings-api.js";

function makeSettingsRequest(
  body: Record<string, unknown>,
  userId = "user-1"
): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId
    },
    body: JSON.stringify(body)
  });
}

describe("settings-api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears secret and provider caches when secrets are updated via /api/settings", async () => {
    const upsertSpy = vi
      .spyOn(Secret, "upsert")
      .mockResolvedValue({} as Awaited<ReturnType<typeof Secret.upsert>>);
    const clearSecretCacheSpy = vi
      .spyOn(models, "clearSecretCache")
      .mockImplementation(() => undefined);
    const clearProviderCacheSpy = vi
      .spyOn(runtime, "clearProviderCache")
      .mockReturnValue(0);

    const response = await handleSettingsRequest(
      makeSettingsRequest({ secrets: { OPENAI_API_KEY: "second-key" } }),
      "/api/settings",
      {}
    );

    expect(response?.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledWith({
      userId: "user-1",
      key: "OPENAI_API_KEY",
      value: "second-key",
      description: "Secret for OPENAI_API_KEY"
    });
    expect(clearSecretCacheSpy).toHaveBeenCalledWith(
      "user-1",
      "OPENAI_API_KEY"
    );
    expect(clearProviderCacheSpy).toHaveBeenCalledTimes(1);
  });
});
