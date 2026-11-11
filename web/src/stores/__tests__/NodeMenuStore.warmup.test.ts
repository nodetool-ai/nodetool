import { NodeMetadata } from "../ApiTypes";
import useMetadataStore from "../MetadataStore";
import { useNodeMenuStore } from "../NodeMenuStore";
import { warmSearchIndexes } from "../../utils/nodeSearch";

jest.mock("../../utils/nodeSearch", () => ({
  ...jest.requireActual("../../utils/nodeSearch"),
  warmSearchIndexes: jest.fn()
}));

const node = (node_type: string, namespace: string): NodeMetadata =>
  ({
    title: node_type,
    node_type,
    namespace,
    description: "",
    layout: "default",
    properties: [],
    outputs: [],
    recommended_models: []
  }) as unknown as NodeMetadata;

const warm = warmSearchIndexes as jest.MockedFunction<typeof warmSearchIndexes>;

describe("NodeMenuStore search index warm-up", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    warm.mockClear();
    useNodeMenuStore.setState({ nodeFilter: null, isMenuOpen: false });
    useMetadataStore.setState({
      metadata: {
        "text.Concat": node("text.Concat", "text"),
        "comfy.Sampler": node("comfy.Sampler", "comfy")
      }
    });
    jest.runOnlyPendingTimers();
    warm.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds the indexes for the menu's filtered catalog after the filter is set", () => {
    useNodeMenuStore
      .getState()
      .setNodeFilter((candidate) => !candidate.node_type.startsWith("comfy."));
    expect(warm).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();

    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm.mock.calls[0][0].map((n) => n.node_type)).toEqual(["text.Concat"]);
  });

  it("rebuilds them when the catalog changes under a filter", () => {
    useNodeMenuStore.getState().setNodeFilter(() => true);
    jest.runOnlyPendingTimers();
    warm.mockClear();

    useMetadataStore.setState({
      metadata: { "text.Split": node("text.Split", "text") }
    });
    jest.runOnlyPendingTimers();

    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm.mock.calls[0][0].map((n) => n.node_type)).toEqual(["text.Split"]);
  });

  it("skips the work while no menu has set a filter", () => {
    useMetadataStore.setState({
      metadata: { "text.Split": node("text.Split", "text") }
    });
    jest.runOnlyPendingTimers();

    expect(warm).not.toHaveBeenCalled();
  });
});
