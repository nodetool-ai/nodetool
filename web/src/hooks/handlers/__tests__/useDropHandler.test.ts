import { renderHook } from "@testing-library/react";
import { useDropHandler } from "../useDropHandler";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn((pos) => ({ x: pos.x, y: pos.y }))
  }))
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn((selector) =>
    selector({
      addNotification: jest.fn()
    })
  )
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: jest.fn((selector) =>
    selector({
      get: jest.fn(() => Promise.resolve({ id: "test-asset", type: "image" }))
    })
  )
}));

jest.mock("../../../stores/useAuth", () => ({
  default: jest.fn(() => ({ user: { id: "test-user" } }))
}));

jest.mock("../../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: jest.fn((selector) =>
    selector({
      addRecentNode: jest.fn()
    })
  )
}));

jest.mock("../dropHandlerUtils", () => ({
  useFileHandlers: jest.fn(() => ({
    handlePngFile: jest.fn(),
    handleJsonFile: jest.fn(),
    handleCsvFile: jest.fn(),
    handleGenericFile: jest.fn()
  }))
}));

jest.mock("../addNodeFromAsset", () => ({
  useAddNodeFromAsset: jest.fn(() => jest.fn())
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) =>
    selector({
      addNode: jest.fn(),
      createNode: jest.fn((node, pos) => ({ ...node, id: "new-node", position: pos }))
    })
  )
}));

jest.mock("../../../lib/dragdrop", () => ({
  deserializeDragData: jest.fn(),
  hasExternalFiles: jest.fn(),
  extractFiles: jest.fn()
}));

