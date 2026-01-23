import { renderHook, act } from "@testing-library/react";
import { useClipboardContentPaste } from "../useClipboardContentPaste";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../../contexts/NodeContext";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import useAuth from "../../../stores/useAuth";
import useMetadataStore from "../../../stores/MetadataStore";
import * as MousePosition from "../../../utils/MousePosition";
import * as Browser from "../../../utils/browser";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../serverState/useAssetUpload");
jest.mock("../../../stores/AssetGridStore");
jest.mock("../../../stores/useAuth");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../utils/MousePosition");
jest.mock("../../../utils/browser");

describe("useClipboardContentPaste", () => {
  const mockScreenToFlowPosition = jest.fn();
  const mockCreateNode = jest.fn();
  const mockAddNode = jest.fn();
  const mockUploadAsset = jest.fn();
  const mockGetMetadata = jest.fn();

  const mockedUseReactFlow = useReactFlow as jest.Mock;
  const mockedUseNodes = useNodes as unknown as jest.Mock;
  const mockedUseAssetUpload = useAssetUpload as unknown as jest.Mock;
  const mockedUseAssetGridStore = useAssetGridStore as unknown as jest.Mock;
  const mockedUseAuth = useAuth as unknown as jest.Mock;
  const mockedUseMetadataStore = useMetadataStore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock getMousePosition
    jest.spyOn(MousePosition, "getMousePosition").mockReturnValue({
      x: 100,
      y: 200
    });

    // Mock isTextInputActive - default to false (not in text input)
    jest.spyOn(Browser, "isTextInputActive").mockReturnValue(false);

    // Mock useReactFlow
    mockScreenToFlowPosition.mockReturnValue({ x: 50, y: 100 });
    mockedUseReactFlow.mockReturnValue({
      screenToFlowPosition: mockScreenToFlowPosition
    });

    // Mock useNodes
    mockCreateNode.mockReturnValue({
      id: "new-node-1",
      type: "nodetool.constant.String",
      data: { properties: {} }
    });
    mockedUseNodes.mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({
          createNode: mockCreateNode,
          addNode: mockAddNode,
          workflow: { id: "workflow-123" }
        });
      }
      return {
        createNode: mockCreateNode,
        addNode: mockAddNode,
        workflow: { id: "workflow-123" }
      };
    });

    // Mock useAssetUpload
    mockedUseAssetUpload.mockReturnValue({
      uploadAsset: mockUploadAsset
    });

    // Mock useAssetGridStore
    mockedUseAssetGridStore.mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({ currentFolderId: "folder-123" });
      }
      return { currentFolderId: "folder-123" };
    });

    // Mock useAuth
    mockedUseAuth.mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({ user: { id: "user-123" } });
      }
      return { user: { id: "user-123" } };
    });

    // Mock useMetadataStore
    mockGetMetadata.mockReturnValue({
      node_type: "nodetool.constant.String",
      title: "String",
      namespace: "nodetool.constant",
      properties: []
    });
    mockedUseMetadataStore.mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({ getMetadata: mockGetMetadata });
      }
      return { getMetadata: mockGetMetadata };
    });
  });

  it("returns handleContentPaste and hasClipboardContent functions", () => {
    const { result } = renderHook(() => useClipboardContentPaste());
    expect(result.current.handleContentPaste).toBeDefined();
    expect(result.current.hasClipboardContent).toBeDefined();
    expect(result.current.readClipboardContent).toBeDefined();
  });

  describe("handleContentPaste", () => {
    it("returns false when active element is a text input", async () => {
      // Mock isTextInputActive to return true
      jest.spyOn(Browser, "isTextInputActive").mockReturnValue(true);

      const { result } = renderHook(() => useClipboardContentPaste());

      let handled: boolean = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
    });

    it("returns false when active element is a textarea", async () => {
      // Mock isTextInputActive to return true
      jest.spyOn(Browser, "isTextInputActive").mockReturnValue(true);

      const { result } = renderHook(() => useClipboardContentPaste());

      let handled: boolean = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
    });

    it("returns false when mouse position is not available", async () => {
      jest.spyOn(MousePosition, "getMousePosition").mockReturnValue(null as unknown as { x: number; y: number });

      const { result } = renderHook(() => useClipboardContentPaste());

      let handled: boolean = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
    });
  });

  describe("readClipboardContent", () => {
    it("returns unknown type when no clipboard data is available", async () => {
      const { result } = renderHook(() => useClipboardContentPaste());

      let content: { type: string; data: unknown };
      await act(async () => {
        content = await result.current.readClipboardContent();
      });

      expect(content!.type).toBe("unknown");
      expect(content!.data).toBeNull();
    });
  });
});
