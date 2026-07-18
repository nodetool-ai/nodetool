import React from "react";
import { renderHook } from "@testing-library/react";
import {
  AppRuntimeContext,
  useAppRuntimeContext,
  useRuntimeValue,
  useRuntimeSelector
} from "../AppRuntimeContext";
import { createAppRuntimeStore } from "../appRuntimeStore";
import type { AppRuntimeContextValue } from "../AppRuntimeContext";

const makeWrapper = (
  overrides: Partial<AppRuntimeContextValue> = {}
): React.FC<{ children: React.ReactNode }> => {
  const store = createAppRuntimeStore({ prompt: "hello", count: 42 });
  const value: AppRuntimeContextValue = {
    store,
    io: { inputs: [], outputs: [] },
    designMode: false,
    dispatch: jest.fn(),
    setValue: jest.fn(),
    getNodeProperty: jest.fn(),
    ...overrides
  };
  return ({ children }) => (
    <AppRuntimeContext.Provider value={value}>
      {children}
    </AppRuntimeContext.Provider>
  );
};

describe("useAppRuntimeContext", () => {
  it("throws when used outside a provider", () => {
    const { result } = renderHook(() => {
      try {
        useAppRuntimeContext();
        return null;
      } catch (err) {
        return err;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(
      /useAppRuntimeContext must be used within AppRuntimeView/
    );
  });

  it("returns the context value when inside a provider", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useAppRuntimeContext(), { wrapper });
    expect(result.current.store).toBeDefined();
    expect(result.current.designMode).toBe(false);
    expect(typeof result.current.dispatch).toBe("function");
    expect(typeof result.current.setValue).toBe("function");
  });

  it("reflects the designMode override", () => {
    const wrapper = makeWrapper({ designMode: true });
    const { result } = renderHook(() => useAppRuntimeContext(), { wrapper });
    expect(result.current.designMode).toBe(true);
  });
});

describe("useRuntimeValue", () => {
  it("returns the value for a known key", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useRuntimeValue("prompt"), { wrapper });
    expect(result.current).toBe("hello");
  });

  it("returns undefined for an unknown key", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useRuntimeValue("missing"), {
      wrapper
    });
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when key is undefined", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useRuntimeValue(undefined), {
      wrapper
    });
    expect(result.current).toBeUndefined();
  });
});

describe("useRuntimeSelector", () => {
  it("selects the runner state", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useRuntimeSelector((s) => s.runnerState),
      { wrapper }
    );
    expect(result.current).toBe("idle");
  });

  it("selects a computed value from state", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useRuntimeSelector((s) => Object.keys(s.values).length),
      { wrapper }
    );
    expect(result.current).toBe(2);
  });
});
