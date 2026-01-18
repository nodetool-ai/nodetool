import { renderHook, act, waitFor } from "@testing-library/react";
import { useDropZone } from "../useDropZone";
import { useDragDropStore } from "../store";
import { deserializeDragData } from "../serialization";

// Mock dependencies
jest.mock("../store");
jest.mock("../serialization");

const mockUseDragDropStore = useDragDropStore as jest.MockedFunction<typeof useDragDropStore>;
const mockDeserializeDragData = deserializeDragData as jest.MockedFunction<typeof deserializeDragData>;

describe("useDropZone", () => {
  const mockOnDrop = jest.fn();
  const mockValidate = jest.fn();

  const createMockDataTransfer = (files: File[] = [], data: any = null): DataTransfer => {
    const dt = {
      files: files as any,
      types: data ? ["application/json"] : [],
      getData: jest.fn((type: string) => {
        if (type === "application/json" && data) {
          return JSON.stringify(data);
        }
        return "";
      })
    } as unknown as DataTransfer;
    return dt;
  };

  const createDragData = (type: "node" | "file" | "other", payload: any) => ({ type, payload });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeserializeDragData.mockReturnValue(null);
  });

  describe("initial state", () => {
    it("initializes with isOver and canDrop as false", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      expect(result.current.isOver).toBe(false);
      expect(result.current.canDrop).toBe(false);
    });
  });

  describe("drag enter", () => {
    it("sets isOver to true on first drag enter", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;

      act(() => {
        result.current.onDragEnter(event);
      });

      expect(result.current.isOver).toBe(true);
    });

    it("handles nested drag enter events", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;

      act(() => {
        result.current.onDragEnter(event);
      });
      act(() => {
        result.current.onDragEnter(event);
      });

      expect(result.current.isOver).toBe(true);
    });
  });

  describe("drag leave", () => {
    it("sets isOver and canDrop to false when leaving last element", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;

      act(() => {
        result.current.onDragEnter(event);
      });
      act(() => {
        result.current.onDragLeave(event);
      });

      expect(result.current.isOver).toBe(false);
      expect(result.current.canDrop).toBe(false);
    });

    it("keeps isOver true when leaving nested element", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;

      act(() => {
        result.current.onDragEnter(event);
      });
      act(() => {
        result.current.onDragEnter(event);
      });
      act(() => {
        result.current.onDragLeave(event);
      });

      expect(result.current.isOver).toBe(true);
    });
  });

  describe("drag over", () => {
    it("sets canDrop to false when no active drag data", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDragOver(event);
      });

      expect(result.current.canDrop).toBe(false);
    });

    it("sets canDrop to false for invalid drag data", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });
      mockDeserializeDragData.mockReturnValue(createDragData("other", {}));

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDragOver(event);
      });

      expect(result.current.canDrop).toBe(false);
    });

    it("sets dropEffect to none when disabled", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop,
          disabled: true
        })
      );

      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { dropEffect: "" }
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDragOver(event);
      });

      expect(event.dataTransfer.dropEffect).toBe("none");
    });
  });

  describe("drop", () => {
    it("calls onDrop with deserialized data", async () => {
      const dragData = createDragData("node", { id: "test" });
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });
      mockDeserializeDragData.mockReturnValue(dragData);

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 100,
        clientY: 200,
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(mockOnDrop).toHaveBeenCalledWith(
        dragData,
        expect.any(Object),
        { x: 100, y: 200 }
      );
    });

    it("resets state after drop", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(result.current.isOver).toBe(false);
      expect(result.current.canDrop).toBe(false);
    });

    it("does nothing when disabled", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop,
          disabled: true
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(mockOnDrop).not.toHaveBeenCalled();
    });

    it("does nothing when data type not accepted", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });
      mockDeserializeDragData.mockReturnValue(createDragData("other", {}));

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(mockOnDrop).not.toHaveBeenCalled();
    });

    it("skips validation if data is null", async () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });
      mockDeserializeDragData.mockReturnValue(null);

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(mockOnDrop).not.toHaveBeenCalled();
    });

    it("fails validation when custom validate returns false", async () => {
      const dragData = createDragData("node", {});
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });
      mockDeserializeDragData.mockReturnValue(dragData);
      mockValidate.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop,
          validate: mockValidate
        })
      );

      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: createMockDataTransfer()
      } as unknown as React.DragEvent;

      await waitFor(async () => {
        await result.current.onDrop(event);
      });

      expect(mockOnDrop).not.toHaveBeenCalled();
    });
  });

  describe("className", () => {
    it("returns undefined when not over", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      expect(result.current.className).toBeUndefined();
    });

    it("returns activeClassName when over", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop,
          activeClassName: "active"
        })
      );

      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;

      act(() => {
        result.current.onDragEnter(event);
      });

      expect(result.current.className).toBe("active");
    });
  });

  describe("data-dropzone attribute", () => {
    it("includes data-dropzone attribute", () => {
      mockUseDragDropStore.mockReturnValue({
        activeDrag: null,
        setActiveDrag: jest.fn(),
        clearActiveDrag: jest.fn()
      });

      const { result } = renderHook(() =>
        useDropZone({
          accepts: ["node"],
          onDrop: mockOnDrop
        })
      );

      expect(result.current["data-dropzone"]).toBe(true);
    });
  });
});
