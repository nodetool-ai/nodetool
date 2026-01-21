import useColorPickerStore from "../ColorPickerStore";

describe("ColorPickerStore", () => {
  beforeEach(() => {
    useColorPickerStore.setState(useColorPickerStore.getInitialState());
  });

  afterEach(() => {
    useColorPickerStore.setState(useColorPickerStore.getInitialState());
  });

  describe("initial state", () => {
    it("has default color", () => {
      const state = useColorPickerStore.getState();
      expect(state.color).toBe("#1976d2");
    });

    it("has default mode", () => {
      const state = useColorPickerStore.getState();
      expect(state.mode).toBe("hex");
    });

    it("has default showAlpha", () => {
      const state = useColorPickerStore.getState();
      expect(state.showAlpha).toBe(true);
    });
  });

  describe("setColor", () => {
    it("sets color", () => {
      useColorPickerStore.getState().setColor("#ff0000");
      expect(useColorPickerStore.getState().color).toBe("#ff0000");
    });

    it("updates existing color", () => {
      useColorPickerStore.getState().setColor("#ff0000");
      useColorPickerStore.getState().setColor("#00ff00");
      expect(useColorPickerStore.getState().color).toBe("#00ff00");
    });

    it("handles empty string", () => {
      useColorPickerStore.getState().setColor("");
      expect(useColorPickerStore.getState().color).toBe("");
    });
  });

  describe("setMode", () => {
    it("sets mode", () => {
      useColorPickerStore.getState().setMode("rgb");
      expect(useColorPickerStore.getState().mode).toBe("rgb");
    });

    it("handles different modes", () => {
      const modes = ["hex", "rgb", "hsl", "hsv", "cmyk"];
      
      for (const mode of modes) {
        useColorPickerStore.getState().setMode(mode);
        expect(useColorPickerStore.getState().mode).toBe(mode);
      }
    });
  });

  describe("setShowAlpha", () => {
    it("sets showAlpha to true", () => {
      useColorPickerStore.getState().setShowAlpha(true);
      expect(useColorPickerStore.getState().showAlpha).toBe(true);
    });

    it("sets showAlpha to false", () => {
      useColorPickerStore.getState().setShowAlpha(false);
      expect(useColorPickerStore.getState().showAlpha).toBe(false);
    });

    it("toggles showAlpha", () => {
      expect(useColorPickerStore.getState().showAlpha).toBe(true);
      useColorPickerStore.getState().setShowAlpha(false);
      expect(useColorPickerStore.getState().showAlpha).toBe(false);
      useColorPickerStore.getState().setShowAlpha(true);
      expect(useColorPickerStore.getState().showAlpha).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets to defaults", () => {
      useColorPickerStore.getState().setColor("#ff0000");
      useColorPickerStore.getState().setMode("rgb");
      useColorPickerStore.getState().setShowAlpha(false);
      
      useColorPickerStore.getState().reset();
      
      expect(useColorPickerStore.getState().color).toBe("#1976d2");
      expect(useColorPickerStore.getState().mode).toBe("hex");
      expect(useColorPickerStore.getState().showAlpha).toBe(true);
    });
  });
});
