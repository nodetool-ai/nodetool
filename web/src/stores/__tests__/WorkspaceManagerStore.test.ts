import { renderHook, act } from "@testing-library/react";
import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    useWorkspaceManagerStore.setState({ isOpen: false });
  });

  it("initializes with isOpen as false", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    
    expect(result.current.isOpen).toBe(false);
  });

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

  it("toggles isOpen state", () => {
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

  it("maintains state isolation between render cycles", () => {
    const { result: result1 } = renderHook(() => useWorkspaceManagerStore());
    
    act(() => {
      result1.current.setIsOpen(true);
    });

    expect(result1.current.isOpen).toBe(true);

    // Re-render the hook - it should still see the same store state
    const { result: result2 } = renderHook(() => useWorkspaceManagerStore());
    expect(result2.current.isOpen).toBe(true);
  });
});
