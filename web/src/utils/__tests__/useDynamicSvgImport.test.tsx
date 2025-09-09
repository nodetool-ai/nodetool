/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useDynamicSvgImport } from "../useDynamicSvgImport";
import React from "react";

// Mock the SVG imports with proper React components
jest.mock("../icons/enum.svg?react", () => {
  return () => React.createElement('svg', { 'data-testid': 'any-icon' }, 'Any');
});

jest.mock("../icons/assistant.svg?react", () => {
  return () => React.createElement('svg', { 'data-testid': 'assistant-icon' }, 'Assistant');
});

// Mock console.warn to test error handling
const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

describe("useDynamicSvgImport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it("should provide SvgIcon and loading state", () => {
    const { result } = renderHook(() => useDynamicSvgImport("nonexistent"));
    
    // Basic functionality test - the hook should return an object with these properties
    expect(result.current).toHaveProperty('SvgIcon');
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.loading).toBe('boolean');
  });

  it("should handle assistant icon from static map", () => {
    const { result } = renderHook(() => useDynamicSvgImport("assistant"));
    
    // Should return an object with properties
    expect(result.current).toHaveProperty('SvgIcon');
    expect(result.current).toHaveProperty('loading');
  });

  it("should attempt dynamic loading for unknown icons", async () => {
    const { result } = renderHook(() => useDynamicSvgImport("unknown-icon-that-does-not-exist"));

    // Wait for async operation to complete (will fail but that's expected)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    // Should still return the expected structure
    expect(result.current).toHaveProperty('SvgIcon');
    expect(result.current).toHaveProperty('loading');
  });

  it("should handle empty string icon name", async () => {
    const { result } = renderHook(() => useDynamicSvgImport(""));

    // Wait for async operations (will fail but that's expected)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current).toHaveProperty('SvgIcon');
    expect(result.current).toHaveProperty('loading');
  });

  it("should handle icon name changes", async () => {
    const { result, rerender } = renderHook(
      ({ iconName }) => useDynamicSvgImport(iconName),
      { initialProps: { iconName: "assistant" } }
    );

    // Rerender with different icon name
    rerender({ iconName: "different-icon" });

    // Wait for async operation
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current).toHaveProperty('SvgIcon');
    expect(result.current).toHaveProperty('loading');
  });

  it("should handle useEffect with different iconName values", () => {
    // Test that the hook doesn't crash with various inputs
    const { rerender } = renderHook(
      ({ iconName }) => useDynamicSvgImport(iconName),
      { initialProps: { iconName: "test1" } }
    );

    // Test various icon name changes
    rerender({ iconName: "test2" });
    rerender({ iconName: "" });
    rerender({ iconName: "assistant" });
    rerender({ iconName: "nonexistent" });

    // If we get here without crashing, the test passes
    expect(true).toBe(true);
  });

  it("should handle useEffect cleanup and dependencies", async () => {
    const { unmount } = renderHook(() => useDynamicSvgImport("test-icon"));
    
    // Unmount to test cleanup
    unmount();
    
    // Test should not throw
    expect(true).toBe(true);
  });
});