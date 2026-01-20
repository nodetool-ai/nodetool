import { renderHook, act } from "@testing-library/react";
import { useCollectionsManagerStore } from "../CollectionsManagerStore";

describe("CollectionsManagerStore", () => {
  beforeEach(() => {
    act(() => {
      useCollectionsManagerStore.setState({ isOpen: false });
    });
  });

  it("should have default isOpen value of false", () => {
    const { result } = renderHook(() => useCollectionsManagerStore((state) => state));
    expect(result.current.isOpen).toBe(false);
  });

  it("should set isOpen to true", () => {
    const { result } = renderHook(() => useCollectionsManagerStore((state) => state));
    
    act(() => {
      result.current.setIsOpen(true);
    });
    
    expect(result.current.isOpen).toBe(true);
  });

  it("should set isOpen to false", () => {
    act(() => {
      useCollectionsManagerStore.setState({ isOpen: true });
    });
    
    const { result } = renderHook(() => useCollectionsManagerStore((state) => state));
    expect(result.current.isOpen).toBe(true);
    
    act(() => {
      result.current.setIsOpen(false);
    });
    
    expect(result.current.isOpen).toBe(false);
  });

  it("should toggle isOpen value", () => {
    const { result } = renderHook(() => useCollectionsManagerStore((state) => state));
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

  it("should handle setIsOpen with true then false", () => {
    const { result } = renderHook(() => useCollectionsManagerStore((state) => state));
    
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
