import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ClipboardHistoryPanel from "../ClipboardHistoryPanel";
import useClipboardHistoryStore from "../../../stores/ClipboardHistoryStore";

const mockHistory = [
  {
    id: "item-1",
    timestamp: Date.now() - 60000,
    nodeCount: 2,
    edgeCount: 1,
    previewNodes: [
      { id: "node-1", type: "textInput", label: "Text Input" },
      { id: "node-2", type: "llm", label: "LLM Node" }
    ],
    data: '{"nodes":[], "edges":[]}'
  },
  {
    id: "item-2",
    timestamp: Date.now() - 120000,
    nodeCount: 1,
    edgeCount: 0,
    previewNodes: [{ id: "node-3", type: "output", label: "Output Node" }],
    data: '{"nodes":[], "edges":[]}'
  }
];

const mockOnClose = jest.fn();

const mockClearHistory = jest.fn();
const mockRemoveItem = jest.fn();

const mockUseClipboardHistoryStore = useClipboardHistoryStore as jest.Mock;

mockUseClipboardHistoryStore.mockImplementation((selector) => {
  const state = {
    history: mockHistory,
    clearHistory: mockClearHistory,
    removeItem: mockRemoveItem
  };
  return selector(state);
});

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn((pos) => pos)
  }))
}));

jest.mock("../../../utils/MousePosition", () => ({
  getMousePosition: jest.fn(() => ({ x: 100, y: 100 }))
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(() => ({
    setNodes: jest.fn(),
    setEdges: jest.fn(),
    nodes: [],
    edges: [],
    workflow: { id: "test-workflow" }
  }))
}));

describe("ClipboardHistoryPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dialog when open is true", () => {
    render(
      <ClipboardHistoryPanel open={true} onClose={mockOnClose} />
    );

    expect(screen.getByText("Clipboard History")).toBeInTheDocument();
  });

  it("does not render dialog when open is false", () => {
    render(
      <ClipboardHistoryPanel open={false} onClose={mockOnClose} />
    );

    expect(
      screen.queryByText("Clipboard History")
    ).not.toBeInTheDocument();
  });

  it("displays history items with node count and edge count", () => {
    render(
      <ClipboardHistoryPanel open={true} onClose={mockOnClose} />
    );

    expect(screen.getByText("2 nodes, 1 edge")).toBeInTheDocument();
    expect(screen.getByText("1 node")).toBeInTheDocument();
  });

  it("displays preview node labels", () => {
    render(
      <ClipboardHistoryPanel open={true} onClose={mockOnClose} />
    );

    expect(screen.getByText("Text Input")).toBeInTheDocument();
    expect(screen.getByText("Output Node")).toBeInTheDocument();
  });

  it("shows Clear All button when history is not empty", () => {
    render(
      <ClipboardHistoryPanel open={true} onClose={mockOnClose} />
    );

    expect(screen.getByText("Clear All")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(
      <ClipboardHistoryPanel open={true} onClose={mockOnClose} />
    );

    const closeButton = screen.getByLabelText("close");
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
