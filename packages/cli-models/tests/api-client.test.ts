import { describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/cli-common/rpc-client", () => ({ createRpcClient: () => ({ query }) }));
import { createApiClient } from "../src/api-client.js";

describe("model command remote records", () => {
  it("uses the existing model route and validates records", async () => {
    query.mockResolvedValueOnce([{ id: "fixture", name: "Fixture", provider: "fal" }]);
    expect(await createApiClient("http://localhost:7777").models.all.query()).toEqual([{ id: "fixture", name: "Fixture", provider: "fal" }]);
    expect(query).toHaveBeenLastCalledWith("models.all", undefined);
    query.mockResolvedValueOnce([{ id: "fixture", name: 42 }]);
    await expect(createApiClient("http://localhost:7777").models.all.query()).rejects.toThrow();
  });
  it("preserves recommended modality and task for command filters", async () => {
    const model = { id: "fixture", name: "Fixture", provider: "openai", modality: "language", task: "text_generation", supported_systems: ["linux"] };
    query.mockResolvedValueOnce([model]);
    expect(await createApiClient("http://localhost:7777").models.recommended.query({ check_servers: true })).toEqual([model]);
  });
});
