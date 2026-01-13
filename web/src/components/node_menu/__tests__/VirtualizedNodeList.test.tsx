import React from "react";
import { render, screen } from "@testing-library/react";
import VirtualizedNodeList from "../VirtualizedNodeList";
import { NodeMetadata } from "../../../stores/ApiTypes";

jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: jest.fn(() => ({
    getVirtualItems: jest.fn(() => [
      { key: "0", index: 0, start: 0, size: 48, end: 48 },
      { key: "1", index: 1, start: 48, size: 48, end: 96 },
      { key: "2", index: 2, start: 96, size: 48, end: 144 }
    ]),
    getTotalSize: jest.fn(() => 144),
    getScrollElement: jest.fn(() => null)
  }))
}));

jest.mock("../../../stores/NodeMenuStore", () => ({
  useNodeMenuStore: jest.fn((selector) =>
    selector({
      groupedSearchResults: [],
      searchTerm: "",
      selectedPath: []
    })
  )
}));

jest.mock("../../../hooks/useCreateNode", () => ({
  useCreateNode: jest.fn(() => jest.fn())
}));

jest.mock("../../../lib/dragdrop", () => ({
  serializeDragData: jest.fn()
}));

jest.mock("../../../lib/dragdrop/store", () => ({
  useDragDropStore: jest.fn((selector) =>
    selector({
      setActiveDrag: jest.fn(),
      clearDrag: jest.fn()
    })
  )
}));

jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn(() => jest.fn())
}));

jest.mock("../../node/ApiKeyValidation", () => ({
  __esModule: true,
  default: ({ nodeNamespace }: { nodeNamespace: string }) => (
    <div data-testid="api-key-validation">API Key Validation for {nodeNamespace}</div>
  )
}));

jest.mock("../../node_menu/NodeItem", () => ({
  __esModule: true,
  default: ({ node }: { node: NodeMetadata }) => (
    <div data-testid="node-item">{node.title || node.node_type}</div>
  )
}));

jest.mock("../../node_menu/SearchResultItem", () => ({
  __esModule: true,
  default: ({ node }: { node: NodeMetadata }) => (
    <div data-testid="search-result-item">{node.title || node.node_type}</div>
  )
}));

const createMockNode = (id: string, namespace: string): NodeMetadata => ({
  node_type: `nodetool.${id}`,
  namespace,
  description: `Test node ${id}`,
  title: `Test Node ${id}`,
  layout: "default",
  properties: [],
  outputs: [],
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  is_streaming_output: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false
});

describe("VirtualizedNodeList", () => {
  const mockNodes: NodeMetadata[] = Array.from({ length: 60 }, (_, i) =>
    createMockNode(`node-${i}`, `test.namespace${i % 3}`)
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when nodes array is empty", () => {
    const { container } = render(
      <VirtualizedNodeList
        nodes={[]}
        containerRef={{ current: null }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nodes with virtualization", () => {
    const containerRef = { current: document.createElement("div") };

    render(
      <VirtualizedNodeList
        nodes={mockNodes}
        containerRef={containerRef}
      />
    );

    expect(screen.getByText("Test Node node-0")).toBeInTheDocument();
  });

  it("applies correct styles for virtualized list", () => {
    const containerRef = { current: document.createElement("div") };

    const { container } = render(
      <VirtualizedNodeList
        nodes={mockNodes}
        containerRef={containerRef}
      />
    );

    const listContainer = container.querySelector(".virtualized-list");
    expect(listContainer).toBeInTheDocument();
  });
});
