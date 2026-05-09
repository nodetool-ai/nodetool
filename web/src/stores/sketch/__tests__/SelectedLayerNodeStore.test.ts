import { beforeEach, describe, expect, it } from "@jest/globals";
import { useSelectedLayerNodeStore } from "../SelectedLayerNodeStore";

describe("SelectedLayerNodeStore", () => {
  beforeEach(() => {
    useSelectedLayerNodeStore.getState().setSelectedLayerNodeId(null);
  });

  it("setSelectedLayerNodeId updates the selection", () => {
    useSelectedLayerNodeStore.getState().setSelectedLayerNodeId("node-1");
    expect(useSelectedLayerNodeStore.getState().selectedLayerNodeId).toBe(
      "node-1"
    );
  });

  it("resetForLayer defaults to the supplied output node", () => {
    useSelectedLayerNodeStore.getState().setSelectedLayerNodeId("node-old");
    useSelectedLayerNodeStore.getState().resetForLayer("output-node");
    expect(useSelectedLayerNodeStore.getState().selectedLayerNodeId).toBe(
      "output-node"
    );
  });

  it("resetForLayer clears the selection when no default is provided", () => {
    useSelectedLayerNodeStore.getState().setSelectedLayerNodeId("node-old");
    useSelectedLayerNodeStore.getState().resetForLayer(null);
    expect(useSelectedLayerNodeStore.getState().selectedLayerNodeId).toBeNull();
  });
});
