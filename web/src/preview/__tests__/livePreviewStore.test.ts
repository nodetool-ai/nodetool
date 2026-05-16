/**
 * @jest-environment node
 */
import { useLivePreviewStore } from "../livePreviewStore";

describe("livePreviewStore", () => {
  beforeEach(() => {
    useLivePreviewStore.getState().clearAll();
  });

  it("returns undefined for an unknown nodeId", () => {
    expect(useLivePreviewStore.getState().getPreview("missing")).toBeUndefined();
  });

  it("stores and retrieves a preview by nodeId", () => {
    const { setPreview, getPreview } = useLivePreviewStore.getState();
    setPreview("n1", { type: "image", data: new Uint8Array([1, 2, 3]) });
    const value = getPreview("n1") as { type: string; data: Uint8Array };
    expect(value.type).toBe("image");
    expect(Array.from(value.data)).toEqual([1, 2, 3]);
  });

  it("overwrites existing previews for the same nodeId", () => {
    const { setPreview, getPreview } = useLivePreviewStore.getState();
    setPreview("n1", "first");
    setPreview("n1", "second");
    expect(getPreview("n1")).toBe("second");
  });

  it("isolates previews across nodeIds", () => {
    const { setPreview, getPreview } = useLivePreviewStore.getState();
    setPreview("a", 1);
    setPreview("b", 2);
    expect(getPreview("a")).toBe(1);
    expect(getPreview("b")).toBe(2);
  });

  it("clearPreview removes a single entry", () => {
    const { setPreview, clearPreview, getPreview } =
      useLivePreviewStore.getState();
    setPreview("a", 1);
    setPreview("b", 2);
    clearPreview("a");
    expect(getPreview("a")).toBeUndefined();
    expect(getPreview("b")).toBe(2);
  });

  it("clearPreview on a missing key is a no-op (no state churn)", () => {
    const { setPreview, clearPreview } = useLivePreviewStore.getState();
    setPreview("a", 1);
    const before = useLivePreviewStore.getState().previews;
    clearPreview("missing");
    expect(useLivePreviewStore.getState().previews).toBe(before);
  });

  it("clearAll wipes every entry", () => {
    const { setPreview, clearAll, getPreview } =
      useLivePreviewStore.getState();
    setPreview("a", 1);
    setPreview("b", 2);
    clearAll();
    expect(getPreview("a")).toBeUndefined();
    expect(getPreview("b")).toBeUndefined();
    expect(useLivePreviewStore.getState().previews).toEqual({});
  });
});
