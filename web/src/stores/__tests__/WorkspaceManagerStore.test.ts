import { renderHook, act } from "@testing-library/react";
import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    useWorkspaceManagerStore.setState(useWorkspaceManagerStore.getInitialState());
  });

  afterEach(() => {
    act(() => {
      useWorkspaceManagerStore.setState(useWorkspaceManagerStore.getInitialState());
    });
  });

  describe("initial state", () => {
    it("initializes with isOpen set to false", () => {
      const { result } = renderHook(() => useWorkspaceManagerStore());
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe("setIsOpen", () => {
    it("sets isOpen to true", () => {
      const { result } = renderHook(() => useWorkspaceManagerStore());

      act(() => {
        result.current.setIsOpen(true);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("sets isOpen to false", () => {
      useWorkspaceManagerStore.setState({ isOpen: true });
      const { result } = renderHook(() => useWorkspaceManagerStore());

      act(() => {
        result.current.setIsOpen(false);
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("toggles isOpen from false to true to false", () => {
      const { result } = renderHook(() => useWorkspaceManagerStore());

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.setIsOpen(true);
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.setIsOpen(false);
      });
      expect(result.current.isOpen).toBe(false);
    });

    it("handles multiple setIsOpen calls", () => {
      const { result } = renderHook(() => useWorkspaceManagerStore());

      act(() => {
        result.current.setIsOpen(true);
        result.current.setIsOpen(true);
        result.current.setIsOpen(true);
      });

      expect(result.current.isOpen).toBe(true);
    });
  });
});
