/**
 * @jest-environment node
 */
import {
  ensureSketchDocumentForAsset,
  readSketchDocumentId
} from "../ensureSketchDocumentForAsset";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    sketch: {
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));
jest.mock("../buildSeededImageDocument", () => ({
  buildSeededImageDocument: (document: unknown) => document
}));

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

describe("ensureSketchDocumentForAsset", () => {
  const createMock = trpcClient.sketch.create.mutate as jest.Mock;

  beforeEach(() => {
    createMock.mockReset();
    createMock.mockImplementation(async () => ({
      id: `doc-${createMock.mock.calls.length}`,
      document: {}
    }));
    class FakeImage {
      naturalWidth = 64;
      naturalHeight = 64;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(_url: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as { Image?: unknown }).Image = FakeImage;
  });

  // QA round 7: one "New sketch" listed two "Untitled.png" documents.
  it("creates one document when asked twice before the first finishes", async () => {
    const asset = fakeAsset() as Parameters<
      typeof ensureSketchDocumentForAsset
    >[0];
    const updateAsset = jest.fn(async () => asset);

    const [first, second] = await Promise.all([
      ensureSketchDocumentForAsset(asset, updateAsset),
      ensureSketchDocumentForAsset(asset, updateAsset)
    ]);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});
