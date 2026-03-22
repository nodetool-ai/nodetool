/**
 * Tests for useCollapsedSections hook
 */

import { renderHook, act } from "@testing-library/react";
import { useCollapsedSections } from "../useCollapsedSections";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock
});

beforeEach(() => {
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
});

describe("useCollapsedSections", () => {
  type TestKeys = "section1" | "section2";
  const storageKey = "test-collapsed-sections";
  const defaults: Record<TestKeys, boolean> = {
    section1: false,
    section2: true
  };

  it("returns defaults when no stored state", () => {
    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    expect(sections.section1).toBe(false);
    expect(sections.section2).toBe(true);
  });

  it("loads stored state from localStorage", () => {
    localStorageMock.setItem(
      storageKey,
      JSON.stringify({ section1: true, section2: false })
    );
    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    expect(sections.section1).toBe(true);
    expect(sections.section2).toBe(false);
  });

  it("toggles a section and persists to localStorage", () => {
    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );

    act(() => {
      result.current[1]("section1");
    });

    const [sections] = result.current;
    expect(sections.section1).toBe(true);

    // Verify localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      storageKey,
      expect.stringContaining('"section1":true')
    );
  });

  it("toggles back to original value", () => {
    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );

    // Toggle on
    act(() => {
      result.current[1]("section1");
    });
    expect(result.current[0].section1).toBe(true);

    // Toggle off
    act(() => {
      result.current[1]("section1");
    });
    expect(result.current[0].section1).toBe(false);
  });

  it("only toggles the specified section", () => {
    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );

    act(() => {
      result.current[1]("section1");
    });

    expect(result.current[0].section1).toBe(true);
    expect(result.current[0].section2).toBe(true); // unchanged
  });

  it("falls back to defaults on invalid JSON in localStorage", () => {
    localStorageMock.setItem(storageKey, "invalid-json");
    localStorageMock.getItem.mockReturnValueOnce("invalid-json");

    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    expect(sections.section1).toBe(false);
    expect(sections.section2).toBe(true);
  });

  it("falls back to defaults when stored data has wrong types", () => {
    const corrupted = JSON.stringify({ section1: "not-a-boolean", section2: 42 });
    localStorageMock.setItem(storageKey, corrupted);
    localStorageMock.getItem.mockReturnValueOnce(corrupted);

    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    // Non-boolean values should fall back to defaults
    expect(sections.section1).toBe(false);
    expect(sections.section2).toBe(true);
  });

  it("falls back to defaults when stored data is an array", () => {
    const corrupted = JSON.stringify([true, false]);
    localStorageMock.setItem(storageKey, corrupted);
    localStorageMock.getItem.mockReturnValueOnce(corrupted);

    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    expect(sections.section1).toBe(false);
    expect(sections.section2).toBe(true);
  });

  it("merges valid stored values with defaults for missing keys", () => {
    const partial = JSON.stringify({ section1: true });
    localStorageMock.setItem(storageKey, partial);
    localStorageMock.getItem.mockReturnValueOnce(partial);

    const { result } = renderHook(() =>
      useCollapsedSections<TestKeys>(storageKey, defaults)
    );
    const [sections] = result.current;
    expect(sections.section1).toBe(true); // from stored
    expect(sections.section2).toBe(true); // from defaults
  });
});
