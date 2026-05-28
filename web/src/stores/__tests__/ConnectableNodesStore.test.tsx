import * as React from "react";
import { renderHook } from "@testing-library/react";
import { ConnectableNodesContext } from "../../providers/ConnectableNodesProvider";
import {
  useConnectableNodes,
  ConnectableNodesState
} from "../ConnectableNodesStore";

const createMockState = (
  overrides: Partial<ConnectableNodesState> = {}
): ConnectableNodesState => ({
  nodeMetadata: [],
  filterType: null,
  typeMetadata: null,
  isVisible: false,
  sourceHandle: null,
  targetHandle: null,
  nodeId: null,
  menuPosition: null,
  setSourceHandle: jest.fn(),
  setTargetHandle: jest.fn(),
  setNodeId: jest.fn(),
  setFilterType: jest.fn(),
  setTypeMetadata: jest.fn(),
  getConnectableNodes: jest.fn(() => []),
  showMenu: jest.fn(),
  hideMenu: jest.fn(),
  ...overrides
});

const createWrapper = (value: ConnectableNodesState) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ConnectableNodesContext.Provider value={value}>
        {children}
      </ConnectableNodesContext.Provider>
    );
  };
};

describe("useConnectableNodes", () => {
  it("throws when used outside a provider", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    expect(() => renderHook(() => useConnectableNodes())).toThrow(
      "useConnectableNodes must be used within a ConnectableNodesProvider"
    );
    consoleSpy.mockRestore();
  });

  it("returns the full context when no selector is provided", () => {
    const mockState = createMockState({
      isVisible: true,
      filterType: "input",
      nodeId: "node-1",
      menuPosition: { x: 100, y: 200 }
    });

    const { result } = renderHook(() => useConnectableNodes(), {
      wrapper: createWrapper(mockState)
    });

    expect(result.current).toBe(mockState);
  });

  it("returns selected value when a selector is provided", () => {
    const mockState = createMockState({
      isVisible: true,
      filterType: "output",
      sourceHandle: "handle-1"
    });

    const { result } = renderHook(
      () => useConnectableNodes((s) => s.filterType),
      { wrapper: createWrapper(mockState) }
    );

    expect(result.current).toBe("output");
  });
});
