import { act } from "react-dom/test-utils";
import { useAppHeaderStore } from "../AppHeaderStore";

describe("AppHeaderStore", () => {
  beforeEach(() => {
    const { setHelpOpen, setShortcutsDialogOpen } = useAppHeaderStore.getState();
    act(() => {
      setHelpOpen(false);
      setShortcutsDialogOpen(false);
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

    it("has shortcutsDialogOpen false initially", () => {
      const state = useAppHeaderStore.getState();
      expect(state.shortcutsDialogOpen).toBe(false);
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

  describe("setShortcutsDialogOpen", () => {
    it("sets shortcutsDialogOpen to true", () => {
      const { setShortcutsDialogOpen } = useAppHeaderStore.getState();
      act(() => {
        setShortcutsDialogOpen(true);
      });

      expect(useAppHeaderStore.getState().shortcutsDialogOpen).toBe(true);
    });

    it("sets shortcutsDialogOpen to false", () => {
      const { setShortcutsDialogOpen } = useAppHeaderStore.getState();
      act(() => {
        setShortcutsDialogOpen(true);
        setShortcutsDialogOpen(false);
      });

      expect(useAppHeaderStore.getState().shortcutsDialogOpen).toBe(false);
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

  describe("handleOpenShortcutsDialog", () => {
    it("opens shortcuts dialog", () => {
      const { handleOpenShortcutsDialog } = useAppHeaderStore.getState();
      act(() => {
        handleOpenShortcutsDialog();
      });

      expect(useAppHeaderStore.getState().shortcutsDialogOpen).toBe(true);
    });
  });

  describe("handleCloseShortcutsDialog", () => {
    it("closes shortcuts dialog", () => {
      const { handleOpenShortcutsDialog, handleCloseShortcutsDialog } =
        useAppHeaderStore.getState();
      act(() => {
        handleOpenShortcutsDialog();
        handleCloseShortcutsDialog();
      });

      expect(useAppHeaderStore.getState().shortcutsDialogOpen).toBe(false);
    });
  });
});
