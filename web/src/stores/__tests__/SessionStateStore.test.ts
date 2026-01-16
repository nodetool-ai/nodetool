import { renderHook, act } from "@testing-library/react";
import useSessionStateStore from "../SessionStateStore";

describe("SessionStateStore", () => {
  beforeEach(() => {
    useSessionStateStore.setState(useSessionStateStore.getInitialState());
  });

  describe("Initial State", () => {
    it("initializes with null clipboard data", () => {
      const { result } = renderHook(() => useSessionStateStore());
      expect(result.current.clipboardData).toBeNull();
      expect(result.current.isClipboardValid).toBe(false);
    });
  });

  describe("setClipboardData", () => {
    it("sets clipboard data to a string value", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setClipboardData("test clipboard data");
      });

      expect(result.current.clipboardData).toBe("test clipboard data");
    });

    it("sets clipboard data to null", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setClipboardData("some data");
        result.current.setClipboardData(null);
      });

      expect(result.current.clipboardData).toBeNull();
    });

    it("overwrites existing clipboard data", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setClipboardData("first data");
        result.current.setClipboardData("second data");
      });

      expect(result.current.clipboardData).toBe("second data");
    });
  });

  describe("setIsClipboardValid", () => {
    it("sets clipboard validity to true", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setIsClipboardValid(true);
      });

      expect(result.current.isClipboardValid).toBe(true);
    });

    it("sets clipboard validity to false", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setIsClipboardValid(true);
        result.current.setIsClipboardValid(false);
      });

      expect(result.current.isClipboardValid).toBe(false);
    });

    it("can be used independently of clipboard data", () => {
      const { result } = renderHook(() => useSessionStateStore());

      act(() => {
        result.current.setIsClipboardValid(true);
      });

      expect(result.current.clipboardData).toBeNull();
      expect(result.current.isClipboardValid).toBe(true);
    });
  });

  describe("State transitions", () => {
    it("handles complete clipboard workflow", () => {
      const { result } = renderHook(() => useSessionStateStore());

      // Initially empty
      expect(result.current.clipboardData).toBeNull();
      expect(result.current.isClipboardValid).toBe(false);

      // Set data
      act(() => {
        result.current.setClipboardData("workflow JSON data");
      });

      expect(result.current.clipboardData).toBe("workflow JSON data");
      expect(result.current.isClipboardValid).toBe(false);

      // Mark as valid
      act(() => {
        result.current.setIsClipboardValid(true);
      });

      expect(result.current.isClipboardValid).toBe(true);

      // Clear data
      act(() => {
        result.current.setClipboardData(null);
      });

      expect(result.current.clipboardData).toBeNull();
      // isClipboardValid should still be true until explicitly set
      expect(result.current.isClipboardValid).toBe(true);

      // Mark as invalid
      act(() => {
        result.current.setIsClipboardValid(false);
      });

      expect(result.current.isClipboardValid).toBe(false);
    });
  });
});
