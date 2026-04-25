import { renderHook, act } from "@testing-library/react";
import { useDropZone } from "../useDropZone";
import { useDragDropStore } from "../store";
import type { DragData, DropZoneConfig } from "../types";

jest.mock("../serialization", () => ({
  deserializeDragData: jest.fn(),
  hasExternalFiles: jest.fn(() => false),
  extractFiles: jest.fn(() => [])
}));

import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../serialization";

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
  useDragDropStore.setState({ activeDrag: null, isDragging: false });
});

function createMockDragEvent(
  overrides?: Partial<React.DragEvent>
): React.DragEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    clientX: 100,
    clientY: 200,
    dataTransfer: {
      dropEffect: "",
      getData: jest.fn(() => ""),
      items: [],
      files: { length: 0 }
    } as unknown as DataTransfer,
    ...overrides
  } as unknown as React.DragEvent;
}

describe("useDropZone", () => {
  it("returns drag event handlers and state", () => {
    const config: DropZoneConfig = {
      accepts: ["create-node"],
      onDrop: jest.fn()
    };

    const { result } = renderHook(() => useDropZone(config));

    expect(typeof result.current.onDragEnter).toBe("function");
    expect(typeof result.current.onDragOver).toBe("function");
    expect(typeof result.current.onDragLeave).toBe("function");
    expect(typeof result.current.onDrop).toBe("function");
    expect(result.current.isOver).toBe(false);
    expect(result.current.canDrop).toBe(false);
    expect(result.current["data-dropzone"]).toBe(true);
  });

  it("sets isOver on dragEnter and clears on dragLeave", () => {
    const config: DropZoneConfig = {
      accepts: ["asset"],
      onDrop: jest.fn()
    };

    const { result } = renderHook(() => useDropZone(config));

    const enterEvent = createMockDragEvent();
    act(() => {
      result.current.onDragEnter(enterEvent);
    });
    expect(result.current.isOver).toBe(true);
    expect(enterEvent.preventDefault).toHaveBeenCalled();

    const leaveEvent = createMockDragEvent();
    act(() => {
      result.current.onDragLeave(leaveEvent);
    });
    expect(result.current.isOver).toBe(false);
  });

  it("handles nested drag enter/leave with counter", () => {
    const config: DropZoneConfig = {
      accepts: ["asset"],
      onDrop: jest.fn()
    };

    const { result } = renderHook(() => useDropZone(config));

    act(() => {
      result.current.onDragEnter(createMockDragEvent());
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.onDragEnter(createMockDragEvent());
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.onDragLeave(createMockDragEvent());
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.onDragLeave(createMockDragEvent());
    });
    expect(result.current.isOver).toBe(false);
  });

  it("resets state on drop", async () => {
    const onDrop = jest.fn();
    const config: DropZoneConfig = {
      accepts: ["create-node"],
      onDrop
    };

    mockDeserialize.mockReturnValue({
      type: "create-node",
      payload: { node_type: "test.Node" } as any
    });

    const { result } = renderHook(() => useDropZone(config));

    act(() => {
      result.current.onDragEnter(createMockDragEvent());
    });
    expect(result.current.isOver).toBe(true);

    await act(async () => {
      await result.current.onDrop(createMockDragEvent());
    });

    expect(result.current.isOver).toBe(false);
    expect(result.current.canDrop).toBe(false);
    expect(onDrop).toHaveBeenCalledWith(
      { type: "create-node", payload: { node_type: "test.Node" } },
      expect.any(Object),
      expect.objectContaining({ x: 100, y: 200 })
    );
  });

  it("does not call onDrop when type is not accepted", async () => {
    const onDrop = jest.fn();
    const config: DropZoneConfig = {
      accepts: ["asset"],
      onDrop
    };

    mockDeserialize.mockReturnValue({
      type: "create-node",
      payload: { node_type: "test.Node" } as any
    });

    const { result } = renderHook(() => useDropZone(config));

    await act(async () => {
      await result.current.onDrop(createMockDragEvent());
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does not call onDrop when disabled", async () => {
    const onDrop = jest.fn();
    const config: DropZoneConfig = {
      accepts: ["create-node"],
      onDrop,
      disabled: true
    };

    mockDeserialize.mockReturnValue({
      type: "create-node",
      payload: { node_type: "test.Node" } as any
    });

    const { result } = renderHook(() => useDropZone(config));

    await act(async () => {
      await result.current.onDrop(createMockDragEvent());
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("handles external file drops", async () => {
    const onDrop = jest.fn();
    const config: DropZoneConfig = {
      accepts: ["file"],
      onDrop
    };

    const mockFile = new File(["content"], "test.png", { type: "image/png" });
    mockHasExternalFiles.mockReturnValue(true);
    mockExtractFiles.mockReturnValue([mockFile]);

    const { result } = renderHook(() => useDropZone(config));

    await act(async () => {
      await result.current.onDrop(createMockDragEvent());
    });

    expect(onDrop).toHaveBeenCalledWith(
      { type: "file", payload: mockFile },
      expect.any(Object),
      expect.objectContaining({ x: 100, y: 200 })
    );
  });

  it("does not call onDrop when deserialize returns null and no external files", async () => {
    const onDrop = jest.fn();
    const config: DropZoneConfig = {
      accepts: ["create-node"],
      onDrop
    };

    mockDeserialize.mockReturnValue(null);
    mockHasExternalFiles.mockReturnValue(false);

    const { result } = renderHook(() => useDropZone(config));

    await act(async () => {
      await result.current.onDrop(createMockDragEvent());
    });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("applies activeClassName when dragging over", () => {
    const config: DropZoneConfig = {
      accepts: ["asset"],
      onDrop: jest.fn(),
      activeClassName: "drag-over"
    };

    const { result } = renderHook(() => useDropZone(config));

    expect(result.current.className).toBeUndefined();

    act(() => {
      result.current.onDragEnter(createMockDragEvent());
    });

    expect(result.current.className).toBe("drag-over");
  });
});
