
import { renderHook, act } from "@testing-library/react";
import { useDropHandler } from "../useDropHandler";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../../contexts/NodeContext";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useAuth from "../../../stores/useAuth";
import { useAddNodeFromAsset } from "../addNodeFromAsset";
import { useRecentNodesStore } from "../../../stores/RecentNodesStore";
import { useFileHandlers } from "../dropHandlerUtils";
import useMetadataStore from "../../../stores/MetadataStore";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../stores/AssetStore");
jest.mock("../../../stores/NotificationStore");
jest.mock("../../../stores/useAuth");
jest.mock("../addNodeFromAsset");
jest.mock("../../../stores/RecentNodesStore");
jest.mock("../dropHandlerUtils");
jest.mock("../../../stores/MetadataStore");

describe("useDropHandler", () => {
  const mockScreenToFlowPosition = jest.fn();
  const mockCreateNode = jest.fn();
  const mockAddNode = jest.fn();
  const mockGetAsset = jest.fn();
  const mockAddNodeFromAsset = jest.fn();
  const mockAddRecentNode = jest.fn();
  const mockAddNotification = jest.fn();
  const mockGetMetadata = jest.fn();

  // File handlers mocks
  const mockHandlePngFile = jest.fn();
  const mockHandleJsonFile = jest.fn();
  const mockHandleCsvFile = jest.fn();
  const mockHandleGenericFile = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useReactFlow as jest.Mock).mockReturnValue({
      screenToFlowPosition: mockScreenToFlowPosition.mockReturnValue({ x: 0, y: 0 })
    });

    (useNodes as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
            addNode: mockAddNode,
            createNode: mockCreateNode,
            updateNodeData: jest.fn()
        };
        return selector ? selector(state) : state;
    });

    (useAssetStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = { get: mockGetAsset };
      return selector ? selector(state) : state.get;
    });

    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: { id: "user-123" }
    });

    (useNotificationStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = { addNotification: mockAddNotification };
        return selector ? selector(state) : state.addNotification;
    });

    (useAddNodeFromAsset as unknown as jest.Mock).mockReturnValue(mockAddNodeFromAsset);

    (useRecentNodesStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = { addRecentNode: mockAddRecentNode };
        return selector ? selector(state) : state.addRecentNode;
    });

    (useFileHandlers as unknown as jest.Mock).mockReturnValue({
        handlePngFile: mockHandlePngFile,
        handleJsonFile: mockHandleJsonFile,
        handleCsvFile: mockHandleCsvFile,
        handleGenericFile: mockHandleGenericFile
    });

    (useMetadataStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = { getMetadata: mockGetMetadata };
      return selector ? selector(state) : state;
    });
  });

  it("creates a constant sketch node when dropping a sketch on the pane", async () => {
    const { result } = renderHook(() => useDropHandler());
    const sketchMetadata = {
      node_type: "nodetool.constant.Sketch",
      title: "Sketch",
      properties: [],
      outputs: []
    };
    const node: {
      id: string;
      type: string;
      data: {
        properties: Record<string, unknown>;
        dynamic_properties: Record<string, unknown>;
        workflow_id: string;
        title?: string;
      };
    } = {
      id: "node-1",
      type: "nodetool.constant.Sketch",
      data: { properties: {}, dynamic_properties: {}, workflow_id: "wf" }
    };
    mockGetMetadata.mockReturnValue(sketchMetadata);
    mockCreateNode.mockReturnValue(node);

    const dropEvent = {
      preventDefault: jest.fn(),
      target: { classList: { contains: () => true } },
      clientX: 100,
      clientY: 100,
      dataTransfer: {
        getData: jest.fn().mockImplementation((format) => {
          if (format === "application/x-nodetool-drag") {
            return JSON.stringify({
              type: "sketch",
              payload: { id: "sketch-1", name: "Character Sheet" }
            });
          }
          return "";
        }),
        types: ["application/x-nodetool-drag"],
        items: [],
        files: []
      }
    } as unknown as React.DragEvent<HTMLDivElement>;

    await act(async () => {
      await result.current.onDrop(dropEvent);
    });

    expect(mockGetMetadata).toHaveBeenCalledWith("nodetool.constant.Sketch");
    expect(mockCreateNode).toHaveBeenCalledWith(sketchMetadata, { x: 0, y: 0 });
    expect(node.data.properties.value).toEqual({
      type: "sketch",
      id: "sketch-1"
    });
    expect(node.data.title).toBe("Character Sheet");
    expect(mockAddNode).toHaveBeenCalledWith(node);
    expect(mockAddRecentNode).toHaveBeenCalledWith("nodetool.constant.Sketch");
  });

  it("creates a constant timeline node when dropping a timeline on the pane", async () => {
    const { result } = renderHook(() => useDropHandler());
    const timelineMetadata = {
      node_type: "nodetool.constant.Timeline",
      title: "Timeline",
      properties: [],
      outputs: []
    };
    const node: {
      id: string;
      type: string;
      data: {
        properties: Record<string, unknown>;
        dynamic_properties: Record<string, unknown>;
        workflow_id: string;
        title?: string;
      };
    } = {
      id: "node-1",
      type: "nodetool.constant.Timeline",
      data: { properties: {}, dynamic_properties: {}, workflow_id: "wf" }
    };
    mockGetMetadata.mockReturnValue(timelineMetadata);
    mockCreateNode.mockReturnValue(node);

    const dropEvent = {
      preventDefault: jest.fn(),
      target: { classList: { contains: () => true } },
      clientX: 100,
      clientY: 100,
      dataTransfer: {
        getData: jest.fn().mockImplementation((format) => {
          if (format === "application/x-nodetool-drag") {
            return JSON.stringify({
              type: "timeline",
              payload: { id: "timeline-1", name: "Launch Cutdown" }
            });
          }
          return "";
        }),
        types: ["application/x-nodetool-drag"],
        items: [],
        files: []
      }
    } as unknown as React.DragEvent<HTMLDivElement>;

    await act(async () => {
      await result.current.onDrop(dropEvent);
    });

    expect(mockGetMetadata).toHaveBeenCalledWith("nodetool.constant.Timeline");
    expect(mockCreateNode).toHaveBeenCalledWith(timelineMetadata, { x: 0, y: 0 });
    expect(node.data.properties.value).toEqual({
      type: "timeline",
      id: "timeline-1"
    });
    expect(node.data.title).toBe("Launch Cutdown");
    expect(mockAddNode).toHaveBeenCalledWith(node);
    expect(mockAddRecentNode).toHaveBeenCalledWith("nodetool.constant.Timeline");
  });

  it("handles multiple assets drop correctly", async () => {
    const { result } = renderHook(() => useDropHandler());
    const { onDrop } = result.current;

    const assets = [
        { id: "asset-1", name: "Asset 1" },
        { id: "asset-2", name: "Asset 2" },
        { id: "asset-3", name: "Asset 3" }
    ];

    // Mock getAsset to return a promise that resolves after a short delay
    mockGetAsset.mockImplementation((id) => {
        return new Promise(resolve => {
            setTimeout(() => {
                const asset = assets.find(a => a.id === id);
                resolve(asset);
            }, 10);
        });
    });

    const dropEvent = {
        preventDefault: jest.fn(),
        target: { classList: { contains: () => true } }, // Is Pane
        clientX: 100,
        clientY: 100,
        dataTransfer: {
            getData: jest.fn().mockImplementation((format) => {
                if (format === "application/x-nodetool-drag") {
                    return JSON.stringify({
                        type: "assets-multiple",
                        payload: ["asset-1", "asset-2", "asset-3"]
                    });
                }
                return "";
            }),
            types: ["application/x-nodetool-drag"],
            items: [],
            files: []
        }
    } as unknown as React.DragEvent<HTMLDivElement>;

    await act(async () => {
        await onDrop(dropEvent);
    });

    expect(mockGetAsset).toHaveBeenCalledTimes(3);

    // Since we awaited onDrop, and onDrop awaits all getAssets,
    // addNodeFromAsset should have been called by now.
    expect(mockAddNodeFromAsset).toHaveBeenCalledTimes(3);
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(assets[0], expect.anything());
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(assets[1], expect.anything());
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(assets[2], expect.anything());
  });

  it("handles mixed success/failure in multiple assets drop", async () => {
    const { result } = renderHook(() => useDropHandler());
    const { onDrop } = result.current;

    const assets = [
        { id: "asset-1", name: "Asset 1" },
        { id: "asset-fail", name: "Asset Fail" },
        { id: "asset-3", name: "Asset 3" }
    ];

    mockGetAsset.mockImplementation((id) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (id === "asset-fail") {
                    reject(new Error("Network Error"));
                } else {
                    const asset = assets.find(a => a.id === id);
                    resolve(asset);
                }
            }, 10);
        });
    });

    const dropEvent = {
        preventDefault: jest.fn(),
        target: { classList: { contains: () => true } }, // Is Pane
        clientX: 100,
        clientY: 100,
        dataTransfer: {
            getData: jest.fn().mockImplementation((format) => {
                if (format === "application/x-nodetool-drag") {
                    return JSON.stringify({
                        type: "assets-multiple",
                        payload: ["asset-1", "asset-fail", "asset-3"]
                    });
                }
                return "";
            }),
            types: ["application/x-nodetool-drag"],
            items: [],
            files: []
        }
    } as unknown as React.DragEvent<HTMLDivElement>;

    await act(async () => {
        await onDrop(dropEvent);
    });

    // Expect getAsset called 3 times
    expect(mockGetAsset).toHaveBeenCalledTimes(3);

    // Expect addNodeFromAsset called 2 times (for successful ones)
    expect(mockAddNodeFromAsset).toHaveBeenCalledTimes(2);
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(assets[0], expect.anything());
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(assets[2], expect.anything());

    // Expect notification for failure
    expect(mockAddNotification).toHaveBeenCalledWith(expect.objectContaining({
        type: "error",
        content: expect.stringContaining("Failed to load 1 asset. Check console for details.")
    }));
  });
});
