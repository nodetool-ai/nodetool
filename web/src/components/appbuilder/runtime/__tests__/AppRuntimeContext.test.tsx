import { renderHook } from "@testing-library/react";

import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useCondition,
  useFormatted,
  useRuntimeSelector
} from "../AppRuntimeContext";
import {
  INPUT_KEY,
  OUTPUT_KEY,
  makeTestRuntime
} from "../../__tests__/testRuntime";

const seeded = () =>
  makeTestRuntime({
    inputs: { [INPUT_KEY]: { value: "hello", dirty: true, revision: 1 } },
    outputs: {
      [OUTPUT_KEY]: {
        value: 42,
        invocationId: "j1",
        status: "done",
        revision: 1
      }
    },
    variables: { dark: true }
  });

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
    const { wrapper } = seeded();
    const { result } = renderHook(() => useAppRuntimeContext(), { wrapper });
    expect(result.current.store).toBeDefined();
    expect(result.current.designMode).toBe(false);
    expect(result.current.dispatch).toEqual(expect.any(Function));
    expect(result.current.write).toEqual(expect.any(Function));
  });

  it("reflects the designMode override", () => {
    const { wrapper } = makeTestRuntime({}, { designMode: true });
    const { result } = renderHook(() => useAppRuntimeContext(), { wrapper });
    expect(result.current.designMode).toBe(true);
  });
});

describe("useBindingRef", () => {
  it("resolves a legacy input name to its node id", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(() => useBindingRef("prompt", "write"), {
      wrapper
    });
    expect(result.current).toEqual({
      kind: "input",
      operationId: "main",
      nodeId: "in1"
    });
  });

  it("resolves an ID binding straight through", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(
      () => useBindingRef("op:main/out:out1", "read"),
      { wrapper }
    );
    expect(result.current).toMatchObject({ kind: "output", nodeId: "out1" });
  });

  it("returns null for a binding the workflow no longer has", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(() => useBindingRef("renamed", "read"), {
      wrapper
    });
    expect(result.current).toBeNull();
  });
});

describe("useBindingValue", () => {
  it("reads each namespace by ref", () => {
    const { wrapper } = seeded();
    const read = (binding: string, mode: "read" | "write") =>
      renderHook(() => useBindingValue(useBindingRef(binding, mode)), {
        wrapper
      }).result.current;
    expect(read("prompt", "write")).toBe("hello");
    expect(read("result", "read")).toBe(42);
    expect(read("dark", "read")).toBe(true);
  });

  it("returns undefined for a null ref", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(() => useBindingValue(null), { wrapper });
    expect(result.current).toBeUndefined();
  });
});

describe("useCondition", () => {
  it("evaluates against live state", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(
      () => useCondition({ binding: "result", op: "gt", value: "10" }, true),
      { wrapper }
    );
    expect(result.current).toBe(true);
  });

  it("falls back rather than hiding a widget on an unresolvable binding", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(
      () => useCondition({ binding: "gone", op: "eq", value: "x" }, true),
      { wrapper }
    );
    expect(result.current).toBe(true);
  });

  it("falls back when there is no condition at all", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(() => useCondition(undefined, false), {
      wrapper
    });
    expect(result.current).toBe(false);
  });
});

describe("useFormatted", () => {
  it("interpolates a template", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(
      () => useFormatted("{result|number:1} points"),
      { wrapper }
    );
    expect(result.current).toBe("42.0 points");
  });

  it("returns null with no template", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(() => useFormatted(undefined), { wrapper });
    expect(result.current).toBeNull();
  });
});

describe("useRuntimeSelector", () => {
  it("selects from the instance state", () => {
    const { wrapper } = seeded();
    const { result } = renderHook(
      () => useRuntimeSelector((s) => Object.keys(s.outputs).length),
      { wrapper }
    );
    expect(result.current).toBe(1);
  });
});
