import { renderHook } from "@testing-library/react";
import { useQueries } from "@tanstack/react-query";
import type { OperationBinding } from "@nodetool-ai/app-runtime";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { useOperationScripts } from "../useOperationScripts";

jest.mock("@tanstack/react-query", () => ({ useQueries: jest.fn() }));
jest.mock("../../../trpc/client", () => ({ trpcClient: {} }));

const operations: OperationBinding[] = [1, 2].map((version) => ({
  id: `op${version}`, name: `Version ${version}`, workflowId: "",
  target: { kind: "script", scriptId: "script", scriptVersion: version },
  policy: "parallel", inputs: {}, outputs: {}
}));
const first = { ...emptyJsScriptDocument(), code: 'await output("v", 1);' };
const second = { ...emptyJsScriptDocument(), code: 'await output("v", 2);' };

it("uses qualified frozen scripts without fetching live documents", () => {
  jest.mocked(useQueries).mockReturnValue([]);
  const { result } = renderHook(() => useOperationScripts(operations, {
    "script@1": first, "script@2": second, script: first
  }));
  expect(result.current.get("op1")).toBe(first);
  expect(result.current.get("op2")).toBe(second);
  expect(useQueries).toHaveBeenLastCalledWith({ queries: [
    expect.objectContaining({ enabled: false }),
    expect.objectContaining({ enabled: false })
  ] });
});

it("fetches only the missing version and preserves legacy overrides", () => {
  jest.mocked(useQueries).mockReturnValue([{ data: undefined }, { data: second }]);
  const { result } = renderHook(() => useOperationScripts(operations, { "script@1": first }));
  expect(result.current.get("op2")).toBe(second);
  expect(useQueries).toHaveBeenLastCalledWith({ queries: [
    expect.objectContaining({ enabled: false }),
    expect.objectContaining({ enabled: true })
  ] });
  const legacy = renderHook(() => useOperationScripts(operations.slice(0, 1), { script: first }));
  expect(legacy.result.current.get("op1")).toBe(first);
});
