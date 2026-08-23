import { renderHook, act } from "@testing-library/react";
import { installGlobal } from "../../../test-utils/doubles";
import { asMock } from "../../../test-utils/doubles";
import { useClipboardContentPaste } from "../useClipboardContentPaste";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../../contexts/NodeContext";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useAuth from "../../../stores/useAuth";
import useMetadataStore from "../../../stores/MetadataStore";
import * as MousePosition from "../../../utils/MousePosition";
import * as Browser from "../../../utils/browser";

// jest hoists `jest.mock` above the imports, so a factory may only reach
// out-of-scope names that begin with `mock`.
const mockIsFunction = <T,>(
  value: T
): value is Extract<T, (...args: never[]) => unknown> =>
  typeof value === "function";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../serverState/useAssetUpload");
jest.mock("../../../stores/AssetGridStore");
jest.mock("../../../stores/NotificationStore");
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
  const mockedUseNodes = asMock(useNodes);
  const mockedUseAssetUpload = asMock(useAssetUpload);
  const mockedUseAssetGridStore = asMock(useAssetGridStore);
  const mockedUseNotificationStore =
    asMock(useNotificationStore);
  const mockedUseAuth = asMock(useAuth);
  const mockedUseMetadataStore = asMock(useMetadataStore);

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
      if (mockIsFunction(selector)) {
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
      if (mockIsFunction(selector)) {
        return selector({ currentFolderId: "folder-123" });
      }
      return { currentFolderId: "folder-123" };
    });

    // Mock useAuth
    mockedUseAuth.mockImplementation((selector) => {
      if (mockIsFunction(selector)) {
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
      if (mockIsFunction(selector)) {
        return selector({ getMetadata: mockGetMetadata });
      }
      return { getMetadata: mockGetMetadata };
    });

    mockedUseNotificationStore.mockImplementation((selector) => {
      if (mockIsFunction(selector)) {
        return selector({ addNotification: jest.fn() });
      }
      return { addNotification: jest.fn() };
    });

    installGlobal("api", undefined);
  });

  /** The `File` the hook handed to `uploadAsset`. */
  const uploadedFile = (): File => {
    expect(mockUploadAsset).toHaveBeenCalledTimes(1);
    return mockUploadAsset.mock.calls[0][0].file as File;
  };

  /** Puts file paths on the clipboard the way Electron reports them. */
  const installClipboardFiles = (
    paths: string[],
    extra: Record<string, jest.Mock> = {}
  ): void => {
    installGlobal("api", {
      clipboard: {
        getContentInfo: jest
          .fn()
          .mockResolvedValue({ hasFiles: true, formats: ["public.file-url"] }),
        readFilePaths: jest.fn().mockResolvedValue(paths),
        ...extra
      }
    });
  };

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

    it("uploads clipboard image with clipboard source", async () => {
      const pngDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2W9oQAAAAASUVORK5CYII=";
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        blob: async () =>
          new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })
      } as Response);

      installGlobal("api", {
        clipboard: {
          readImage: jest.fn().mockResolvedValue(pngDataUrl)
        }
      });

      const { result } = renderHook(() => useClipboardContentPaste());

      let handled = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(true);
      expect(mockUploadAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "clipboard",
          workflow_id: "workflow-123",
          parent_id: "folder-123"
        })
      );
      global.fetch = originalFetch;
    });

    it("names the uploaded file from the image's mime subtype", async () => {
      installGlobal("api", {
        clipboard: {
          readImage: jest
            .fn()
            .mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+")
        }
      });
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        blob: async () => new Blob(["<svg/>"], { type: "image/svg+xml" })
      } as Response);

      const { result } = renderHook(() => useClipboardContentPaste());
      await act(async () => {
        await result.current.handleContentPaste();
      });

      expect(uploadedFile().name).toBe("clipboard-image.svg");
      expect(uploadedFile().type).toBe("image/svg+xml");
      global.fetch = originalFetch;
    });

    it("falls back to png when the blob carries no mime type", async () => {
      installGlobal("api", {
        clipboard: {
          readImage: jest.fn().mockResolvedValue("data:image/png;base64,AA==")
        }
      });
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        blob: async () => new Blob(["x"])
      } as Response);

      const { result } = renderHook(() => useClipboardContentPaste());
      await act(async () => {
        await result.current.handleContentPaste();
      });

      expect(uploadedFile().name).toBe("clipboard-image.png");
      expect(uploadedFile().type).toBe("image/png");
      global.fetch = originalFetch;
    });

    it("creates a String node holding the path of a non-image file", async () => {
      installClipboardFiles(["/tmp/notes.txt"]);

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(true);
      expect(mockAddNode).toHaveBeenCalledTimes(1);
      expect(mockAddNode.mock.calls[0][0].data.properties.value).toBe(
        "/tmp/notes.txt"
      );
      expect(mockUploadAsset).not.toHaveBeenCalled();
    });

    it("uploads an image file path read through the Electron buffer API", async () => {
      installClipboardFiles(["C:\\pics\\shot.PNG"], {
        readFileBuffer: jest.fn().mockResolvedValue({
          buffer: new Uint8Array([1, 2, 3]),
          mimeType: "image/png"
        })
      });

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(true);
      expect(uploadedFile().name).toBe("shot.PNG");
      expect(uploadedFile().type).toBe("image/png");
      expect(mockAddNode).not.toHaveBeenCalled();
    });

    it("returns false for an image file path when readFileBuffer is missing", async () => {
      installClipboardFiles(["/tmp/photo.jpg"]);

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = true;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
      expect(mockUploadAsset).not.toHaveBeenCalled();
      expect(mockAddNode).not.toHaveBeenCalled();
    });

    it("returns false when readFileBuffer yields nothing", async () => {
      installClipboardFiles(["/tmp/photo.jpg"], {
        readFileBuffer: jest.fn().mockResolvedValue(null)
      });

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = true;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
      expect(mockUploadAsset).not.toHaveBeenCalled();
    });

    it("returns false when readFileBuffer throws", async () => {
      installClipboardFiles(["/tmp/photo.jpg"], {
        readFileBuffer: jest.fn().mockRejectedValue(new Error("EACCES"))
      });

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = true;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(false);
      expect(mockUploadAsset).not.toHaveBeenCalled();
    });

    it("creates a String node from clipboard text", async () => {
      installGlobal("api", {
        clipboard: {
          readText: jest.fn().mockResolvedValue("hello canvas")
        }
      });

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      expect(handled).toBe(true);
      expect(mockAddNode.mock.calls[0][0].data.properties.value).toBe(
        "hello canvas"
      );
    });

    it("returns false when the String node metadata is missing", async () => {
      mockGetMetadata.mockReturnValue(undefined);
      installGlobal("api", {
        clipboard: { readText: jest.fn().mockResolvedValue("hello") }
      });

      const { result } = renderHook(() => useClipboardContentPaste());
      let handled = false;
      await act(async () => {
        handled = await result.current.handleContentPaste();
      });

      // The node is never created, but the paste still counts as handled.
      expect(handled).toBe(true);
      expect(mockAddNode).not.toHaveBeenCalled();
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
