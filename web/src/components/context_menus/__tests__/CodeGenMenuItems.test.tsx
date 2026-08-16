import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

const mockCloseContextMenu = jest.fn();
const mockTransformOutput = jest.fn();
const mockCreateValue = jest.fn();

let mockMenuState: Record<string, unknown>;
let mockNodeState: Record<string, unknown>;

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: unknown) => T) => selector(mockMenuState)
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: <T,>(selector: (s: unknown) => T) => selector(mockNodeState)
}));

jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useReactFlow: () => ({
    screenToFlowPosition: (p: { x: number; y: number }) => p
  })
}));

jest.mock("../../../hooks/useCodeGenFromHandle", () => ({
  useCodeGenFromHandle: () => ({
    transformOutput: mockTransformOutput,
    createValue: mockCreateValue
  })
}));

import InputContextMenu from "../InputContextMenu";
import OutputContextMenu from "../OutputContextMenu";
import useMetadataStore from "../../../stores/MetadataStore";

const listType = { type: "list", type_args: [{ type: "str", type_args: [] }] };
const strType = { type: "str", type_args: [] };

const renderMenu = (menu: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{menu}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  useMetadataStore.setState({
    metadata: {
      "nodetool.code.Code": {
        node_type: "nodetool.code.Code",
        title: "Code",
        description: "",
        namespace: "nodetool.code",
        layout: "default",
        properties: [],
        outputs: [],
        recommended_models: [],
        supports_dynamic_inputs: true,
        supports_dynamic_outputs: true,
        is_streaming_output: false,
        required_settings: []
      }
    }
  } as never);
  mockNodeState = {
    createNode: jest.fn(),
    addNode: jest.fn(),
    addEdge: jest.fn(),
    generateEdgeId: jest.fn(() => "e1"),
    findNode: jest.fn(),
    deleteEdges: jest.fn(),
    setEdges: jest.fn(),
    updateNodeData: jest.fn(),
    validateConnection: jest.fn(() => true),
    edges: []
  };
});

describe("OutputContextMenu — Transform this output…", () => {
  beforeEach(() => {
    mockMenuState = {
      nodeId: "src-1",
      menuPosition: { x: 10, y: 20 },
      closeContextMenu: mockCloseContextMenu,
      type: listType,
      handleId: "rows",
      payload: null
    };
  });

  it("hands the source handle's name and type to the generator", async () => {
    const user = userEvent.setup();
    renderMenu(<OutputContextMenu />);

    await user.click(
      screen.getByRole("button", { name: /transform this output/i })
    );

    expect(mockTransformOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: "src-1",
        sourceHandle: "rows",
        sourceType: listType
      })
    );
    expect(mockCloseContextMenu).toHaveBeenCalled();
  });

  it("is hidden for a handle with no resolved type", () => {
    mockMenuState.type = null;
    renderMenu(<OutputContextMenu />);
    expect(
      screen.queryByRole("button", { name: /transform this output/i })
    ).not.toBeInTheDocument();
  });
});

describe("InputContextMenu — Create value with AI…", () => {
  beforeEach(() => {
    mockMenuState = {
      nodeId: "dst-1",
      menuPosition: { x: 10, y: 20 },
      closeContextMenu: mockCloseContextMenu,
      type: strType,
      handleId: "text",
      payload: null
    };
  });

  it("hands the destination handle's name and type to the generator", async () => {
    const user = userEvent.setup();
    renderMenu(<InputContextMenu />);

    await user.click(
      screen.getByRole("button", { name: /create value with ai/i })
    );

    expect(mockCreateValue).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: "dst-1",
        targetHandle: "text",
        targetType: strType
      })
    );
    expect(mockCloseContextMenu).toHaveBeenCalled();
  });

  it("is hidden for a handle with no resolved type", () => {
    mockMenuState.type = null;
    renderMenu(<InputContextMenu />);
    expect(
      screen.queryByRole("button", { name: /create value with ai/i })
    ).not.toBeInTheDocument();
  });
});
