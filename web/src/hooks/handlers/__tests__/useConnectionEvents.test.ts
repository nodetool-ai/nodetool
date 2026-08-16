import { renderHook } from "@testing-library/react";
import { asMock } from "../../../test-utils/doubles";
import { Edge } from "@xyflow/react";
import { useConnectionEvents } from "../useConnectionEvents";
import { useNodes } from "../../../contexts/NodeContext";

// jest hoists `jest.mock` above the imports, so a factory may only reach
// out-of-scope names that begin with `mock`.
const mockIsFunction = <T,>(
  value: T
): value is Extract<T, (...args: never[]) => unknown> =>
  typeof value === 'function';

jest.mock("../../../contexts/NodeContext");

describe("useConnectionEvents", () => {
  const mockEdges = [
    { id: "edge-1", source: "node-1", target: "node-2" },
    { id: "edge-2", source: "node-2", target: "node-3" }
  ] as Edge[];

  const mockedUseNodes = asMock(useNodes);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseNodes.mockImplementation((selector) => {
      if (mockIsFunction(selector)) {
        return selector({
          edges: mockEdges
        });
      }
      return { edges: mockEdges };
    });
  });

  it("returns isConnectionValid function", () => {
    const { result } = renderHook(() => useConnectionEvents());
    expect(result.current.isConnectionValid).toBeDefined();
  });

  describe("isConnectionValid", () => {
    it("returns true for null source or target", () => {
      const { result } = renderHook(() => useConnectionEvents());

      expect(result.current.isConnectionValid({ source: null, target: "node-1" } as any)).toBe(true);
      expect(result.current.isConnectionValid({ source: "node-1", target: null } as any)).toBe(true);
      expect(result.current.isConnectionValid({ source: null, target: null } as any)).toBe(true);
    });

    it("returns true when connection would not create a cycle", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "node-1", target: "node-4" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(true);
    });

    it("validates connections correctly with existing edges", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "node-3", target: "node-1" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(false);
    });

    it("handles direct self-reference", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "node-1", target: "node-1" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(false);
    });

    it("handles indirect cycle through multiple nodes", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "node-3", target: "node-2" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(false);
    });

    it("allows new connection from existing source to new target", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "node-1", target: "new-node" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(true);
    });

    it("allows new connection from new source to existing target", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "new-node", target: "node-2" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(true);
    });

    it("allows connection between unrelated nodes", () => {
      const { result } = renderHook(() => useConnectionEvents());

      const connection = { source: "unrelated-1", target: "unrelated-2" } as any;
      const isValid = result.current.isConnectionValid(connection);

      expect(isValid).toBe(true);
    });
  });
});