describe("useDropHandler", () => {
  let mockOnDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  let mockOnDragOver: (event: React.DragEvent<HTMLDivElement>) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const hookResult = renderHook(() => useDropHandler());
    mockOnDrop = hookResult.result.current.onDrop;
    mockOnDragOver = hookResult.result.current.onDragOver;
  });

  describe("onDragOver", () => {
    it("prevents default drag event", () => {
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { dropEffect: "" }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockOnDragOver(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.dataTransfer.dropEffect).toBe("move");
    });
  });

  describe("onDrop", () => {
    it("returns early if event target is not the pane", async () => {
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn()
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("not-pane");
      event.target = target;

      await mockOnDrop(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("handles create-node drop", async () => {
      const { deserializeDragData } = require("../../../lib/dragdrop");
      
      const nodeMetadata = {
        node_type: "test-node",
        title: "Test Node",
        description: "A test node"
      };

      deserializeDragData.mockReturnValue({
        type: "create-node",
        payload: nodeMetadata
      });

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn()
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(deserializeDragData).toHaveBeenCalledWith(event.dataTransfer);
    });

    it("handles single asset drop", async () => {
      const { deserializeDragData } = require("../../../lib/dragdrop");
      const { useAssetStore } = require("../../../stores/AssetStore");
      const { useAddNodeFromAsset } = require("../addNodeFromAsset");
      const { useNodes } = require("../../../contexts/NodeContext");

      const mockAsset = { id: "asset-1", type: "image", name: "test.png" };

      deserializeDragData.mockReturnValue({
        type: "asset",
        payload: mockAsset
      });

      const mockGetAsset = jest.fn(() => Promise.resolve(mockAsset));
      useAssetStore.mockReturnValue({
        get: mockGetAsset
      });

      const mockAddNodeFromAsset = jest.fn();
      useAddNodeFromAsset.mockReturnValue(mockAddNodeFromAsset);

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn()
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockGetAsset).toHaveBeenCalledWith("asset-1");
    });

    it("handles multiple asset drops", async () => {
      const { deserializeDragData } = require("../../../lib/dragdrop");
      const { useAssetStore } = require("../../../stores/AssetStore");
      const { useAddNodeFromAsset } = require("../addNodeFromAsset");

      const mockAsset = { id: "asset-1", type: "image", name: "test.png" };

      deserializeDragData.mockReturnValue({
        type: "assets-multiple",
        payload: ["asset-1", "asset-2"]
      });

      const mockGetAsset = jest.fn(() => Promise.resolve(mockAsset));
      useAssetStore.mockReturnValue({
        get: mockGetAsset
      });

      const mockAddNodeFromAsset = jest.fn();
      useAddNodeFromAsset.mockReturnValue(mockAddNodeFromAsset);

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn()
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockGetAsset).toHaveBeenCalledTimes(2);
    });

    it("handles external file drop with PNG file", async () => {
      const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
      const { useFileHandlers } = require("../dropHandlerUtils");
      const { useAddNodeFromAsset } = require("../addNodeFromAsset");
      const { useNotificationStore } = require("../../../stores/NotificationStore");

      deserializeDragData.mockReturnValue(null);
      hasExternalFiles.mockReturnValue(true);

      const mockFile = new File(["test"], "test.png", { type: "image/png" });
      extractFiles.mockReturnValue([mockFile]);

      const mockHandlePngFile = jest.fn().mockResolvedValue({
        success: true,
        data: { id: "uploaded-asset", type: "image" }
      });
      useFileHandlers.mockReturnValue({
        handlePngFile: mockHandlePngFile,
        handleJsonFile: jest.fn(),
        handleCsvFile: jest.fn(),
        handleGenericFile: jest.fn()
      });

      const mockAddNodeFromAsset = jest.fn();
      useAddNodeFromAsset.mockReturnValue(mockAddNodeFromAsset);

      const mockAddNotification = jest.fn();
      useNotificationStore.mockReturnValue({
        addNotification: mockAddNotification
      });

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn(),
          files: [mockFile]
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockHandlePngFile).toHaveBeenCalled();
      expect(mockAddNodeFromAsset).toHaveBeenCalled();
    });

    it("handles external file drop with JSON file", async () => {
      const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
      const { useFileHandlers } = require("../dropHandlerUtils");
      const { useAddNodeFromAsset } = require("../addNodeFromAsset");

      deserializeDragData.mockReturnValue(null);
      hasExternalFiles.mockReturnValue(true);

      const mockFile = new File(["test"], "data.json", { type: "application/json" });
      extractFiles.mockReturnValue([mockFile]);

      const mockHandleJsonFile = jest.fn().mockResolvedValue({
        success: true,
        data: { id: "json-asset", type: "json" }
      });
      useFileHandlers.mockReturnValue({
        handlePngFile: jest.fn(),
        handleJsonFile: mockHandleJsonFile,
        handleCsvFile: jest.fn(),
        handleGenericFile: jest.fn()
      });

      const mockAddNodeFromAsset = jest.fn();
      useAddNodeFromAsset.mockReturnValue(mockAddNodeFromAsset);

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn(),
          files: [mockFile]
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockHandleJsonFile).toHaveBeenCalled();
    });

    it("handles generic file drop for unknown types", async () => {
      const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
      const { useFileHandlers } = require("../dropHandlerUtils");
      const { useAddNodeFromAsset } = require("../addNodeFromAsset");
      const { useNotificationStore } = require("../../../stores/NotificationStore");

      deserializeDragData.mockReturnValue(null);
      hasExternalFiles.mockReturnValue(true);

      const mockFile = new File(["test"], "unknown.xyz", { type: "application/octet-stream" });
      extractFiles.mockReturnValue([mockFile]);

      const mockHandleGenericFile = jest.fn().mockResolvedValue({
        success: true,
        data: { id: "generic-asset", type: "file" }
      });
      useFileHandlers.mockReturnValue({
        handlePngFile: jest.fn(),
        handleJsonFile: jest.fn(),
        handleCsvFile: jest.fn(),
        handleGenericFile: mockHandleGenericFile
      });

      const mockAddNodeFromAsset = jest.fn();
      useAddNodeFromAsset.mockReturnValue(mockAddNodeFromAsset);

      const mockAddNotification = jest.fn();
      useNotificationStore.mockReturnValue({
        addNotification: mockAddNotification
      });

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn(),
          files: [mockFile]
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockHandleGenericFile).toHaveBeenCalled();
    });

    it("shows error notification on file handler failure", async () => {
      const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
      const { useFileHandlers } = require("../dropHandlerUtils");
      const { useNotificationStore } = require("../../../stores/NotificationStore");

      deserializeDragData.mockReturnValue(null);
      hasExternalFiles.mockReturnValue(true);

      const mockFile = new File(["test"], "test.png", { type: "image/png" });
      extractFiles.mockReturnValue([mockFile]);

      const mockHandlePngFile = jest.fn().mockResolvedValue({
        success: false,
        error: "Upload failed"
      });
      useFileHandlers.mockReturnValue({
        handlePngFile: mockHandlePngFile,
        handleJsonFile: jest.fn(),
        handleCsvFile: jest.fn(),
        handleGenericFile: jest.fn()
      });

      const mockAddNotification = jest.fn();
      useNotificationStore.mockReturnValue({
        addNotification: mockAddNotification
      });

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn(),
          files: [mockFile]
        },
        clientX: 100,
        clientY: 200
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "error",
        content: "Failed to process file: Upload failed",
        alert: true
      });
    });

    it("does not process external files when user is not logged in", async () => {
      const { deserializeDragData, hasExternalFiles } = require("../../../lib/dragdrop");
      const { useFileHandlers } = require("../dropHandlerUtils");
      const useAuthMock = require("../../../stores/useAuth");

      deserializeDragData.mockReturnValue(null);
      hasExternalFiles.mockReturnValue(true);
      useAuthMock.default.mockReturnValue({ user: null });

      const mockHandlePngFile = jest.fn();
      useFileHandlers.mockReturnValue({
        handlePngFile: mockHandlePngFile,
        handleJsonFile: jest.fn(),
        handleCsvFile: jest.fn(),
        handleGenericFile: jest.fn()
      });

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: {
          getData: jest.fn()
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      const target = document.createElement("div");
      target.classList.add("react-flow__pane");
      event.target = target;

      await mockOnDrop(event);

      expect(mockHandlePngFile).not.toHaveBeenCalled();
    });
  });
});
