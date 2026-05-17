import { useSketchCanvasRefStore } from "../SketchCanvasRefStore";

describe("SketchCanvasRefStore", () => {
  const initialState = useSketchCanvasRefStore.getState();

  afterEach(() => {
    useSketchCanvasRefStore.setState(initialState, true);
  });

  it("starts with all getters as null", () => {
    const state = useSketchCanvasRefStore.getState();
    expect(state.flattenToDataUrl).toBeNull();
    expect(state.getMaskDataUrl).toBeNull();
    expect(state.setLayerData).toBeNull();
  });

  describe("setGetters", () => {
    it("stores all provided getter functions", () => {
      const flattenToDataUrl = () => "data:image/png;base64,abc";
      const getMaskDataUrl = () => "data:image/png;base64,mask";
      const setLayerData = (_id: string, _data: string | null) => {};

      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl,
        getMaskDataUrl,
        setLayerData,
      });

      const state = useSketchCanvasRefStore.getState();
      expect(state.flattenToDataUrl).toBe(flattenToDataUrl);
      expect(state.getMaskDataUrl).toBe(getMaskDataUrl);
      expect(state.setLayerData).toBe(setLayerData);
    });

    it("overwrites previously set getters", () => {
      const first = () => "first";
      const second = () => "second";

      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl: first,
        getMaskDataUrl: () => null,
        setLayerData: () => {},
      });
      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl: second,
        getMaskDataUrl: () => null,
        setLayerData: () => {},
      });

      expect(useSketchCanvasRefStore.getState().flattenToDataUrl).toBe(second);
    });
  });

  describe("clearGetters", () => {
    it("resets all getters to null", () => {
      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl: () => "x",
        getMaskDataUrl: () => null,
        setLayerData: () => {},
      });

      useSketchCanvasRefStore.getState().clearGetters();

      const state = useSketchCanvasRefStore.getState();
      expect(state.flattenToDataUrl).toBeNull();
      expect(state.getMaskDataUrl).toBeNull();
      expect(state.setLayerData).toBeNull();
    });
  });

  describe("stored getters are callable", () => {
    it("flattenToDataUrl returns expected value", () => {
      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl: () => "data:image/png;base64,flat",
        getMaskDataUrl: () => null,
        setLayerData: () => {},
      });

      const fn = useSketchCanvasRefStore.getState().flattenToDataUrl;
      expect(fn!()).toBe("data:image/png;base64,flat");
    });

    it("getMaskDataUrl returns null when no mask", () => {
      useSketchCanvasRefStore.getState().setGetters({
        flattenToDataUrl: () => "",
        getMaskDataUrl: () => null,
        setLayerData: () => {},
      });

      const fn = useSketchCanvasRefStore.getState().getMaskDataUrl;
      expect(fn!()).toBeNull();
    });
  });
});
