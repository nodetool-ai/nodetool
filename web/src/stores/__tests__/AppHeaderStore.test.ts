import { act } from "react-dom/test-utils";
import { useAppHeaderStore } from "../AppHeaderStore";

describe("AppHeaderStore", () => {
  beforeEach(() => {
    const { setHelpOpen } = useAppHeaderStore.getState();
    act(() => {
      setHelpOpen(false);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has helpOpen false initially", () => {
      const state = useAppHeaderStore.getState();
      expect(state.helpOpen).toBe(false);
    });

    it("has helpIndex 0 initially", () => {
      const state = useAppHeaderStore.getState();
      expect(state.helpIndex).toBe(0);
    });
  });

  describe("setHelpOpen", () => {
    it("sets helpOpen to true", () => {
      const { setHelpOpen } = useAppHeaderStore.getState();
      act(() => {
        setHelpOpen(true);
      });

      expect(useAppHeaderStore.getState().helpOpen).toBe(true);
    });

    it("sets helpOpen to false", () => {
      const { setHelpOpen } = useAppHeaderStore.getState();
      act(() => {
        setHelpOpen(true);
        setHelpOpen(false);
      });

      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });
  });

  describe("setHelpIndex", () => {
    it("sets helpIndex to specified value", () => {
      const { setHelpIndex } = useAppHeaderStore.getState();
      act(() => {
        setHelpIndex(2);
      });

      expect(useAppHeaderStore.getState().helpIndex).toBe(2);
    });
  });

  describe("handleOpenHelp", () => {
    it("opens help dialog", () => {
      const { handleOpenHelp } = useAppHeaderStore.getState();
      act(() => {
        handleOpenHelp();
      });

      expect(useAppHeaderStore.getState().helpOpen).toBe(true);
    });
  });

  describe("handleCloseHelp", () => {
    it("closes help dialog", () => {
      const { handleOpenHelp, handleCloseHelp } = useAppHeaderStore.getState();
      act(() => {
        handleOpenHelp();
        handleCloseHelp();
      });

      expect(useAppHeaderStore.getState().helpOpen).toBe(false);
    });
  });

  describe("handleOpenHelpAtShortcuts", () => {
    it("opens help dialog at shortcuts tab", () => {
      const { handleOpenHelpAtShortcuts } = useAppHeaderStore.getState();
      act(() => {
        handleOpenHelpAtShortcuts();
      });

      expect(useAppHeaderStore.getState().helpOpen).toBe(true);
      expect(useAppHeaderStore.getState().helpIndex).toBe(0);
    });
  });
});
