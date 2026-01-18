import { renderHook } from "@testing-library/react";
import { useFileDrop, FileDropProps } from "../useFileDrop";

// Mock dependencies
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn(() => ({
    addNotification: jest.fn()
  }))
}));

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: jest.fn(() => ({
    uploadAsset: jest.fn(),
    isUploading: false
  }))
}));

jest.mock("../../../lib/dragdrop", () => ({
  deserializeDragData: jest.fn(),
  hasExternalFiles: jest.fn(),
  extractFiles: jest.fn()
}));

describe("useFileDrop", () => {
  let mockOnDragOver: any;
  let mockOnDrop: any;
  let mockFilename: string;
  let mockUploading: boolean;

  const createMockProps = (overrides: Partial<FileDropProps> = {}): FileDropProps => ({
    type: "image",
    uploadAsset: false,
    onChange: jest.fn(),
    onChangeAsset: jest.fn(),
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onDragOver", () => {
    it("prevents default drag event", () => {
      const props = createMockProps();
      const { result } = renderHook(() => useFileDrop(props));

      mockOnDragOver = result.current.onDragOver;

      const event = {
        preventDefault: jest.fn()
      } as unknown as DragEvent;

      mockOnDragOver(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe("onDrop", () => {
    describe("asset drops", () => {
      it("handles valid asset drop", () => {
        const { deserializeDragData } = require("../../../lib/dragdrop");

        const mockAsset = {
          id: "asset-1",
          content_type: "image/png",
          get_url: "https://example.com/image.png"
        };

        deserializeDragData.mockReturnValue({
          type: "asset",
          payload: mockAsset
        });

        const onChange = jest.fn();
        const onChangeAsset = jest.fn();
        const props = createMockProps({ onChange, onChangeAsset });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            items: []
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(onChangeAsset).toHaveBeenCalledWith(mockAsset);
        expect(onChange).toHaveBeenCalledWith("https://example.com/image.png");
      });

      it("rejects asset with wrong type", () => {
        const { deserializeDragData } = require("../../../lib/dragdrop");
        const { useNotificationStore } = require("../../../stores/NotificationStore");

        const mockAsset = {
          id: "asset-1",
          content_type: "audio/mp3",
          get_url: "https://example.com/audio.mp3"
        };

        deserializeDragData.mockReturnValue({
          type: "asset",
          payload: mockAsset
        });

        const mockAddNotification = jest.fn();
        useNotificationStore.mockReturnValue({
          addNotification: mockAddNotification
        });

        const props = createMockProps({ type: "image" });
        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            items: []
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(mockAddNotification).toHaveBeenCalledWith({
          type: "error",
          alert: true,
          content: "Invalid file type. Please drop a image file."
        });
      });

      it("accepts any asset type when type is 'all'", () => {
        const { deserializeDragData } = require("../../../lib/dragdrop");

        const mockAsset = {
          id: "asset-1",
          content_type: "video/mp4",
          get_url: "https://example.com/video.mp4"
        };

        deserializeDragData.mockReturnValue({
          type: "asset",
          payload: mockAsset
        });

        const onChange = jest.fn();
        const onChangeAsset = jest.fn();
        const props = createMockProps({ type: "all", onChange, onChangeAsset });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            items: []
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(onChangeAsset).toHaveBeenCalledWith(mockAsset);
        expect(onChange).toHaveBeenCalledWith("https://example.com/video.mp4");
      });
    });

    describe("text data transfer", () => {
      it("handles text data transfer", () => {
        const { deserializeDragData } = require("../../../lib/dragdrop");

        deserializeDragData.mockReturnValue(null);

        const onChange = jest.fn();
        const props = createMockProps({ onChange });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const mockItem = {
          kind: "string",
          getAsString: jest.fn((callback) => callback("text content"))
        };

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            items: [mockItem],
            files: []
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(mockItem.getAsString).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith("text content");
      });
    });

    describe("external file drops", () => {
      it("uploads file when uploadAsset is true", () => {
        const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
        const { useAssetUpload } = require("../../../serverState/useAssetUpload");

        deserializeDragData.mockReturnValue(null);
        hasExternalFiles.mockReturnValue(true);

        const mockFile = new File(["test"], "test.png", { type: "image/png" });
        extractFiles.mockReturnValue([mockFile]);

        const mockUploadAsset = jest.fn();
        const mockOnChangeAsset = jest.fn();
        useAssetUpload.mockReturnValue({
          uploadAsset: mockUploadAsset,
          isUploading: false
        });

        const props = createMockProps({
          type: "image",
          uploadAsset: true,
          onChangeAsset: mockOnChangeAsset
        });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            files: [mockFile]
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(mockUploadAsset).toHaveBeenCalledWith({
          file: mockFile,
          onCompleted: expect.any(Function)
        });
        expect(result.current.filename).toBe("test.png");
      });

      it("reads file as data URL when uploadAsset is false", () => {
        const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");

        deserializeDragData.mockReturnValue(null);
        hasExternalFiles.mockReturnValue(true);

        const mockFile = new File(["test"], "test.png", { type: "image/png" });
        extractFiles.mockReturnValue([mockFile]);

        const onChange = jest.fn();
        const props = createMockProps({ type: "image", onChange });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            files: [mockFile]
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        // The FileReader is asynchronous, so we need to check the filename was set
        expect(result.current.filename).toBe("test.png");
      });

      it("rejects file with wrong type", () => {
        const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");
        const { useNotificationStore } = require("../../../stores/NotificationStore");

        deserializeDragData.mockReturnValue(null);
        hasExternalFiles.mockReturnValue(true);

        const mockFile = new File(["test"], "test.mp3", { type: "audio/mp3" });
        extractFiles.mockReturnValue([mockFile]);

        const mockAddNotification = jest.fn();
        useNotificationStore.mockReturnValue({
          addNotification: mockAddNotification
        });

        const props = createMockProps({ type: "image" });
        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            files: [mockFile]
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(mockAddNotification).toHaveBeenCalledWith({
          type: "error",
          alert: true,
          content: "Invalid file type. Please drop a image file."
        });
      });

      it("accepts document types when type is 'document'", () => {
        const { deserializeDragData, hasExternalFiles, extractFiles } = require("../../../lib/dragdrop");

        deserializeDragData.mockReturnValue(null);
        hasExternalFiles.mockReturnValue(true);

        const mockFile = new File(["test"], "document.pdf", {
          type: "application/pdf"
        });
        extractFiles.mockReturnValue([mockFile]);

        const onChange = jest.fn();
        const props = createMockProps({ type: "document", onChange });

        const { result } = renderHook(() => useFileDrop(props));
        mockOnDrop = result.current.onDrop;

        const event = {
          preventDefault: jest.fn(),
          stopPropagation: jest.fn(),
          dataTransfer: {
            files: [mockFile]
          }
        } as unknown as DragEvent;

        mockOnDrop(event);

        expect(result.current.filename).toBe("document.pdf");
      });
    });
  });

  describe("filename state", () => {
    it("returns empty filename initially", () => {
      const props = createMockProps();
      const { result } = renderHook(() => useFileDrop(props));

      expect(result.current.filename).toBe("");
    });
  });

  describe("uploading state", () => {
    it("returns uploading state from useAssetUpload", () => {
      const { useAssetUpload } = require("../../../serverState/useAssetUpload");

      useAssetUpload.mockReturnValue({
        uploadAsset: jest.fn(),
        isUploading: true
      });

      const props = createMockProps();
      const { result } = renderHook(() => useFileDrop(props));

      expect(result.current.uploading).toBe(true);
    });

    it("returns false when not uploading", () => {
      const props = createMockProps();
      const { result } = renderHook(() => useFileDrop(props));

      expect(result.current.uploading).toBe(false);
    });
  });
});
