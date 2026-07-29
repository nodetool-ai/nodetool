/**
 * @jest-environment node
 */
import { readSketchDocumentId } from "../ensureSketchDocumentForAsset";

function fakeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    user_id: "user-1",
    parent_id: null,
    name: "test.png",
    content_type: "image/png",
    workflow_id: null,
    created_at: "2025-01-01T00:00:00Z",
    get_url: null,
    thumb_url: null,
    ...overrides
  };
}

describe("readSketchDocumentId", () => {
  it("returns the sketch_document_id when present", () => {
    const asset = fakeAsset({ sketch_document_id: "doc-123" });
    expect(readSketchDocumentId(asset)).toBe("doc-123");
  });

  it("returns null when sketch_document_id is undefined", () => {
    const asset = fakeAsset();
    expect(readSketchDocumentId(asset)).toBeNull();
  });

  it("returns null when sketch_document_id is null", () => {
    const asset = fakeAsset({ sketch_document_id: null });
    expect(readSketchDocumentId(asset)).toBeNull();
  });

  it("returns null when sketch_document_id is an empty string", () => {
    const asset = fakeAsset({ sketch_document_id: "" });
    expect(readSketchDocumentId(asset)).toBeNull();
  });

  it("returns null when sketch_document_id is not a string", () => {
    const asset = fakeAsset({ sketch_document_id: 42 });
    expect(readSketchDocumentId(asset)).toBeNull();
  });
});
