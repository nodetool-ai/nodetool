import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcutsStore } from "../KeyboardShortcutsStore";

describe("KeyboardShortcutsStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    const { initialState } = useKeyboardShortcutsStore.getState() as any;
    if (initialState) {
      useKeyboardShortcutsStore.setState(initialState);
    }
  });

  describe("initial state", () => {
    it("should have dialog closed by default", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  describe("openDialog", () => {
    it("should open the dialog", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      act(() => {
        result.current.openDialog();
      });

      expect(result.current.isDialogOpen).toBe(true);
    });

    it("should not change state if dialog is already open", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      act(() => {
        result.current.openDialog();
      });

      act(() => {
        result.current.openDialog();
      });

      expect(result.current.isDialogOpen).toBe(true);
    });
  });

  describe("closeDialog", () => {
    it("should close the dialog", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      act(() => {
        result.current.openDialog();
      });

      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.isDialogOpen).toBe(false);
    });

    it("should not change state if dialog is already closed", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  describe("toggleDialog", () => {
    it("should open the dialog when closed", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      expect(result.current.isDialogOpen).toBe(false);

      act(() => {
        result.current.toggleDialog();
      });

      expect(result.current.isDialogOpen).toBe(true);
    });

    it("should close the dialog when open", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      act(() => {
        result.current.openDialog();
      });

      expect(result.current.isDialogOpen).toBe(true);

      act(() => {
        result.current.toggleDialog();
      });

      expect(result.current.isDialogOpen).toBe(false);
    });

    it("should toggle between open and closed states", () => {
      const { result } = renderHook(() => useKeyboardShortcutsStore());

      expect(result.current.isDialogOpen).toBe(false);

      act(() => {
        result.current.toggleDialog();
      });
      expect(result.current.isDialogOpen).toBe(true);

      act(() => {
        result.current.toggleDialog();
      });
      expect(result.current.isDialogOpen).toBe(false);

      act(() => {
        result.current.toggleDialog();
      });
      expect(result.current.isDialogOpen).toBe(true);
    });
  });
});
