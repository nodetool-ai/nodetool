import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../lib/cloud/cloudWindow", () => ({
  CLOUD_WINDOW: { server: "https://api.nodetool.ai", account: "u1" },
  isCloudWindow: () => true
}));
jest.mock("../../stores/BASE_URL", () => ({ BASE_URL: "https://api.nodetool.ai" }));

import { resolveMediaUri, resolveStaticMediaUri } from "../resolveMediaUri";
import { useAssetStore } from "../../stores/AssetStore";

describe("media in the cloud window", () => {
  it("loads the server's files through the main process and nothing else on it", () => {
    expect(resolveStaticMediaUri("/api/storage/u1/a.png")).toBe("nodetool-cloud://api.nodetool.ai/api/storage/u1/a.png");
    expect(resolveStaticMediaUri("/api/workflows/w1")).toBe("");
  });

  it("resolves an asset through its get_url", async () => {
    const get = jest.fn(async () => ({ get_url: "/api/storage/u1/b.png" }));
    useAssetStore.setState({ get } as never);
    expect(await resolveMediaUri("asset://b")).toBe("nodetool-cloud://api.nodetool.ai/api/storage/u1/b.png");
    get.mockResolvedValueOnce({ get_url: "https://cdn.example.com/signed/b.png?sig=1" });
    expect(await resolveMediaUri("asset://b")).toBe("https://cdn.example.com/signed/b.png?sig=1");
  });
});
