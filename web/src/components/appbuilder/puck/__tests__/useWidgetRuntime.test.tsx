import React from "react";
import { renderHook, act } from "@testing-library/react";
import {
  AppRuntimeContext,
  type AppRuntimeContextValue
} from "../../runtime/AppRuntimeContext";
import { createAppRuntimeStore } from "../../runtime/appRuntimeStore";
import { useWidgetRuntime } from "../useWidgetRuntime";

const makeWrapper = (
  initialValues: Record<string, unknown> = {},
  overrides: Partial<AppRuntimeContextValue> = {}
): React.FC<{ children: React.ReactNode }> => {
  const store = createAppRuntimeStore(initialValues);
  const value: AppRuntimeContextValue = {
    store,
    io: { inputs: [], outputs: [] },
    designMode: false,
    dispatch: jest.fn(),
    setValue: jest.fn((key, v) => store.getState().setValue(key, v)),
    ...overrides
  };
  return ({ children }) => (
    <AppRuntimeContext.Provider value={value}>
      {children}
    </AppRuntimeContext.Provider>
  );
};

describe("useWidgetRuntime", () => {
  describe("read binding", () => {
    it("returns the bound value for a read widget", () => {
      const wrapper = makeWrapper({ result: "hello" });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-1",
            bindingMode: "read",
            binding: "result"
          }),
        { wrapper }
      );
      expect(result.current.value).toBe("hello");
    });

    it("returns undefined when no binding is set on a read widget", () => {
      const wrapper = makeWrapper({ result: "hello" });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-1",
            bindingMode: "read"
          }),
        { wrapper }
      );
      expect(result.current.value).toBeUndefined();
    });
  });

  describe("write binding", () => {
    it("falls back to component id as state key when no binding is set", () => {
      const wrapper = makeWrapper({ "widget-2": "local" });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-2",
            bindingMode: "write"
          }),
        { wrapper }
      );
      expect(result.current.value).toBe("local");
    });

    it("uses the binding as the state key when provided", () => {
      const wrapper = makeWrapper({ prompt: "hey" });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-3",
            bindingMode: "write",
            binding: "prompt"
          }),
        { wrapper }
      );
      expect(result.current.value).toBe("hey");
    });
  });

  describe("none binding", () => {
    it("returns undefined when binding mode is none", () => {
      const wrapper = makeWrapper({ anything: "nope" });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-4",
            bindingMode: "none"
          }),
        { wrapper }
      );
      expect(result.current.value).toBeUndefined();
    });
  });

  describe("designMode", () => {
    it("reflects the provider's design mode", () => {
      const wrapper = makeWrapper({}, { designMode: true });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-5",
            bindingMode: "none"
          }),
        { wrapper }
      );
      expect(result.current.designMode).toBe(true);
    });
  });

  describe("runnerState", () => {
    it("starts as idle", () => {
      const wrapper = makeWrapper();
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-6",
            bindingMode: "none"
          }),
        { wrapper }
      );
      expect(result.current.runnerState).toBe("idle");
    });
  });

  describe("emit", () => {
    it("dispatches matching events", () => {
      const dispatch = jest.fn();
      const wrapper = makeWrapper({}, { dispatch });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-7",
            bindingMode: "none",
            events: [{ trigger: "click", kind: "run" }]
          }),
        { wrapper }
      );
      act(() => {
        result.current.emit("click");
      });
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "run" })
      );
    });

    it("does not dispatch for non-matching triggers", () => {
      const dispatch = jest.fn();
      const wrapper = makeWrapper({}, { dispatch });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-8",
            bindingMode: "none",
            events: [{ trigger: "click", kind: "run" }]
          }),
        { wrapper }
      );
      act(() => {
        result.current.emit("change");
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("does nothing when events array is empty", () => {
      const dispatch = jest.fn();
      const wrapper = makeWrapper({}, { dispatch });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-9",
            bindingMode: "none",
            events: []
          }),
        { wrapper }
      );
      act(() => {
        result.current.emit("click");
      });
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
