import { useModelCalloutStore } from "../ModelCalloutStore";

describe("ModelCalloutStore", () => {
  beforeEach(() => {
    useModelCalloutStore.getState().dismissAll();
  });

  it("starts with an empty key set", () => {
    expect(useModelCalloutStore.getState().keys.size).toBe(0);
  });

  it("show populates keys from targets", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" },
      { nodeId: "n2", propertyName: "provider" }
    ]);
    expect(useModelCalloutStore.getState().keys.size).toBe(2);
  });

  it("has returns true for a shown target", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" }
    ]);
    expect(useModelCalloutStore.getState().has("n1", "model")).toBe(true);
  });

  it("has returns false for an unknown target", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" }
    ]);
    expect(useModelCalloutStore.getState().has("n1", "other")).toBe(false);
    expect(useModelCalloutStore.getState().has("n2", "model")).toBe(false);
  });

  it("resolve removes a specific key", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" },
      { nodeId: "n2", propertyName: "provider" }
    ]);
    useModelCalloutStore.getState().resolve("n1", "model");
    expect(useModelCalloutStore.getState().has("n1", "model")).toBe(false);
    expect(useModelCalloutStore.getState().has("n2", "provider")).toBe(true);
  });

  it("resolve is a no-op for an absent key", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" }
    ]);
    useModelCalloutStore.getState().resolve("n1", "nonexistent");
    expect(useModelCalloutStore.getState().keys.size).toBe(1);
  });

  it("dismissAll clears all keys", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" },
      { nodeId: "n2", propertyName: "provider" }
    ]);
    useModelCalloutStore.getState().dismissAll();
    expect(useModelCalloutStore.getState().keys.size).toBe(0);
  });

  it("show replaces previous keys", () => {
    useModelCalloutStore.getState().show([
      { nodeId: "n1", propertyName: "model" }
    ]);
    useModelCalloutStore.getState().show([
      { nodeId: "n2", propertyName: "provider" }
    ]);
    expect(useModelCalloutStore.getState().has("n1", "model")).toBe(false);
    expect(useModelCalloutStore.getState().has("n2", "provider")).toBe(true);
  });
});
