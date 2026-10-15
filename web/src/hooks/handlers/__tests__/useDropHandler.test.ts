
import { renderHook, act } from "@testing-library/react";
import { asMock, stub } from "../../../test-utils/doubles";
import { useDropHandler } from "../useDropHandler";
import { useReactFlow } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { insertGraphFragment } from "../insertGraphFragment";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useAuth from "../../../stores/useAuth";
import { useAddNodeFromAsset } from "../addNodeFromAsset";
import { useRecentNodesStore } from "../../../stores/RecentNodesStore";
import { useFileHandlers } from "../dropHandlerUtils";
import useMetadataStore from "../../../stores/MetadataStore";

/** A drag/click target that answers `classList.contains("react-flow__pane")`. */
const paneTarget = (isPane: boolean): HTMLDivElement => {
  const el = document.createElement("div");
  if (isPane) {
    el.classList.add("react-flow__pane");
  }
  return el;
};


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
jest.mock("../insertGraphFragment");
jest.mock("../../../stores/MetadataStore");
const mockAddExampleModelAsset = jest.fn();
jest.mock("../../useAddExampleModelAsset", () => ({
  useAddExampleModelAsset: () => mockAddExampleModelAsset
}));
const mockInstallExampleTimeline = jest.fn();
const mockInstallExampleStoryboard = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      installExample: {
        mutate: (...args: unknown[]) => mockInstallExampleTimeline(...args)
      }
    },
    storyboards: {
      installExample: {
        mutate: (...args: unknown[]) => mockInstallExampleStoryboard(...args)
      }
    }
  }
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "personal:test"
}));

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

    asMock(useNodes).mockImplementation((selector) => {
        const state = {
            addNode: mockAddNode,
            createNode: mockCreateNode,
            updateNodeData: jest.fn()
        };
        return selector ? selector(state) : state;
    });

    asMock(useAssetStore).mockImplementation((selector) => {
      const state = { get: mockGetAsset };
      return selector ? selector(state) : state.get;
    });

    asMock(useAuth).mockReturnValue({
      user: { id: "user-123" }
    });

    asMock(useNotificationStore).mockImplementation((selector) => {
        const state = { addNotification: mockAddNotification };
        return selector ? selector(state) : state.addNotification;
    });

    asMock(useAddNodeFromAsset).mockReturnValue(mockAddNodeFromAsset);

    asMock(useRecentNodesStore).mockImplementation((selector) => {
        const state = { addRecentNode: mockAddRecentNode };
        return selector ? selector(state) : state.addRecentNode;
    });

    asMock(useFileHandlers).mockReturnValue({
        handlePngFile: mockHandlePngFile,
        handleJsonFile: mockHandleJsonFile,
        handleCsvFile: mockHandleCsvFile,
        handleGenericFile: mockHandleGenericFile
    });

    asMock(useMetadataStore).mockImplementation((selector) => {
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

    const dropEvent = stub<React.DragEvent<HTMLDivElement>>({
      preventDefault: jest.fn(),
      target: paneTarget(true),
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
    });

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

    const dropEvent = stub<React.DragEvent<HTMLDivElement>>({
      preventDefault: jest.fn(),
      target: paneTarget(true),
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
    });

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

    const dropEvent = stub<React.DragEvent<HTMLDivElement>>({
        preventDefault: jest.fn(),
        target: paneTarget(true), // Is Pane
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
    });

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

    const dropEvent = stub<React.DragEvent<HTMLDivElement>>({
        preventDefault: jest.fn(),
        target: paneTarget(true), // Is Pane
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
    });

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

  it("places each dropped external file at its own position", async () => {
    const { result } = renderHook(() => useDropHandler());
    const { onDrop } = result.current;
    mockHandleGenericFile.mockResolvedValue({ success: true });

    const files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" })
    ];
    const dropEvent = stub<React.DragEvent<HTMLDivElement>>({
      preventDefault: jest.fn(),
      target: paneTarget(true),
      clientX: 100,
      clientY: 100,
      dataTransfer: {
        getData: jest.fn().mockReturnValue(""),
        types: ["Files"],
        items: [{ kind: "file" }, { kind: "file" }] as unknown as DataTransferItemList,
        files
      }
    });

    await act(async () => {
      await onDrop(dropEvent);
    });

    expect(mockHandleGenericFile).toHaveBeenCalledTimes(2);
    const [, firstPosition] = mockHandleGenericFile.mock.calls[0];
    const [, secondPosition] = mockHandleGenericFile.mock.calls[1];
    expect(firstPosition).toEqual({ x: 0, y: 0 });
    expect(secondPosition).not.toEqual(firstPosition);
  });

  const exampleDrop = (drag: unknown) =>
    stub<React.DragEvent<HTMLDivElement>>({
      preventDefault: jest.fn(),
      target: paneTarget(true),
      clientX: 100,
      clientY: 100,
      dataTransfer: {
        getData: jest
          .fn()
          .mockImplementation((format) =>
            format === "application/x-nodetool-drag" ? JSON.stringify(drag) : ""
          ),
        types: ["application/x-nodetool-drag"],
        items: [],
        files: []
      }
    });

  it("copies a dropped example model into the assets and adds its node", async () => {
    const model = {
      slug: "chest",
      name: "Chest",
      file: "chest.glb",
      uri: "package://nodetool-base/game-models/dungeon/chest.glb",
      triangles: 120,
      clips: [],
      use: "Loot"
    };
    const asset = { id: "a".repeat(32), content_type: "model/gltf-binary" };
    mockAddExampleModelAsset.mockResolvedValue(asset);
    const { result } = renderHook(() => useDropHandler());

    await act(async () => {
      await result.current.onDrop(
        exampleDrop({ type: "example-model", payload: model })
      );
    });

    expect(mockAddExampleModelAsset).toHaveBeenCalledWith(model);
    expect(mockAddNodeFromAsset).toHaveBeenCalledWith(asset, { x: 0, y: 0 });
  });

  it("installs a dropped example timeline and adds a node for the copy", async () => {
    const timelineMetadata = { node_type: "nodetool.constant.Timeline" };
    const node = {
      id: "node-1",
      data: { properties: {} as Record<string, unknown>, title: "" }
    };
    mockGetMetadata.mockReturnValue(timelineMetadata);
    mockCreateNode.mockReturnValue(node);
    mockInstallExampleTimeline.mockResolvedValue({
      id: "timeline-copy",
      name: "Launch Cutdown"
    });
    const { result } = renderHook(() => useDropHandler());

    await act(async () => {
      await result.current.onDrop(
        exampleDrop({
          type: "example-timeline",
          payload: { slug: "launch-cutdown", name: "Launch Cutdown" }
        })
      );
    });

    expect(mockInstallExampleTimeline).toHaveBeenCalledWith({
      slug: "launch-cutdown",
      projectId: "personal:test"
    });
    expect(node.data.properties.value).toEqual({
      type: "timeline",
      id: "timeline-copy"
    });
    expect(node.data.title).toBe("Launch Cutdown");
    expect(mockAddNode).toHaveBeenCalledWith(node);
  });
  it("installs a dropped example storyboard and adds a node for the copy", async () => {
    const node = {
      id: "node-1",
      data: { properties: {} as Record<string, unknown>, title: "" }
    };
    mockGetMetadata.mockReturnValue({ node_type: "nodetool.constant.Storyboard" });
    mockCreateNode.mockReturnValue(node);
    mockInstallExampleStoryboard.mockResolvedValue({
      id: "board-copy",
      name: "Night Market"
    });
    const { result } = renderHook(() => useDropHandler());

    await act(async () => {
      await result.current.onDrop(
        exampleDrop({
          type: "example-storyboard",
          payload: { slug: "night-market", name: "Night Market" }
        })
      );
    });

    expect(mockInstallExampleStoryboard).toHaveBeenCalledWith({
      slug: "night-market",
      projectId: "personal:test"
    });
    expect(node.data.properties.value).toEqual({
      type: "storyboard",
      id: "board-copy"
    });
    expect(node.data.title).toBe("Night Market");
    expect(mockAddNode).toHaveBeenCalledWith(node);
  });

  it("pastes a dropped example workflow's nodes and edges at the drop point", async () => {
    const nodeStore = { getState: () => ({ workflow: { id: "wf-open" } }) };
    asMock(useNodeStoreRef).mockReturnValue(nodeStore);
    Object.assign(useMetadataStore, {
      getState: () => ({ metadata: {}, getMetadata: () => undefined })
    });
    const graph = {
      nodes: [
        { id: "a", type: "nodetool.constant.String", data: {} },
        { id: "b", type: "nodetool.output.Output", data: {} }
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourceHandle: "output",
          target: "b",
          targetHandle: "value"
        }
      ]
    };
    const { result } = renderHook(() => useDropHandler());

    await act(async () => {
      await result.current.onDrop(
        exampleDrop({
          type: "example-workflow",
          payload: { name: "Echo", graph }
        })
      );
    });

    expect(insertGraphFragment).toHaveBeenCalledTimes(1);
    const [store, fragment, at] = asMock(insertGraphFragment).mock.calls[0];
    expect(store).toBe(nodeStore);
    expect(fragment.nodes.map((node: { id: string }) => node.id)).toEqual([
      "a",
      "b"
    ]);
    expect(fragment.edges).toHaveLength(1);
    expect(at).toEqual({ x: 0, y: 0 });
  });

  it("accepts copy-only drags such as examples with a copy drop effect", () => {
    const { result } = renderHook(() => useDropHandler());
    const dragOver = (effectAllowed: DataTransfer["effectAllowed"]) => {
      const dataTransfer: Pick<
        DataTransfer,
        "types" | "effectAllowed" | "dropEffect"
      > = {
        types: ["application/x-nodetool-drag"],
        effectAllowed,
        dropEffect: "none"
      };
      result.current.onDragOver(
        stub<React.DragEvent<HTMLDivElement>>({
          preventDefault: jest.fn(),
          dataTransfer
        })
      );
      return dataTransfer.dropEffect;
    };

    expect(dragOver("copy")).toBe("copy");
    expect(dragOver("all")).toBe("move");
  });
});
