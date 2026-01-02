import {
  serializeDragData,
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  createDragCountBadge,
  DRAG_DATA_MIME
} from "../serialization";
import type { DragData } from "../types";

describe("serialization", () => {
  describe("serializeDragData", () => {
    it("should serialize create-node data with both new and legacy formats", () => {
      const mockDataTransfer = {
        setData: jest.fn()
      } as unknown as DataTransfer;

      const data: DragData<"create-node"> = {
        type: "create-node",
        payload: { node_type: "test.Node", title: "Test" } as any
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        DRAG_DATA_MIME,
        expect.any(String)
      );
      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "create-node",
        expect.any(String)
      );
    });

    it("should serialize asset data with legacy key", () => {
      const mockDataTransfer = {
        setData: jest.fn()
      } as unknown as DataTransfer;

      const data: DragData<"asset"> = {
        type: "asset",
        payload: { id: "123", name: "test.png" } as any
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        DRAG_DATA_MIME,
        expect.any(String)
      );
      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "asset",
        expect.any(String)
      );
    });

    it("should serialize assets-multiple with selectedAssetIds legacy key", () => {
      const mockDataTransfer = {
        setData: jest.fn()
      } as unknown as DataTransfer;

      const data: DragData<"assets-multiple"> = {
        type: "assets-multiple",
        payload: ["id1", "id2", "id3"]
      };

      serializeDragData(data, mockDataTransfer);

      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        DRAG_DATA_MIME,
        expect.any(String)
      );
      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        "selectedAssetIds",
        JSON.stringify(["id1", "id2", "id3"])
      );
    });
  });

  describe("deserializeDragData", () => {
    it("should prefer new format over legacy", () => {
      const mockDataTransfer = {
        getData: jest.fn((key: string) => {
          if (key === DRAG_DATA_MIME) {
            return JSON.stringify({
              type: "create-node",
              payload: { node_type: "new.Node" }
            });
          }
          if (key === "create-node") {
            return JSON.stringify({ node_type: "legacy.Node" });
          }
          return "";
        }),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("create-node");
      expect((result?.payload as any).node_type).toBe("new.Node");
    });

    it("should fall back to legacy create-node format", () => {
      const mockDataTransfer = {
        getData: jest.fn((key: string) => {
          if (key === "create-node") {
            return JSON.stringify({ node_type: "legacy.Node" });
          }
          return "";
        }),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("create-node");
      expect((result?.payload as any).node_type).toBe("legacy.Node");
    });

    it("should fall back to legacy asset format", () => {
      const mockDataTransfer = {
        getData: jest.fn((key: string) => {
          if (key === "asset") {
            return JSON.stringify({ id: "123", name: "test.png" });
          }
          return "";
        }),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("asset");
      expect((result?.payload as any).id).toBe("123");
    });

    it("should fall back to legacy selectedAssetIds format", () => {
      const mockDataTransfer = {
        getData: jest.fn((key: string) => {
          if (key === "selectedAssetIds") {
            return JSON.stringify(["id1", "id2"]);
          }
          return "";
        }),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result?.type).toBe("assets-multiple");
      expect(result?.payload).toEqual(["id1", "id2"]);
      expect(result?.metadata?.count).toBe(2);
    });

    it("should return null for invalid JSON", () => {
      const mockDataTransfer = {
        getData: jest.fn((key: string) => {
          if (key === "create-node") {
            return "invalid json";
          }
          return "";
        }),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toBeNull();
    });

    it("should return null when no data is present", () => {
      const mockDataTransfer = {
        getData: jest.fn(() => ""),
        items: [],
        files: { length: 0 }
      } as unknown as DataTransfer;

      const result = deserializeDragData(mockDataTransfer);

      expect(result).toBeNull();
    });
  });

  describe("hasExternalFiles", () => {
    it("should detect files via items property", () => {
      const mockDataTransfer = {
        items: [{ kind: "file" }, { kind: "string" }]
      } as unknown as DataTransfer;

      expect(hasExternalFiles(mockDataTransfer)).toBe(true);
    });

    it("should return false when no file items", () => {
      const mockDataTransfer = {
        items: [{ kind: "string" }],
        files: { length: 0 }
      } as unknown as DataTransfer;

      expect(hasExternalFiles(mockDataTransfer)).toBe(false);
    });

    it("should fallback to files property", () => {
      const mockDataTransfer = {
        items: null,
        files: { length: 2 }
      } as unknown as DataTransfer;

      expect(hasExternalFiles(mockDataTransfer)).toBe(true);
    });
  });

  describe("extractFiles", () => {
    it("should convert FileList to array", () => {
      const file1 = new File(["content1"], "test1.txt");
      const file2 = new File(["content2"], "test2.txt");
      const mockDataTransfer = {
        files: [file1, file2]
      } as unknown as DataTransfer;

      const result = extractFiles(mockDataTransfer);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(file1);
      expect(result[1]).toBe(file2);
    });
  });

  describe("createDragCountBadge", () => {
    it("should create a styled div with the count", () => {
      const badge = createDragCountBadge(5);

      expect(badge.tagName).toBe("DIV");
      expect(badge.textContent).toBe("5");
      expect(badge.style.position).toBe("absolute");
      expect(badge.style.display).toBe("flex");
    });

    it("should handle single item count", () => {
      const badge = createDragCountBadge(1);

      expect(badge.textContent).toBe("1");
    });
  });
});
