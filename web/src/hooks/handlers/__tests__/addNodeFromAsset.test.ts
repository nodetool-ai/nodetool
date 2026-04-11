import { renderHook, act } from "@testing-library/react";
import { useAddNodeFromAsset } from "../addNodeFromAsset";
import { useNodes } from "../../../contexts/NodeContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../stores/NotificationStore");
// fetch is used natively for asset downloads
global.fetch = jest.fn() as jest.Mock;

describe("useAddNodeFromAsset", () => {
  const mockAddNode = jest.fn();
  const mockCreateNode = jest.fn();
  const mockGetMetadata = jest.fn();
  const mockAddNotification = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useNodes as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        addNode: mockAddNode,
        createNode: mockCreateNode
      };
      return selector ? selector(state) : state;
    });

    (useMetadataStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        getMetadata: mockGetMetadata
      };
      return selector ? selector(state) : state;
    });

    (useNotificationStore as unknown as jest.Mock).mockImplementation(
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
    const createdNode: {
      data: {
        properties: {
          value?: unknown;
        };
      };
    } = {
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
      uri: "/assets/mesh.glb"
    });
    expect(mockAddNode).toHaveBeenCalledWith(createdNode);
  });
});
