jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../../components/node/BaseNode", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/node_menu/typeFilterUtils", () => ({
  createConnectabilityMatrix: jest.fn()
}));

import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { restFetch } from "../../lib/rest-fetch";
import { reloadComfyNodeCatalog } from "../useComfyNodeMetadata";

const record = (node_type: string): NodeMetadata =>
  ({ node_type, title: node_type }) as NodeMetadata;

const respond = (body: unknown, ok = true): void => {
  (restFetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 502,
    json: async () => body
  });
};

describe("reloadComfyNodeCatalog", () => {
  beforeEach(() => {
    useMetadataStore.getState().setMetadata({
      "comfy.SaveVideo": record("comfy.SaveVideo"),
      "nodetool.Other": record("nodetool.Other")
    });
  });

  it("keeps metadata for a node the new target lacks, hidden from the menu", async () => {
    respond([record("comfy.SaveImage")]);
    await reloadComfyNodeCatalog();
    const { metadata } = useMetadataStore.getState();
    expect(metadata["comfy.SaveVideo"].hidden).toBe(true);
    expect(metadata["comfy.SaveImage"].hidden).toBeFalsy();
    expect(metadata["nodetool.Other"].hidden).toBeFalsy();
  });

  it("keeps the previous catalog when the load fails", async () => {
    respond({ detail: "down" }, false);
    await expect(reloadComfyNodeCatalog()).rejects.toThrow("down");
    expect(useMetadataStore.getState().metadata["comfy.SaveVideo"]).toBeDefined();
  });
});
