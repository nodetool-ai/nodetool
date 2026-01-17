import { useAppHeaderStore } from "../AppHeaderStore";

describe("AppHeaderStore", () => {
  beforeEach(() => {
    useAppHeaderStore.setState(useAppHeaderStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with helpOpen set to false", () => {
      const state = useAppHeaderStore.getInitialState();
      expect(state.helpOpen).toBe(false);
    });

    it("should initialize with helpIndex set to 0", () => {
      const state = useAppHeaderStore.getInitialState();
      expect(state.helpIndex).toBe(0);
    });
  });

  describe("setHelpOpen", () => {
    it("should set helpOpen to true", () => {
      useAppHeaderStore.getState().setHelpOpen(true);
      expect(useAppHeaderStore.getState().helpOpen).toBe(true);
    });

    it("should set helpOpen to false", () => {
      useAppHeaderStore.setState({ helpOpen: true });
      useAppHeaderStore.getState().setHelpOpen(false);
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });
  });

  describe("setHelpIndex", () => {
    it("should set helpIndex to the specified value", () => {
      useAppHeaderStore.getState().setHelpIndex(5);
      expect(useAppHeaderStore.getState().helpIndex).toBe(5);
    });

    it("should update helpIndex from initial value", () => {
      expect(useAppHeaderStore.getState().helpIndex).toBe(0);
      useAppHeaderStore.getState().setHelpIndex(3);
      expect(useAppHeaderStore.getState().helpIndex).toBe(3);
    });
  });

  describe("handleOpenHelp", () => {
    it("should set helpOpen to true", () => {
      useAppHeaderStore.setState({ helpOpen: false });
      useAppHeaderStore.getState().handleOpenHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(true);
    });
  });

  describe("handleCloseHelp", () => {
    it("should set helpOpen to false", () => {
      useAppHeaderStore.setState({ helpOpen: true });
      useAppHeaderStore.getState().handleCloseHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });
  });

  describe("state transitions", () => {
    it("should handle open and close help flow", () => {
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
      expect(useAppHeaderStore.getState().helpIndex).toBe(0);

      useAppHeaderStore.getState().handleOpenHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(true);

      useAppHeaderStore.getState().setHelpIndex(2);
      expect(useAppHeaderStore.getState().helpIndex).toBe(2);

      useAppHeaderStore.getState().handleCloseHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });

    it("should handle multiple open/close cycles", () => {
      useAppHeaderStore.getState().handleOpenHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(true);

      useAppHeaderStore.getState().handleCloseHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);

      useAppHeaderStore.getState().handleOpenHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(true);

      useAppHeaderStore.getState().handleCloseHelp();
      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });
  });
});
