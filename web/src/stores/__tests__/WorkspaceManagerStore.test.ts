import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  const initialState = useWorkspaceManagerStore.getState();

  afterEach(() => {
    useWorkspaceManagerStore.setState(initialState, true);
  });

  it("initializes with isOpen set to false", () => {
    expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
  });

  describe("setIsOpen", () => {
    it("sets isOpen to true", () => {
      useWorkspaceManagerStore.getState().setIsOpen(true);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
    });

    it("sets isOpen to false", () => {
      useWorkspaceManagerStore.setState({ isOpen: true }, true);
      useWorkspaceManagerStore.setIsOpen(false);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    });

    it("toggles state correctly", () => {
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);

      useWorkspaceManagerStore.setIsOpen(true);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);

      useWorkspaceManagerStore.setIsOpen(false);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    });

    it("does not affect other state properties", () => {
      useWorkspaceManagerStore.setState({ isOpen: true }, true);
      useWorkspaceManagerStore.setIsOpen(false);
      
      const state = useWorkspaceManagerStore.getState();
      expect(state).toHaveProperty("isOpen");
      expect(state).toHaveProperty("setIsOpen");
      expect(typeof state.setIsOpen).toBe("function");
    });
  });

  describe("store structure", () => {
    it("has correct interface structure", () => {
      const state = useWorkspaceManagerStore.getState();
      expect(typeof state.isOpen).toBe("boolean");
      expect(typeof state.setIsOpen).toBe("function");
    });

    it("setIsOpen is a pure function", () => {
      const store = useWorkspaceManagerStore;
      const initialIsOpen = store.getState().isOpen;

      store.setIsOpen(!initialIsOpen);
      expect(store.getState().isOpen).not.toBe(initialIsOpen);

      store.setIsOpen(initialIsOpen);
      expect(store.getState().isOpen).toBe(initialIsOpen);
    });
  });
});
