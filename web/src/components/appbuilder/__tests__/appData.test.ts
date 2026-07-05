import {
  createEmptyData,
  createEmptyDocument,
  parseAppDocument,
  isRenderableData,
  APP_DATA_VERSION
} from "../appData";

describe("appData", () => {
  it("creates an empty data document", () => {
    const data = createEmptyData();
    expect(data.content).toEqual([]);
    expect(data.root).toEqual({ props: {} });
  });

  it("creates a document with a title in root props", () => {
    const doc = createEmptyDocument("My App");
    expect(doc.version).toBe(APP_DATA_VERSION);
    expect(doc.data.root.props?.title).toBe("My App");
  });

  describe("parseAppDocument", () => {
    it("returns null for non-documents", () => {
      expect(parseAppDocument(null)).toBeNull();
      expect(parseAppDocument("x")).toBeNull();
      expect(parseAppDocument({})).toBeNull();
      expect(parseAppDocument({ data: { root: {} } })).toBeNull(); // no content array
    });

    it("parses a valid Puck document", () => {
      const doc = parseAppDocument({
        version: 99,
        data: {
          root: { props: {} },
          content: [{ type: "Text", props: { id: "t1", text: "hi" } }],
          zones: {}
        }
      });
      expect(doc).not.toBeNull();
      expect(doc!.version).toBe(APP_DATA_VERSION);
      expect(doc!.data.content).toHaveLength(1);
    });
  });

  describe("isRenderableData", () => {
    it("is false for null/empty", () => {
      expect(isRenderableData(null)).toBe(false);
      expect(isRenderableData(createEmptyData())).toBe(false);
    });
    it("is true with content", () => {
      const data = createEmptyData();
      data.content.push({ type: "Text", props: { id: "t1" } });
      expect(isRenderableData(data)).toBe(true);
    });
  });
});
