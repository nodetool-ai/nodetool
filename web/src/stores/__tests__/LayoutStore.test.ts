import { act } from "@testing-library/react";
import { useLayoutStore, UserLayout } from "../LayoutStore";

describe("LayoutStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useLayoutStore.setState({
      layouts: [],
      activeLayoutId: null
    });
  });

  describe("initial state", () => {
    it("has empty layouts array", () => {
      const { layouts } = useLayoutStore.getState();
      expect(layouts).toEqual([]);
    });

    it("has null activeLayoutId", () => {
      const { activeLayoutId } = useLayoutStore.getState();
      expect(activeLayoutId).toBeNull();
    });
  });

  describe("addLayout", () => {
    it("adds a layout to the layouts array", () => {
      const layout: UserLayout = {
        id: "layout1",
        name: "My Layout",
        layout: { panels: {}, orientation: "HORIZONTAL" } as any
      };

      act(() => {
        useLayoutStore.getState().addLayout(layout);
      });

      const { layouts } = useLayoutStore.getState();
      expect(layouts).toHaveLength(1);
      expect(layouts[0]).toEqual(layout);
    });

    it("adds multiple layouts", () => {
      const layout1: UserLayout = {
        id: "layout1",
        name: "Layout 1",
        layout: { panels: {} } as any
      };
      const layout2: UserLayout = {
        id: "layout2",
        name: "Layout 2",
        layout: { panels: {} } as any
      };

      act(() => {
        useLayoutStore.getState().addLayout(layout1);
        useLayoutStore.getState().addLayout(layout2);
      });

      const { layouts } = useLayoutStore.getState();
      expect(layouts).toHaveLength(2);
      expect(layouts[0].id).toBe("layout1");
      expect(layouts[1].id).toBe("layout2");
    });

    it("preserves existing layouts when adding new", () => {
      const existingLayout: UserLayout = {
        id: "existing",
        name: "Existing",
        layout: { panels: {} } as any
      };

      useLayoutStore.setState({ layouts: [existingLayout] });

      const newLayout: UserLayout = {
        id: "new",
        name: "New",
        layout: { panels: {} } as any
      };

      act(() => {
        useLayoutStore.getState().addLayout(newLayout);
      });

      const { layouts } = useLayoutStore.getState();
      expect(layouts).toHaveLength(2);
      expect(layouts[0].id).toBe("existing");
      expect(layouts[1].id).toBe("new");
    });
  });

  describe("deleteLayout", () => {
    it("removes a layout by id", () => {
      const layouts: UserLayout[] = [
        { id: "layout1", name: "Layout 1", layout: { panels: {} } as any },
        { id: "layout2", name: "Layout 2", layout: { panels: {} } as any }
      ];

      useLayoutStore.setState({ layouts });

      act(() => {
        useLayoutStore.getState().deleteLayout("layout1");
      });

      const { layouts: remainingLayouts } = useLayoutStore.getState();
      expect(remainingLayouts).toHaveLength(1);
      expect(remainingLayouts[0].id).toBe("layout2");
    });

    it("does nothing if layout not found", () => {
      const layouts: UserLayout[] = [
        { id: "layout1", name: "Layout 1", layout: { panels: {} } as any }
      ];

      useLayoutStore.setState({ layouts });

      act(() => {
        useLayoutStore.getState().deleteLayout("nonexistent");
      });

      expect(useLayoutStore.getState().layouts).toHaveLength(1);
    });

    it("handles deleting from empty array", () => {
      act(() => {
        useLayoutStore.getState().deleteLayout("any");
      });

      expect(useLayoutStore.getState().layouts).toHaveLength(0);
    });
  });

  describe("setActiveLayoutId", () => {
    it("sets the active layout id", () => {
      act(() => {
        useLayoutStore.getState().setActiveLayoutId("layout1");
      });

      expect(useLayoutStore.getState().activeLayoutId).toBe("layout1");
    });

    it("clears the active layout id when set to null", () => {
      act(() => {
        useLayoutStore.getState().setActiveLayoutId("layout1");
        useLayoutStore.getState().setActiveLayoutId(null);
      });

      expect(useLayoutStore.getState().activeLayoutId).toBeNull();
    });
  });

  describe("updateActiveLayout", () => {
    it("updates the layout of the active layout", () => {
      const layouts: UserLayout[] = [
        { id: "layout1", name: "Layout 1", layout: { panels: { old: true } } as any },
        { id: "layout2", name: "Layout 2", layout: { panels: {} } as any }
      ];

      useLayoutStore.setState({ layouts, activeLayoutId: "layout1" });

      const newLayout = { panels: { new: true } } as any;

      act(() => {
        useLayoutStore.getState().updateActiveLayout(newLayout);
      });

      const { layouts: updatedLayouts } = useLayoutStore.getState();
      expect(updatedLayouts[0].layout).toEqual(newLayout);
      expect(updatedLayouts[1].layout).toEqual({ panels: {} });
    });

    it("does nothing if no active layout", () => {
      const layouts: UserLayout[] = [
        { id: "layout1", name: "Layout 1", layout: { panels: {} } as any }
      ];

      useLayoutStore.setState({ layouts, activeLayoutId: null });

      const originalLayout = useLayoutStore.getState().layouts[0].layout;

      act(() => {
        useLayoutStore.getState().updateActiveLayout({ panels: { new: true } } as any);
      });

      expect(useLayoutStore.getState().layouts[0].layout).toEqual(originalLayout);
    });

    it("does nothing if active layout id does not exist", () => {
      const layouts: UserLayout[] = [
        { id: "layout1", name: "Layout 1", layout: { panels: {} } as any }
      ];

      useLayoutStore.setState({ layouts, activeLayoutId: "nonexistent" });

      const originalLayout = useLayoutStore.getState().layouts[0].layout;

      act(() => {
        useLayoutStore.getState().updateActiveLayout({ panels: { new: true } } as any);
      });

      expect(useLayoutStore.getState().layouts[0].layout).toEqual(originalLayout);
    });
  });

  describe("integration scenarios", () => {
    it("full workflow: add, select, update, delete", () => {
      const layout1: UserLayout = {
        id: "layout1",
        name: "Layout 1",
        layout: { panels: {} } as any
      };
      const layout2: UserLayout = {
        id: "layout2",
        name: "Layout 2",
        layout: { panels: {} } as any
      };

      // Add layouts
      act(() => {
        useLayoutStore.getState().addLayout(layout1);
        useLayoutStore.getState().addLayout(layout2);
      });

      expect(useLayoutStore.getState().layouts).toHaveLength(2);

      // Select layout
      act(() => {
        useLayoutStore.getState().setActiveLayoutId("layout1");
      });

      expect(useLayoutStore.getState().activeLayoutId).toBe("layout1");

      // Update active layout
      const updatedLayout = { panels: { updated: true } } as any;
      act(() => {
        useLayoutStore.getState().updateActiveLayout(updatedLayout);
      });

      expect(useLayoutStore.getState().layouts[0].layout).toEqual(updatedLayout);

      // Delete the active layout
      act(() => {
        useLayoutStore.getState().deleteLayout("layout1");
      });

      expect(useLayoutStore.getState().layouts).toHaveLength(1);
      expect(useLayoutStore.getState().layouts[0].id).toBe("layout2");
      // Note: activeLayoutId is not automatically cleared
      expect(useLayoutStore.getState().activeLayoutId).toBe("layout1");
    });
  });
});
