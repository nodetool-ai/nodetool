import { renderHook, act } from "@testing-library/react";
import { useCreateStarterWorkflow } from "../useCreateStarterWorkflow";
import useMetadataStore from "../../stores/MetadataStore";
import {
  WELCOME_TRACKS,
  STRING_NODE_TYPE,
  PREVIEW_NODE_TYPE
} from "../../components/portal/welcomeTracks";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

const mockNs = {
  createNode: jest.fn(),
  addNode: jest.fn(),
  onConnect: jest.fn()
};
const mockNodeStore = { getState: () => mockNs };
const mockManager = {
  newWorkflow: jest.fn(() => ({ id: "wf-1", graph: { nodes: [], edges: [] } })),
  addWorkflow: jest.fn(),
  setCurrentWorkflowId: jest.fn(),
  getNodeStore: jest.fn(() => mockNodeStore)
};

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({ getState: () => mockManager })
}));

jest.mock("../../stores/MetadataStore", () => {
  const store = jest.fn() as jest.Mock & { getState: jest.Mock };
  store.getState = jest.fn();
  return { __esModule: true, default: store };
});

const idForType = (type: string) => `${type}#id`;

describe("useCreateStarterWorkflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNs.createNode.mockImplementation((metadata: { node_type: string }) => ({
      id: idForType(metadata.node_type)
    }));
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn((type: string) => ({ node_type: type, properties: [] }))
    });
  });

  it("creates exactly three nodes and opens the editor", () => {
    const { result } = renderHook(() => useCreateStarterWorkflow());

    act(() => {
      result.current("image");
    });

    expect(mockManager.addWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wf-1", name: "Image starter" })
    );
    expect(mockNs.createNode).toHaveBeenCalledTimes(3);
    expect(mockNavigate).toHaveBeenCalledWith("/editor/wf-1");
  });

  it("seeds the String node with the track's sample prompt", () => {
    const imageTrack = WELCOME_TRACKS.find((t) => t.id === "image")!;
    const { result } = renderHook(() => useCreateStarterWorkflow());

    act(() => {
      result.current("image");
    });

    const stringCall = mockNs.createNode.mock.calls[0];
    expect(stringCall[0]).toEqual(
      expect.objectContaining({ node_type: STRING_NODE_TYPE })
    );
    expect(stringCall[2]).toEqual({ value: imageTrack.samplePrompt });
  });

  it.each(WELCOME_TRACKS.map((t) => t.id))(
    "wires String -> model -> Preview with the right handles for %s",
    (trackId) => {
      const track = WELCOME_TRACKS.find((t) => t.id === trackId)!;
      const { result } = renderHook(() => useCreateStarterWorkflow());

      act(() => {
        result.current(trackId);
      });

      expect(mockNs.onConnect).toHaveBeenNthCalledWith(1, {
        source: idForType(STRING_NODE_TYPE),
        sourceHandle: "output",
        target: idForType(track.modelType),
        targetHandle: track.promptInput
      });
      expect(mockNs.onConnect).toHaveBeenNthCalledWith(2, {
        source: idForType(track.modelType),
        sourceHandle: track.outputHandle,
        target: idForType(PREVIEW_NODE_TYPE),
        targetHandle: "value"
      });
    }
  );

  it("falls back to a blank editor when the model node pack is unavailable", () => {
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn((type: string) =>
        type === "nodetool.image.TextToImage"
          ? undefined
          : { node_type: type, properties: [] }
      )
    });

    const { result } = renderHook(() => useCreateStarterWorkflow());

    act(() => {
      result.current("image");
    });

    expect(mockNs.createNode).not.toHaveBeenCalled();
    expect(mockNs.onConnect).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/editor/wf-1");
  });
});
