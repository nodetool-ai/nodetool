import { renderHook, act, waitFor } from "@testing-library/react";
import { useFileDrop } from "../useFileDrop";

const mockAddNotification = jest.fn();
const mockUploadAsset = jest.fn();

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: typeof mockAddNotification }) => unknown
  ) => selector({ addNotification: mockAddNotification })
}));

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: mockUploadAsset,
    isUploading: false
  })
}));

jest.mock("../../../lib/dragdrop", () => ({
  deserializeDragData: jest.fn(),
  hasExternalFiles: jest.fn(() => false),
  extractFiles: jest.fn(() => [])
}));

import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../../lib/dragdrop";

const mockDeserialize = deserializeDragData as jest.MockedFunction<
  typeof deserializeDragData
>;
const mockHasExternalFiles = hasExternalFiles as jest.MockedFunction<
  typeof hasExternalFiles
>;
const mockExtractFiles = extractFiles as jest.MockedFunction<
  typeof extractFiles
>;

beforeEach(() => {
  jest.clearAllMocks();
});

function createMockDragEvent(overrides?: Record<string, any>) {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    dataTransfer: {
      items: [],
      files: { length: 0 },
      getData: jest.fn(() => "")
    },
    ...overrides
  } as any;
}

describe("useFileDrop", () => {
  it("returns drag handlers and upload state", () => {
    const { result } = renderHook(() =>
      useFileDrop({ type: "image" })
    );

    expect(result.current.onDragOver).toEqual(expect.any(Function));
    expect(result.current.onDrop).toEqual(expect.any(Function));
    expect(result.current.filename).toBe("");
    expect(result.current.uploading).toBe(false);
  });

  it("onDragOver prevents default", () => {
    const { result } = renderHook(() =>
      useFileDrop({ type: "image" })
    );

    const event = createMockDragEvent();
    act(() => {
      result.current.onDragOver(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("handles asset drop with matching type", () => {
    const onChange = jest.fn();
    const onChangeAsset = jest.fn();

    mockDeserialize.mockReturnValue({
      type: "asset",
      payload: {
        id: "123",
        name: "photo.png",
        content_type: "image/png",
        get_url: "http://example.com/photo.png"
      } as any
    });

    const { result } = renderHook(() =>
      useFileDrop({
        type: "image",
        onChange,
        onChangeAsset
      })
    );

    act(() => {
      result.current.onDrop(createMockDragEvent());
    });

    expect(onChangeAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: "123" })
    );
    expect(onChange).toHaveBeenCalledWith("http://example.com/photo.png");
  });

  it("rejects asset drop with wrong type", () => {
    const onChangeAsset = jest.fn();

    mockDeserialize.mockReturnValue({
      type: "asset",
      payload: {
        id: "456",
        name: "song.mp3",
        content_type: "audio/mp3",
        get_url: "http://example.com/song.mp3"
      } as any
    });

    const { result } = renderHook(() =>
      useFileDrop({
        type: "image",
        onChangeAsset
      })
    );

    act(() => {
      result.current.onDrop(createMockDragEvent());
    });

    expect(onChangeAsset).not.toHaveBeenCalled();
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("image")
      })
    );
  });

  it("accepts any asset type when type is 'all'", () => {
    const onChangeAsset = jest.fn();

    mockDeserialize.mockReturnValue({
      type: "asset",
      payload: {
        id: "789",
        name: "video.mp4",
        content_type: "video/mp4",
        get_url: "http://example.com/video.mp4"
      } as any
    });

    const { result } = renderHook(() =>
      useFileDrop({
        type: "all",
        onChangeAsset
      })
    );

    act(() => {
      result.current.onDrop(createMockDragEvent());
    });

    expect(onChangeAsset).toHaveBeenCalled();
  });

  it("accepts document assets with application content type", () => {
    const onChangeAsset = jest.fn();

    mockDeserialize.mockReturnValue({
      type: "asset",
      payload: {
        id: "doc1",
        name: "doc.pdf",
        content_type: "application/pdf",
        get_url: "http://example.com/doc.pdf"
      } as any
    });

    const { result } = renderHook(() =>
      useFileDrop({
        type: "document",
        onChangeAsset
      })
    );

    act(() => {
      result.current.onDrop(createMockDragEvent());
    });

    expect(onChangeAsset).toHaveBeenCalled();
  });

  it("handles external file drops with uploadAsset", () => {
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    const mockFile = new File(["content"], "test.png", { type: "image/png" });
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() =>
      useFileDrop({
        type: "image",
        uploadAsset: true
      })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    expect(mockUploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        file: mockFile,
        source: "drop"
      })
    );
  });

  it("rejects external file with wrong type", () => {
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    const mockFile = new File(["content"], "song.mp3", { type: "audio/mpeg" });
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() =>
      useFileDrop({ type: "image" })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("image")
      })
    );
  });

  it("accepts document assets with text content type", () => {
    const onChangeAsset = jest.fn();

    mockDeserialize.mockReturnValue({
      type: "asset",
      payload: {
        id: "doc2",
        name: "notes.txt",
        content_type: "text/plain",
        get_url: "http://example.com/notes.txt"
      } as any
    });

    const { result } = renderHook(() =>
      useFileDrop({ type: "document", onChangeAsset })
    );

    act(() => {
      result.current.onDrop(createMockDragEvent());
    });

    expect(onChangeAsset).toHaveBeenCalled();
  });

  it("passes dropped string items to onChange", () => {
    const onChange = jest.fn();
    mockDeserialize.mockReturnValue(null);

    const { result } = renderHook(() => useFileDrop({ type: "all", onChange }));

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [
              {
                kind: "string",
                getAsString: (cb: (s: string) => void) => cb("dropped text")
              },
              { kind: "file", getAsString: jest.fn() }
            ],
            files: { length: 0 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("dropped text");
    expect(mockHasExternalFiles).not.toHaveBeenCalled();
  });

  it("reads the file as a data URL when uploadAsset is off", async () => {
    const onChange = jest.fn();
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    const mockFile = new File(["content"], "test.png", { type: "image/png" });
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() =>
      useFileDrop({ type: "image", onChange })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.stringMatching(/^data:image\/png/)
      );
    });
    expect(mockUploadAsset).not.toHaveBeenCalled();
    expect(result.current.filename).toBe("test.png");
  });

  it("accepts a pdf dropped onto a document dropzone", () => {
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    const mockFile = new File(["content"], "doc.pdf", {
      type: "application/pdf"
    });
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() =>
      useFileDrop({ type: "document", uploadAsset: true })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    expect(mockUploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({ file: mockFile, source: "file" })
    );
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it("forwards the uploaded asset and upload failures", () => {
    const onChangeAsset = jest.fn();
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    const mockFile = new File(["content"], "test.png", { type: "image/png" });
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() =>
      useFileDrop({ type: "image", uploadAsset: true, onChangeAsset })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    const call = mockUploadAsset.mock.calls[0][0];
    call.onCompleted({ id: "uploaded" });
    expect(onChangeAsset).toHaveBeenCalledWith({ id: "uploaded" });

    call.onFailed("upload exploded");
    expect(mockAddNotification).toHaveBeenCalledWith({
      type: "error",
      alert: true,
      content: "upload exploded"
    });
  });

  it("does nothing when the drop carries no extractable file", () => {
    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(true);
    mockExtractFiles.mockReturnValue([]);

    const { result } = renderHook(() =>
      useFileDrop({ type: "image", uploadAsset: true })
    );

    act(() => {
      result.current.onDrop(
        createMockDragEvent({
          dataTransfer: {
            items: [],
            files: { length: 1 },
            getData: jest.fn(() => "")
          }
        })
      );
    });

    expect(mockUploadAsset).not.toHaveBeenCalled();
    expect(mockAddNotification).not.toHaveBeenCalled();
    expect(result.current.filename).toBe("");
  });
});
