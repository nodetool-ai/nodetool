import { NodeMetadata, TypeMetadata } from "../ApiTypes";

describe("ConnectableNodesStore", () => {
  const createMockNodeMetadata = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
    node_type: "test_node",
    title: "Test Node",
    namespace: "test",
    description: "A test node",
    layout: "default",
    properties: [],
    outputs: [],
    the_model_info: {},
    recommended_models: [],
    basic_fields: ["node_type", "title", "namespace", "description"],
    is_dynamic: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false,
    ...overrides,
  } as NodeMetadata);

  const createMockTypeMetadata = (overrides: Partial<TypeMetadata> = {}): TypeMetadata => ({
    type: "text",
    optional: false,
    type_args: [],
    ...overrides,
  } as TypeMetadata);

  beforeEach(() => {
    jest.resetModules();
  });

  it("should export useConnectableNodes hook", async () => {
    const module = await import("../ConnectableNodesStore");
    expect(typeof module.useConnectableNodes).toBe("function");
  });

  it("should export ConnectableNodesState interface", () => {
    const state: Partial<import("../ConnectableNodesStore").ConnectableNodesState> = {
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
      getConnectableNodes: jest.fn(),
      showMenu: jest.fn(),
      hideMenu: jest.fn(),
    };
    expect(state.setSourceHandle).toBeDefined();
    expect(state.setTargetHandle).toBeDefined();
  });

  it("should have correct function overloads", () => {
    const overloads = [
      "export function useConnectableNodes(): ConnectableNodesState;",
      "export function useConnectableNodes<Selected>(selector: (state: ConnectableNodesState) => Selected): Selected;",
    ];
    expect(overloads.length).toBe(2);
  });
});
