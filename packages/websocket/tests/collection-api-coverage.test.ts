/**
 * Tests for collection-api.ts — the multipart file-upload REST handler.
 *
 * Exercises route matching, method restriction, content-type validation, the
 * missing-file branch, successful chunk upsert + resource-change notification,
 * the empty-document (no chunks) branch, CollectionNotFoundError → 404, and
 * generic errors → 500. The vector provider is mocked; splitDocument runs for
 * real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@nodetool-ai/vectorstore", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/vectorstore")>();
  return {
    ...actual,
    getDefaultVectorProvider: vi.fn(),
    CollectionNotFoundError: actual.CollectionNotFoundError,
    splitDocument: actual.splitDocument
  };
});

vi.mock("../src/resource-events.js", async (orig) => {
  const actual = await orig<typeof import("../src/resource-events.js")>();
  return {
    ...actual,
    notifyResourceChange: vi.fn()
  };
});

import {
  getDefaultVectorProvider,
  CollectionNotFoundError
} from "@nodetool-ai/vectorstore";
import { notifyResourceChange } from "../src/resource-events.js";
import { handleCollectionRequest } from "../src/collection-api.js";
import type { HttpApiOptions } from "../src/http-api.js";

const providerMock = getDefaultVectorProvider as unknown as ReturnType<
  typeof vi.fn
>;
const notifyMock = notifyResourceChange as unknown as ReturnType<typeof vi.fn>;

const options = {} as HttpApiOptions;

function makeCollection() {
  return { upsert: vi.fn().mockResolvedValue(undefined) };
}

function uploadRequest(
  urlPath: string,
  opts: {
    method?: string;
    file?: { name: string; content: string };
    contentType?: string;
    noForm?: boolean;
  } = {}
): Request {
  const method = opts.method ?? "POST";
  if (opts.noForm) {
    return new Request(`http://localhost${urlPath}`, {
      method,
      headers: opts.contentType
        ? { "content-type": opts.contentType }
        : undefined
    });
  }
  const form = new FormData();
  if (opts.file) {
    form.set("file", new File([opts.file.content], opts.file.name));
  }
  return new Request(`http://localhost${urlPath}`, { method, body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("route matching", () => {
  it("returns null for a non-matching path (falls through)", async () => {
    const res = await handleCollectionRequest(
      new Request("http://localhost/api/collections/foo/query", {
        method: "POST"
      }),
      "/api/collections/foo/query",
      options
    );
    expect(res).toBeNull();
  });

  it("normalizes a trailing slash before matching", async () => {
    const collection = makeCollection();
    providerMock.mockReturnValue({
      getCollection: vi.fn().mockResolvedValue(collection)
    });
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index/", {
        file: { name: "a.txt", content: "hello" }
      }),
      "/api/collections/docs/index/",
      options
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe("method and content-type validation", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await handleCollectionRequest(
      new Request("http://localhost/api/collections/docs/index", {
        method: "GET"
      }),
      "/api/collections/docs/index",
      options
    );
    expect(res!.status).toBe(405);
  });

  it("rejects a non-multipart content type with 400", async () => {
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index", {
        noForm: true,
        contentType: "application/json"
      }),
      "/api/collections/docs/index",
      options
    );
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.detail).toContain("multipart/form-data");
  });
});

describe("file presence", () => {
  it("returns 400 when no file field is provided", async () => {
    providerMock.mockReturnValue({
      getCollection: vi.fn().mockResolvedValue(makeCollection())
    });
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index", {}),
      "/api/collections/docs/index",
      options
    );
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.detail).toContain("No file provided");
  });
});

describe("successful upload", () => {
  it("splits the document, upserts chunks and notifies", async () => {
    const collection = makeCollection();
    const getCollection = vi.fn().mockResolvedValue(collection);
    providerMock.mockReturnValue({ getCollection });

    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/my%20docs/index", {
        file: { name: "note.txt", content: "hello world" }
      }),
      "/api/collections/my%20docs/index",
      options
    );

    expect(getCollection).toHaveBeenCalledWith({ name: "my docs" });
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toEqual({ path: "note.txt", chunks: 1, error: null });

    expect(collection.upsert).toHaveBeenCalledTimes(1);
    const upserted = collection.upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "note.txt#0",
      document: "hello world",
      metadata: { source: "note.txt", start_index: "0" }
    });

    expect(notifyMock).toHaveBeenCalledWith({
      event: "updated",
      resource_type: "collection",
      resource: { id: "my docs" }
    });
  });

  it("skips upsert and notify for an empty document", async () => {
    const collection = makeCollection();
    providerMock.mockReturnValue({
      getCollection: vi.fn().mockResolvedValue(collection)
    });

    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index", {
        file: { name: "empty.txt", content: "   " }
      }),
      "/api/collections/docs/index",
      options
    );

    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toEqual({ path: "empty.txt", chunks: 0, error: null });
    expect(collection.upsert).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("error handling", () => {
  it("maps CollectionNotFoundError to 404", async () => {
    providerMock.mockReturnValue({
      getCollection: vi
        .fn()
        .mockRejectedValue(new CollectionNotFoundError("nope"))
    });
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/nope/index", {
        file: { name: "a.txt", content: "hi" }
      }),
      "/api/collections/nope/index",
      options
    );
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.detail).toContain("Collection not found");
  });

  it("maps a generic Error to 500 with the message", async () => {
    providerMock.mockReturnValue({
      getCollection: vi.fn().mockRejectedValue(new Error("boom"))
    });
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index", {
        file: { name: "a.txt", content: "hi" }
      }),
      "/api/collections/docs/index",
      options
    );
    expect(res!.status).toBe(500);
    const body = await res!.json();
    expect(body.detail).toContain("Vector store error");
    expect(body.detail).toContain("boom");
  });

  it("stringifies a non-Error throw in the 500 message", async () => {
    providerMock.mockImplementation(() => {
      throw "raw failure";
    });
    const res = await handleCollectionRequest(
      uploadRequest("/api/collections/docs/index", {
        file: { name: "a.txt", content: "hi" }
      }),
      "/api/collections/docs/index",
      options
    );
    expect(res!.status).toBe(500);
    const body = await res!.json();
    expect(body.detail).toContain("raw failure");
  });
});
