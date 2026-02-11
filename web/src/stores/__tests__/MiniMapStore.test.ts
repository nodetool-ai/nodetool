import { useMiniMapStore } from "../MiniMapStore";

describe("MiniMapStore", () => {
  beforeEach(() => {
    // Reset to initial state before each test
    const initialState = {
      visible: false,
      colorMode: "default" as const,
      showLegend: true
    };
    useMiniMapStore.setState(initialState);
  });

  afterEach(() => {
    // Reset to initial state after each test
    const initialState = {
      visible: false,
      colorMode: "default" as const,
      showLegend: true
    };
    useMiniMapStore.setState(initialState);
  });

  describe("initial state", () => {
    it("should have visible set to false by default", () => {
      const state = useMiniMapStore.getState();
      expect(state.visible).toBe(false);
    });

    it("should have colorMode set to 'default' by default", () => {
      const state = useMiniMapStore.getState();
      expect(state.colorMode).toBe("default");
    });

    it("should have showLegend set to true by default", () => {
      const state = useMiniMapStore.getState();
      expect(state.showLegend).toBe(true);
    });
  });

  describe("setVisible", () => {
    it("should set visible to true", () => {
      useMiniMapStore.getState().setVisible(true);
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should set visible to false", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should handle multiple setVisible calls", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });
  });

  describe("toggleVisible", () => {
    it("should toggle from false to true", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should toggle from true to false", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should toggle multiple times", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });
  });

  describe("setColorMode", () => {
    it("should set colorMode to 'type'", () => {
      useMiniMapStore.getState().setColorMode("type");
      expect(useMiniMapStore.getState().colorMode).toBe("type");
    });

    it("should set colorMode to 'default'", () => {
      useMiniMapStore.getState().setColorMode("type");
      useMiniMapStore.getState().setColorMode("default");
      expect(useMiniMapStore.getState().colorMode).toBe("default");
    });

    it("should handle multiple setColorMode calls", () => {
      useMiniMapStore.getState().setColorMode("type");
      useMiniMapStore.getState().setColorMode("type");
      useMiniMapStore.getState().setColorMode("default");
      expect(useMiniMapStore.getState().colorMode).toBe("default");
    });
  });

  describe("toggleColorMode", () => {
    it("should toggle from 'default' to 'type'", () => {
      expect(useMiniMapStore.getState().colorMode).toBe("default");
      useMiniMapStore.getState().toggleColorMode();
      expect(useMiniMapStore.getState().colorMode).toBe("type");
    });

    it("should toggle from 'type' to 'default'", () => {
      useMiniMapStore.getState().setColorMode("type");
      useMiniMapStore.getState().toggleColorMode();
      expect(useMiniMapStore.getState().colorMode).toBe("default");
    });

    it("should toggle multiple times", () => {
      expect(useMiniMapStore.getState().colorMode).toBe("default");
      useMiniMapStore.getState().toggleColorMode();
      expect(useMiniMapStore.getState().colorMode).toBe("type");
      useMiniMapStore.getState().toggleColorMode();
      expect(useMiniMapStore.getState().colorMode).toBe("default");
      useMiniMapStore.getState().toggleColorMode();
      expect(useMiniMapStore.getState().colorMode).toBe("type");
    });
  });

  describe("setShowLegend", () => {
    it("should set showLegend to false", () => {
      useMiniMapStore.getState().setShowLegend(false);
      expect(useMiniMapStore.getState().showLegend).toBe(false);
    });

    it("should set showLegend to true", () => {
      useMiniMapStore.getState().setShowLegend(false);
      useMiniMapStore.getState().setShowLegend(true);
      expect(useMiniMapStore.getState().showLegend).toBe(true);
    });

    it("should handle multiple setShowLegend calls", () => {
      useMiniMapStore.getState().setShowLegend(false);
      useMiniMapStore.getState().setShowLegend(false);
      useMiniMapStore.getState().setShowLegend(true);
      expect(useMiniMapStore.getState().showLegend).toBe(true);
    });
  });

  describe("toggleLegend", () => {
    it("should toggle from true to false", () => {
      expect(useMiniMapStore.getState().showLegend).toBe(true);
      useMiniMapStore.getState().toggleLegend();
      expect(useMiniMapStore.getState().showLegend).toBe(false);
    });

    it("should toggle from false to true", () => {
      useMiniMapStore.getState().setShowLegend(false);
      useMiniMapStore.getState().toggleLegend();
      expect(useMiniMapStore.getState().showLegend).toBe(true);
    });

    it("should toggle multiple times", () => {
      expect(useMiniMapStore.getState().showLegend).toBe(true);
      useMiniMapStore.getState().toggleLegend();
      expect(useMiniMapStore.getState().showLegend).toBe(false);
      useMiniMapStore.getState().toggleLegend();
      expect(useMiniMapStore.getState().showLegend).toBe(true);
      useMiniMapStore.getState().toggleLegend();
      expect(useMiniMapStore.getState().showLegend).toBe(false);
    });
  });
});
