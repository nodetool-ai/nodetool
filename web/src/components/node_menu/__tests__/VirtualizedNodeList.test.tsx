import { render, screen } from "@testing-library/react";
import React from "react";
import { NodeMetadata } from "../../../stores/ApiTypes";

jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: jest.fn(() => ({
    getVirtualItems: jest.fn(() => [
      { index: 0, start: 0, size: 32, key: "header-0" },
      { index: 1, start: 32, size: 32, key: "node-0" }
    ]),
    getTotalSize: jest.fn(() => 1600),
    measureElement: jest.fn(),
    scrollToIndex: jest.fn()
  }))
}));

jest.mock("../../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: jest.fn((selector) =>
    selector({
      setDragToCreate: jest.fn(),
      searchTerm: "",
      groupedSearchResults: mockGroupedResults
    })
  )
}));

jest.mock("../../../hooks/useCreateNode", () => ({
  useCreateNode: () => jest.fn()
}));

jest.mock("../../../lib/dragdrop/store", () => ({
  useDragDropStore: jest.fn((selector) =>
    selector({
      setActiveDrag: jest.fn(),
      clearDrag: jest.fn()
    })
  )
}));

jest.mock("../../node/ApiKeyValidation", () => ({
  __esModule: true,
  default: () => <div data-testid="api-key-validation">API Key Validation</div>
}));

jest.mock("../NodeItem", () => ({
  __esModule: true,
  default: ({ node }: { node: NodeMetadata }) => <div data-testid="node-item">{node.title}</div>
}));

jest.mock("../SearchResultItem", () => ({
  __esModule: true,
  default: ({ node }: { node: NodeMetadata }) => <div data-testid="search-result-item">{node.title}</div>
}));

const mockNodeBase = {
  title: "Test Node",
  description: "Test description",
  namespace: "test.namespace",
  node_type: "test.namespace.TestNode",
  layout: "default" as const,
  properties: [],
  outputs: [{ name: "output", type: { type: "text", optional: false, values: null, type_args: [], type_name: null }, stream: false }],
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  is_streaming_output: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false
};

const createMockNode = (index: number): NodeMetadata => ({
  ...mockNodeBase,
  title: `Node${index}`,
  node_type: `nodetool.test.Node${index}`
});

const mockNodes: NodeMetadata[] = Array.from({ length: 50 }, (_, i) =>
  createMockNode(i)
);

const mockGroupedResults = [
  {
    namespace: "nodetool.test",
    nodes: mockNodes
  }
];

describe("VirtualizedNodeList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders empty state when no nodes are provided", async () => {
    const { default: VirtualizedNodeList } = await import("../VirtualizedNodeList");
    render(
      <VirtualizedNodeList
        nodes={[]}
        groupedSearchResults={[]}
        searchTerm=""
      />
    );

    expect(screen.getByText("Browse Nodes")).toBeInTheDocument();
    expect(screen.getByText("Search Nodes")).toBeInTheDocument();
    expect(screen.getByText("Create Nodes")).toBeInTheDocument();
  });

  it("renders API key validation component", async () => {
    const { default: VirtualizedNodeList } = await import("../VirtualizedNodeList");
    render(
      <VirtualizedNodeList
        nodes={mockNodes}
        groupedSearchResults={mockGroupedResults}
        searchTerm=""
      />
    );

    expect(screen.getByTestId("api-key-validation")).toBeInTheDocument();
    expect(screen.getByText("API Key Validation")).toBeInTheDocument();
  });

  it("renders namespace header for non-search mode", async () => {
    const { default: VirtualizedNodeList } = await import("../VirtualizedNodeList");
    render(
      <VirtualizedNodeList
        nodes={mockNodes}
        groupedSearchResults={mockGroupedResults}
        searchTerm=""
      />
    );

    expect(screen.getByText("nodetool.test")).toBeInTheDocument();
  });

  it("renders virtualized list container", async () => {
    const { default: VirtualizedNodeList } = await import("../VirtualizedNodeList");
    render(
      <VirtualizedNodeList
        nodes={mockNodes}
        groupedSearchResults={mockGroupedResults}
        searchTerm=""
      />
    );

    const container = screen.getByTestId("api-key-validation").parentElement?.parentElement;
    expect(container).toBeInTheDocument();
    expect(container).toBeInstanceOf(HTMLDivElement);
  });

  it("renders search results when searchTerm is provided", async () => {
    const { default: VirtualizedNodeList } = await import("../VirtualizedNodeList");
    const searchResults = [
      {
        namespace: "Results",
        nodes: mockNodes.slice(0, 2)
      }
    ];

    render(
      <VirtualizedNodeList
        nodes={mockNodes}
        groupedSearchResults={searchResults}
        searchTerm="Node"
      />
    );

    expect(screen.getAllByTestId("search-result-item")).toHaveLength(2);
  });
});
