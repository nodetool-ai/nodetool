import { renderHook, act } from "@testing-library/react";
import { asMock } from "../../../test-utils/doubles";
import { useAddNodeFromAsset } from "../addNodeFromAsset";
import { useNodes } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../stores/NotificationStore");
// fetch is used natively for asset downloads
global.fetch = jest.mocked(jest.fn());

describe("useAddNodeFromAsset", () => {
  const mockAddNode = jest.fn();
  const mockCreateNode = jest.fn();
  const mockGetMetadata = jest.fn();
  const mockAddNotification = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    asMock(useNodes).mockImplementation((selector) => {
      const state = {
        addNode: mockAddNode,
        createNode: mockCreateNode
      };
      return selector ? selector(state) : state;
    });

    asMock(useMetadataStore).mockImplementation((selector) => {
      const state = {
        getMetadata: mockGetMetadata
      };
      return selector ? selector(state) : state;
    });

    asMock(useNotificationStore).mockImplementation(
      (selector) => {
        const state = {
          addNotification: mockAddNotification
        };
        return selector ? selector(state) : state;
      }
    );
  });

  it("creates a Model3D constant node for 3D assets", () => {
    const metadata = {
      node_type: "nodetool.constant.Model3D"
    };
    const createdNode: { data: { properties: { value?: unknown; }; }; } = {
      data: {
        properties: {}
      }
    };

    mockGetMetadata.mockReturnValue(metadata);
    mockCreateNode.mockReturnValue(createdNode);

    const asset = {
      id: "asset-model-1",
      name: "mesh.glb",
      content_type: "model/gltf-binary",
      get_url: "/assets/mesh.glb"
    };

    const { result } = renderHook(() => useAddNodeFromAsset());

    act(() => {
      result.current(asset as any, { x: 120, y: 240 });
    });

    expect(mockGetMetadata).toHaveBeenCalledWith("nodetool.constant.Model3D");
    expect(mockCreateNode).toHaveBeenCalledWith(metadata, { x: 120, y: 240 });
    expect(createdNode.data.properties.value).toEqual({
      type: "model_3d",
      asset_id: "asset-model-1",
      uri: "asset://asset-model-1"
    });
    expect(mockAddNode).toHaveBeenCalledWith(createdNode);
  });

  it("creates a String constant node holding the text of a markdown asset", async () => {
    const metadata = { node_type: "nodetool.constant.String" };
    const createdNode: { data: { properties: Record<string, unknown> } } = {
      data: { properties: {} }
    };

    mockGetMetadata.mockReturnValue(metadata);
    mockCreateNode.mockReturnValue(createdNode);
    asMock(global.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("# hello").buffer
    } as unknown as Response);

    const asset = {
      id: "asset-md-1",
      name: "notes.md",
      content_type: "text/markdown",
      get_url: "/assets/notes.md"
    };

    const { result } = renderHook(() => useAddNodeFromAsset());

    await act(async () => {
      result.current(asset as any, { x: 10, y: 20 });
    });

    expect(mockGetMetadata).toHaveBeenCalledWith("nodetool.constant.String");
    expect(createdNode.data.properties.value).toBe("# hello");
    expect(mockAddNode).toHaveBeenCalledWith(createdNode);
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it("creates an AssetFolderInput node for a folder asset", () => {
    const metadata = { node_type: "nodetool.input.AssetFolderInput" };
    const createdNode: { data: { properties: Record<string, unknown> } } = {
      data: { properties: {} }
    };

    mockGetMetadata.mockReturnValue(metadata);
    mockCreateNode.mockReturnValue(createdNode);

    const asset = {
      id: "folder-1",
      name: "My Folder",
      content_type: "folder",
      get_url: null
    };

    const { result } = renderHook(() => useAddNodeFromAsset());

    act(() => {
      result.current(asset as any, { x: 0, y: 0 });
    });

    expect(mockGetMetadata).toHaveBeenCalledWith(
      "nodetool.input.AssetFolderInput"
    );
    expect(createdNode.data.properties.value).toEqual({
      type: "folder",
      uri: "",
      asset_id: "folder-1"
    });
    expect(createdNode.data.properties.name).toBe("my_folder");
    expect(mockAddNode).toHaveBeenCalledWith(createdNode);
  });
});
