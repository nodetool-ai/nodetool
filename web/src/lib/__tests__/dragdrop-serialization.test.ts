import {
  serializeDragData,
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  createDragCountBadge,
  DRAG_DATA_MIME
} from "../dragdrop/serialization";
import type { DragData } from "../dragdrop/types";

interface MockDataTransfer extends DataTransfer {
  setData: jest.Mock;
  getData: jest.Mock;
  items: DataTransferItemList;
  files: FileList;
  clearData: jest.Mock;
}

describe("dragdrop serialization", () => {
  let mockDataTransfer: MockDataTransfer;

  beforeEach(() => {
    mockDataTransfer = {
      setData: jest.fn(),
      getData: jest.fn(),
      items: { length: 0, [Symbol.iterator]: function* () {} } as unknown as DataTransferItemList,
      files: { length: 0, [Symbol.iterator]: function* () {} } as unknown as FileList,
      clearData: jest.fn(),
      dropEffect: "none",
      effectAllowed: "uninitialized",
      types: [] as unknown as DOMStringList
    } as unknown as MockDataTransfer;
  });

  describe("serializeDragData", () => {
    it("sets unified format in dataTransfer", () => {
      const data: DragData<"create-node"> = {
        type: "create-node",
        payload: { id: "test-node", name: "Test Node" } as any
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        DRAG_DATA_MIME,
        JSON.stringify(data)
      );
    });

    it("sets legacy format for create-node", () => {
      const data: DragData<"create-node"> = {
        type: "create-node",
        payload: { id: "test-node", name: "Test Node" } as any
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "create-node",
        JSON.stringify(data.payload)
      );
    });

    it("sets legacy format for asset", () => {
      const data: DragData<"asset"> = {
        type: "asset",
        payload: { id: "asset-1", name: "test.jpg" } as any
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "asset",
        JSON.stringify(data.payload)
      );
    });

    it("sets legacy format for assets-multiple", () => {
      const data: DragData<"assets-multiple"> = {
        type: "assets-multiple",
        payload: ["asset-1", "asset-2"]
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "selectedAssetIds",
        JSON.stringify(data.payload)
      );
    });

    it("does not set legacy key for file type", () => {
      const data: DragData<"file"> = {
        type: "file",
        payload: new File(["content"], "test.txt", { type: "text/plain" })
      };

      serializeDragData(data, mockDataTransfer);

      const setDataCalls = mockDataTransfer.setData.mock.calls;
      const fileCalls = setDataCalls.filter((call: string[]) => call[0] === "");
      expect(fileCalls).toHaveLength(0);
    });
  });

  describe("deserializeDragData", () => {
    it("returns unified format when present", () => {
      const unifiedData: DragData<"create-node"> = {
        type: "create-node",
        payload: { id: "test-node" } as any
      };
      mockDataTransfer.getData.mockImplementation((key: string) => {
        if (key === DRAG_DATA_MIME) {
          return JSON.stringify(unifiedData);
        }
        return "";
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toEqual(unifiedData);
      expect(result?.type).toBe("create-node");
    });

    it("falls back to legacy create-node format", () => {
      mockDataTransfer.getData.mockImplementation((key: string) => {
        if (key === "create-node") {
          return JSON.stringify({ id: "legacy-node" });
        }
        return "";
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("create-node");
      expect((result as any).payload.id).toBe("legacy-node");
    });

    it("falls back to legacy asset format", () => {
      mockDataTransfer.getData.mockImplementation((key: string) => {
        if (key === "asset") {
          return JSON.stringify({ id: "asset-1" });
        }
        return "";
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("asset");
      expect((result as any).payload.id).toBe("asset-1");
    });

    it("falls back to legacy assets-multiple format", () => {
      mockDataTransfer.getData.mockImplementation((key: string) => {
        if (key === "selectedAssetIds") {
          return JSON.stringify(["id-1", "id-2"]);
        }
        return "";
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("assets-multiple");
      expect((result as any).payload).toEqual(["id-1", "id-2"]);
      expect((result as any).metadata.count).toBe(2);
    });

    it("returns null for invalid JSON", () => {
      mockDataTransfer.getData.mockImplementation((key: string) => {
        if (key === DRAG_DATA_MIME) {
          return "invalid json";
        }
        return "";
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toBeNull();
    });

    it("returns null when no valid data found", () => {
      mockDataTransfer.getData.mockReturnValue("");

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toBeNull();
    });

    it("returns null when external files are present", () => {
      mockDataTransfer.getData.mockReturnValue("");
      const mockItems = {
        length: 1,
        0: { kind: "file" } as DataTransferItem,
        [Symbol.iterator]: function* () {}
      };
      Object.defineProperty(mockDataTransfer, "items", {
        value: mockItems,
        writable: true
      });

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toBeNull();
    });
  });

  describe("hasExternalFiles", () => {
    it("returns true when items contain files", () => {
      const mockItems = {
        length: 2,
        0: { kind: "file" } as DataTransferItem,
        1: { kind: "string" } as DataTransferItem,
        [Symbol.iterator]: function* () {
          yield mockItems[0];
          yield mockItems[1];
        }
      };
      Object.defineProperty(mockDataTransfer, "items", {
        value: mockItems,
        writable: true
      });

      expect(hasExternalFiles(mockDataTransfer)).toBe(true);
    });

    it("returns false when no file items", () => {
      const mockItems = {
        length: 1,
        0: { kind: "string" } as DataTransferItem,
        [Symbol.iterator]: function* () {
          yield mockItems[0];
        }
      };
      Object.defineProperty(mockDataTransfer, "items", {
        value: mockItems,
        writable: true
      });

      expect(hasExternalFiles(mockDataTransfer)).toBe(false);
    });

    it("falls back to files.length when items is null", () => {
      Object.defineProperty(mockDataTransfer, "items", {
        value: null,
        writable: true
      });
      Object.defineProperty(mockDataTransfer, "files", {
        value: { length: 1 },
        writable: true
      });

      expect(hasExternalFiles(mockDataTransfer)).toBe(true);
    });
  });

  describe("extractFiles", () => {
    it("returns array of files from dataTransfer", () => {
      const file1 = new File(["content"], "test1.txt");
      const file2 = new File(["content"], "test2.txt");
      Object.defineProperty(mockDataTransfer, "files", {
        value: { 0: file1, 1: file2, length: 2, [Symbol.iterator]: function* () {
          yield file1;
          yield file2;
        } },
        writable: true
      });

      const result = extractFiles(mockDataTransfer);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("test1.txt");
      expect(result[1].name).toBe("test2.txt");
    });

    it("returns empty array when no files", () => {
      Object.defineProperty(mockDataTransfer, "files", {
        value: { length: 0, [Symbol.iterator]: function* () {} },
        writable: true
      });

      const result = extractFiles(mockDataTransfer);

      expect(result).toHaveLength(0);
    });
  });

  describe("createDragCountBadge", () => {
    it("creates a badge element with count", () => {
      const badge = createDragCountBadge(5);

      expect(badge.textContent).toBe("5");
      expect(badge.style.position).toBe("absolute");
    });

    it("creates badge with different counts", () => {
      expect(createDragCountBadge(1).textContent).toBe("1");
      expect(createDragCountBadge(100).textContent).toBe("100");
    });
  });
});
