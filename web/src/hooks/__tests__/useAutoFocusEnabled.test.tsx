import { renderHook } from "@testing-library/react";
import { stub } from "../../test-utils/doubles";
import { useAutoFocusEnabled } from "../useAutoFocusEnabled";

const mockMatchMedia = (coarse: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: query.includes("pointer: coarse") ? coarse : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
};

describe("useAutoFocusEnabled", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("allows auto-focus on a fine pointer", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useAutoFocusEnabled());
    expect(result.current).toBe(true);
  });

  it("suppresses auto-focus on a coarse pointer", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useAutoFocusEnabled());
    expect(result.current).toBe(false);
  });
});
