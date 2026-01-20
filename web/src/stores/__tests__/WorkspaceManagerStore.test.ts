import { renderHook, act } from "@testing-library/react";
import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    act(() => {
      useWorkspaceManagerStore.setState({ isOpen: false });
    });
  });

  it("should have default isOpen value of false", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore((state) => state));
    expect(result.current.isOpen).toBe(false);
  });

  it("should set isOpen to true", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore((state) => state));
    
    act(() => {
      result.current.setIsOpen(true);
    });
    
    expect(result.current.isOpen).toBe(true);
  });

  it("should set isOpen to false", () => {
    act(() => {
      useWorkspaceManagerStore.setState({ isOpen: true });
    });
    
    const { result } = renderHook(() => useWorkspaceManagerStore((state) => state));
    expect(result.current.isOpen).toBe(true);
    
    act(() => {
      result.current.setIsOpen(false);
    });
    
    expect(result.current.isOpen).toBe(false);
  });

  it("should toggle isOpen value", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore((state) => state));
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

  it("should handle setIsOpen with boolean values", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore((state) => state));
    
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
