import { renderHook, act } from "@testing-library/react";
import { useWorkflowStatisticsStore } from "../WorkflowStatisticsStore";

describe("WorkflowStatisticsStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useWorkflowStatisticsStore.setState({ isOpen: false });
  });

  it("initializes with isOpen set to false", () => {
    const { result } = renderHook(() => useWorkflowStatisticsStore());
    
    expect(result.current.isOpen).toBe(false);
  });

  it("toggles isOpen state when toggle is called", () => {
    const { result } = renderHook(() => useWorkflowStatisticsStore());
    
    expect(result.current.isOpen).toBe(false);
    
    act(() => {
      result.current.toggle();
    });
    
    expect(result.current.isOpen).toBe(true);
    
    act(() => {
      result.current.toggle();
    });
    
    expect(result.current.isOpen).toBe(false);
  });

  it("opens panel when open is called", () => {
    const { result } = renderHook(() => useWorkflowStatisticsStore());
    
    expect(result.current.isOpen).toBe(false);
    
    act(() => {
      result.current.open();
    });
    
    expect(result.current.isOpen).toBe(true);
  });

  it("closes panel when close is called", () => {
    const { result } = renderHook(() => useWorkflowStatisticsStore());
    
    // First open it
    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
    
    // Then close it
    act(() => {
      result.current.close();
    });
    
    expect(result.current.isOpen).toBe(false);
  });

  it("handles multiple rapid toggles correctly", () => {
    const { result } = renderHook(() => useWorkflowStatisticsStore());
    
    act(() => {
      result.current.toggle();
      result.current.toggle();
      result.current.toggle();
    });
    
    // Started false, toggled 3 times: false -> true -> false -> true
    expect(result.current.isOpen).toBe(true);
  });

  it("allows selective subscription to isOpen", () => {
    const { result } = renderHook(() => 
      useWorkflowStatisticsStore((state) => state.isOpen)
    );
    
    expect(result.current).toBe(false);
    
    act(() => {
      useWorkflowStatisticsStore.getState().open();
    });
    
    expect(result.current).toBe(true);
  });

  it("allows selective subscription to toggle function", () => {
    const { result } = renderHook(() => 
      useWorkflowStatisticsStore((state) => state.toggle)
    );
    
    expect(typeof result.current).toBe("function");
    
    act(() => {
      result.current();
    });
    
    expect(useWorkflowStatisticsStore.getState().isOpen).toBe(true);
  });
});
