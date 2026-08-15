/**
 * Visibility rules for the toolbar shared by BaseNode and every custom node
 * type (SketchNode, SubgraphNode, WorkflowNode, the Dynamic*SchemaNodes).
 */
import type React from "react";
import { render, screen, act } from "@testing-library/react";
import NodeSelectionToolbar from "../NodeSelectionToolbar";
import useSelect from "../../../hooks/nodes/useSelect";

let mockSelectedNodeCount = 1;

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (
    selector: (state: { getSelectedNodeCount: () => number }) => unknown
  ) => selector({ getSelectedNodeCount: () => mockSelectedNodeCount })
}));

jest.mock("../NodeToolButtons", () => ({
  __esModule: true,
  default: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="tool-buttons">{nodeId}</div>
  )
}));

jest.mock("@xyflow/react", () => ({
  __esModule: true,
  NodeToolbar: ({
    isVisible,
    children
  }: {
    isVisible: boolean;
    children: React.ReactNode;
  }) => (isVisible ? <div>{children}</div> : null),
  Position: { Top: "top" }
}));

const SHOW_DELAY = 200;

const settle = (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockSelectedNodeCount = 1;
  useSelect.getState().close();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("NodeSelectionToolbar", () => {
  it("shows the node's tool buttons once the show delay elapses", () => {
    render(<NodeSelectionToolbar id="node-1" selected />);

    expect(screen.queryByTestId("tool-buttons")).not.toBeInTheDocument();

    settle(SHOW_DELAY);

    expect(screen.getByTestId("tool-buttons")).toHaveTextContent(/^node-1$/);
  });

  it("stays hidden while the node is being dragged", () => {
    render(<NodeSelectionToolbar id="node-1" selected dragging />);
    settle(SHOW_DELAY);

    expect(screen.queryByTestId("tool-buttons")).not.toBeInTheDocument();
  });

  it("hides again when a drag starts after it became visible", () => {
    const { rerender } = render(<NodeSelectionToolbar id="node-1" selected />);
    settle(SHOW_DELAY);
    expect(screen.getByTestId("tool-buttons")).toBeInTheDocument();

    rerender(<NodeSelectionToolbar id="node-1" selected dragging />);

    expect(screen.queryByTestId("tool-buttons")).not.toBeInTheDocument();
  });

  it("stays hidden when more than one node is selected", () => {
    mockSelectedNodeCount = 2;
    render(<NodeSelectionToolbar id="node-1" selected />);
    settle(SHOW_DELAY);

    expect(screen.queryByTestId("tool-buttons")).not.toBeInTheDocument();
  });

  it("stays hidden while a property select is open", () => {
    act(() => {
      useSelect.getState().open("some-select");
    });
    render(<NodeSelectionToolbar id="node-1" selected />);
    settle(SHOW_DELAY);

    expect(screen.queryByTestId("tool-buttons")).not.toBeInTheDocument();
  });
});
