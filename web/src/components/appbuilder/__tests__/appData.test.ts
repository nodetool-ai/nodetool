import {
  createEmptyData,
  createEmptyDocument,
  parseApplicationDocument,
  isRenderableData,
  APP_SCHEMA_VERSION
} from "../appData";

describe("appData", () => {
  it("creates an empty data document", () => {
    const data = createEmptyData();
    expect(data.content).toEqual([]);
    expect(data.root).toEqual({ props: {} });
  });

  it("creates a document with a title in root props", () => {
    const doc = createEmptyDocument("My App");
    expect(doc.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(doc.ui.root.props?.title).toBe("My App");
    expect(doc.operations).toEqual([]);
  });

  describe("parseApplicationDocument", () => {
    it("returns null for non-documents", () => {
      expect(parseApplicationDocument(null)).toBeNull();
      expect(parseApplicationDocument("x")).toBeNull();
      expect(parseApplicationDocument({})).toBeNull();
      expect(parseApplicationDocument({ data: { root: {} } })).toBeNull();
    });

    it("lifts a legacy document into one operation on the host workflow", () => {
      const doc = parseApplicationDocument(
        {
          version: 2,
          data: {
            root: { props: {} },
            content: [{ type: "Text", props: { id: "t1", text: "hi" } }],
            zones: {}
          }
        },
        { hostWorkflowId: "wf1" }
      );
      expect(doc).not.toBeNull();
      expect(doc!.schemaVersion).toBe(APP_SCHEMA_VERSION);
      expect(doc!.ui.content).toHaveLength(1);
      expect(doc!.operations[0]).toMatchObject({ workflowId: "wf1" });
    });

    it("refuses a document written by a newer schema", () => {
      expect(
        parseApplicationDocument({
          schemaVersion: 99,
          ui: { root: { props: {} }, content: [] }
        })
      ).toBeNull();
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
