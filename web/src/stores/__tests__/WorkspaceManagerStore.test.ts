import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    // Reset the store state before each test
    useWorkspaceManagerStore.setState({ isOpen: false });
  });

  describe("initial state", () => {
    it("has isOpen set to false by default", () => {
      const state = useWorkspaceManagerStore.getState();
      expect(state.isOpen).toBe(false);
    });
  });

  describe("setIsOpen", () => {
    it("sets isOpen to true", () => {
      const { setIsOpen } = useWorkspaceManagerStore.getState();
      
      setIsOpen(true);
      
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
    });

    it("sets isOpen to false", () => {
      // First set to true
      useWorkspaceManagerStore.setState({ isOpen: true });
      
      const { setIsOpen } = useWorkspaceManagerStore.getState();
      setIsOpen(false);
      
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    });

    it("toggles isOpen state correctly", () => {
      const { setIsOpen } = useWorkspaceManagerStore.getState();
      
      // Start false
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
      
      // Toggle to true
      setIsOpen(true);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(true);
      
      // Toggle to false
      setIsOpen(false);
      expect(useWorkspaceManagerStore.getState().isOpen).toBe(false);
    });
  });

  describe("subscription", () => {
    it("notifies subscribers on state change", () => {
      const listener = jest.fn();
      const unsubscribe = useWorkspaceManagerStore.subscribe(listener);
      
      const { setIsOpen } = useWorkspaceManagerStore.getState();
      setIsOpen(true);
      
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });

    it("does not notify after unsubscribe", () => {
      const listener = jest.fn();
      const unsubscribe = useWorkspaceManagerStore.subscribe(listener);
      
      unsubscribe();
      
      const { setIsOpen } = useWorkspaceManagerStore.getState();
      setIsOpen(true);
      
      // Listener should not have been called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("selector usage", () => {
    it("can be used with a selector", () => {
      useWorkspaceManagerStore.setState({ isOpen: true });
      
      const isOpen = useWorkspaceManagerStore.getState().isOpen;
      
      expect(isOpen).toBe(true);
    });
  });
});
