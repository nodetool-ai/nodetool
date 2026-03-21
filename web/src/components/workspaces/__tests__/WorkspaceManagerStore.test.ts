import { renderHook, act } from "@testing-library/react";
import { useWorkspaceManagerStore } from "../../../stores/WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    act(() => {
      useWorkspaceManagerStore.setState({ isOpen: false });
    });
  });

  it("should initialize with isOpen as false", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    expect(result.current.isOpen).toBe(false);
  });

  it("should set isOpen to true when setIsOpen(true) is called", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    
    act(() => {
      result.current.setIsOpen(true);
    });
    
    expect(result.current.isOpen).toBe(true);
  });

  it("should set isOpen to false when setIsOpen(false) is called", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    
    act(() => {
      result.current.setIsOpen(true);
    });
    expect(result.current.isOpen).toBe(true);
    
    act(() => {
      result.current.setIsOpen(false);
    });
    expect(result.current.isOpen).toBe(false);
  });
});
