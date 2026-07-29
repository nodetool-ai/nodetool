import React from "react";
import { renderHook, act } from "@testing-library/react";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import type { AppRuntimeContextValue } from "../../runtime/AppRuntimeContext";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { useWidgetRuntime } from "../useWidgetRuntime";

const makeWrapper = (
  initial: Partial<AppInstanceState> = {},
  overrides: Partial<AppRuntimeContextValue> = {}
): React.FC<{ children: React.ReactNode }> =>
  makeTestRuntime(initial, overrides).wrapper;

describe("useWidgetRuntime", () => {
  describe("read binding", () => {
    it("returns the bound value for a read widget", () => {
      const wrapper = makeWrapper({
        outputs: {
          "main:out1": {
            value: "hello",
            invocationId: "j1",
            status: "done",
            revision: 1
          }
        }
      });
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
      const wrapper = makeWrapper();
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
    it("holds its value in view state when no binding is set", () => {
      const wrapper = makeWrapper({ view: { "widget-2:value": "local" } });
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

    it("reads the bound input node's slot when a binding is provided", () => {
      const wrapper = makeWrapper({
        inputs: { "main:in1": { value: "hey", dirty: true, revision: 1 } }
      });
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
      const wrapper = makeWrapper({ variables: { anything: "nope" } });
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

  describe("pacing", () => {
    it("live (default) dispatches on change and ignores commit — no double fire", () => {
      const dispatch = jest.fn();
      const wrapper = makeWrapper({}, { dispatch });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-live",
            bindingMode: "none",
            events: [{ trigger: "change", kind: "run" }]
          }),
        { wrapper }
      );
      act(() => result.current.emit("change", "change"));
      act(() => result.current.emit("change", "commit"));
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("release dispatches only on commit, not on live change", () => {
      const dispatch = jest.fn();
      const wrapper = makeWrapper({}, { dispatch });
      const { result } = renderHook(
        () =>
          useWidgetRuntime({
            id: "widget-release",
            bindingMode: "none",
            events: [{ trigger: "change", kind: "run", pace: "release" }]
          }),
        { wrapper }
      );
      act(() => result.current.emit("change", "change"));
      expect(dispatch).not.toHaveBeenCalled();
      act(() => result.current.emit("change", "commit"));
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    describe("debounce", () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it("fires once on the trailing edge after rapid changes", () => {
        const dispatch = jest.fn();
        const wrapper = makeWrapper({}, { dispatch });
        const { result } = renderHook(
          () =>
            useWidgetRuntime({
              id: "widget-debounce",
              bindingMode: "none",
              events: [{ trigger: "change", kind: "run", pace: "debounce" }]
            }),
          { wrapper }
        );
        act(() => result.current.emit("change", "change"));
        act(() => result.current.emit("change", "change"));
        act(() => result.current.emit("change", "change"));
        expect(dispatch).not.toHaveBeenCalled();
        act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(dispatch).toHaveBeenCalledTimes(1);
      });

      it("a commit flushes the pending debounced run immediately, once", () => {
        const dispatch = jest.fn();
        const wrapper = makeWrapper({}, { dispatch });
        const { result } = renderHook(
          () =>
            useWidgetRuntime({
              id: "widget-debounce-commit",
              bindingMode: "none",
              events: [{ trigger: "change", kind: "run", pace: "debounce" }]
            }),
          { wrapper }
        );
        act(() => result.current.emit("change", "change"));
        act(() => result.current.emit("change", "commit"));
        expect(dispatch).toHaveBeenCalledTimes(1);
        act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(dispatch).toHaveBeenCalledTimes(1);
      });

      it("cancels a pending debounced run on unmount", () => {
        const dispatch = jest.fn();
        const wrapper = makeWrapper({}, { dispatch });
        const { result, unmount } = renderHook(
          () =>
            useWidgetRuntime({
              id: "widget-debounce-unmount",
              bindingMode: "none",
              events: [{ trigger: "change", kind: "run", pace: "debounce" }]
            }),
          { wrapper }
        );
        act(() => result.current.emit("change", "change"));
        unmount();
        act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(dispatch).not.toHaveBeenCalled();
      });
    });
  });
});
