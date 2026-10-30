/**
 * The `openverse` router proxies Openverse search with the user's optional
 * credentials, and imports results as assets by id, downloading each file
 * through `safeFetch` and keeping its license record on the asset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secrets: {} as Record<string, string>,
  assetFind: vi.fn(),
  createAsset: vi.fn(),
  safeFetch: vi.fn()
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn(async (key: string) => mocks.secrets[key] ?? null),
    Asset: { ...actual.Asset, find: mocks.assetFind }
  };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return { ...actual, safeFetch: mocks.safeFetch };
});

vi.mock("@nodetool-ai/asset-services/asset-model-interface", () => ({
  createAssetModelInterface: mocks.createAsset
}));

vi.mock("../src/lib/asset-response.js", () => ({
  toAssetResponse: vi.fn(async (asset: Record<string, unknown>) => ({
    id: asset.id,
    user_id: asset.userId,
    workflow_id: null,
    parent_id: asset.parentId,
    name: asset.name,
    content_type: asset.contentType,
    size: 3,
    metadata: asset.metadata,
    sketch_document_id: null,
    created_at: "2026-10-17T00:00:00Z",
    get_url: null,
    thumb_url: null,
    duration: null,
    node_id: null,
    job_id: null
  }))
}));

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { clearOpenverseTokenCache } from "../src/lib/openverse.js";

const createCaller = createCallerFactory(appRouter);

function caller(userId = "user-1") {
  return createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

const IMAGE_ID = "f9384235-b72e-4f1e-9b05-e1b116262a29";
const IMAGE = {
  id: IMAGE_ID,
  title: "Cat / on a mat",
  url: "https://live.staticflickr.com/1/cat.jpg",
  thumbnail: `https://api.openverse.org/v1/images/${IMAGE_ID}/thumb/`,
  foreign_landing_url: "https://www.flickr.com/photos/x/1",
  creator: "Jane",
  creator_url: "https://www.flickr.com/photos/x",
  license: "by",
  license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by/2.0/",
  attribution: '"Cat" by Jane is licensed under CC BY 2.0.',
  source: "flickr",
  provider: "flickr",
  filetype: "jpg",
  tags: [{ name: "cat", accuracy: null }],
  width: 640,
  height: 480
};

type Responder = (url: string, init: RequestInit) => Response;

function api(...responders: Responder[]) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const next = responders.shift();
    if (!next) {
      throw new Error(`unexpected request to ${url}`);
    }
    return next(String(url), init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown): Responder => () => Response.json(body);
const searchPage = json({
  result_count: 1234,
  page_count: 12,
  page: 1,
  page_size: 20,
  results: [IMAGE, { ...IMAGE, id: "no-file", url: null }]
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.secrets = {};
  clearOpenverseTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openverse.search", () => {
  it("searches anonymously and drops results without a file", async () => {
    const fetchMock = api(searchPage);

    const result = await caller().openverse.search({
      media_type: "images",
      q: "cat",
      license_type: "commercial",
      category: "photograph"
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      "https://api.openverse.org/v1/images/"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "cat",
      page: "1",
      page_size: "20",
      license_type: "commercial",
      category: "photograph"
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "Authorization"
    );
    expect(result.authenticated).toBe(false);
    expect(result.result_count).toBe(1234);
    expect(result.results).toEqual([
      expect.objectContaining({
        id: IMAGE_ID,
        media_type: "images",
        license: "by",
        attribution: IMAGE.attribution,
        landing_url: IMAGE.foreign_landing_url,
        thumbnail: IMAGE.thumbnail,
        width: 640,
        duration_seconds: null
      })
    ]);
  });

  it("omits the license filter for any license and reports audio duration in seconds", async () => {
    const fetchMock = api(
      json({
        result_count: 1,
        page_count: 1,
        page: 1,
        results: [
          {
            ...IMAGE,
            url: "https://cdn.freesound.org/rain.mp3",
            license: "cc0",
            duration: 12500
          }
        ]
      })
    );

    const result = await caller().openverse.search({
      media_type: "audio",
      q: "rain"
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v1/audio/");
    expect(url.searchParams.has("license_type")).toBe(false);
    expect(result.results[0]?.duration_seconds).toBe(12.5);
  });

  it("exchanges the user's client credentials once and sends the token", async () => {
    mocks.secrets = {
      OPENVERSE_CLIENT_ID: "id",
      OPENVERSE_CLIENT_SECRET: "secret"
    };
    const fetchMock = api(
      (url, init) => {
        expect(url).toBe("https://api.openverse.org/v1/auth_tokens/token/");
        expect(init.method).toBe("POST");
        expect(
          Object.fromEntries(new URLSearchParams(String(init.body)))
        ).toEqual({
          grant_type: "client_credentials",
          client_id: "id",
          client_secret: "secret"
        });
        return Response.json({ access_token: "tok", expires_in: 36000 });
      },
      searchPage,
      searchPage
    );

    const first = await caller().openverse.search({
      media_type: "images",
      q: "cat"
    });
    await caller().openverse.search({ media_type: "images", q: "dog" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer tok"
    });
    expect(first.authenticated).toBe(true);
  });

  it("refuses half-configured credentials before calling Openverse", async () => {
    mocks.secrets = { OPENVERSE_CLIENT_ID: "id" };
    const fetchMock = api();

    await expect(
      caller().openverse.search({ media_type: "images", q: "cat" })
    ).rejects.toThrow(/OPENVERSE_CLIENT_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the credentials when anonymous search is rate limited", async () => {
    api(() => new Response("throttled", { status: 429 }));

    await expect(
      caller().openverse.search({ media_type: "images", q: "cat" })
    ).rejects.toThrow(/OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET/);
  });
});

describe("openverse.import", () => {
  it("looks the item up by id, downloads it safely and stores its license", async () => {
    const fetchMock = api(json(IMAGE));
    mocks.safeFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/jpeg; charset=binary" }
      })
    );
    mocks.assetFind.mockResolvedValue({ id: "folder-1", content_type: "folder" });
    mocks.createAsset.mockImplementation(async (args) => ({
      id: "asset-1",
      ...args
    }));

    const result = await caller().openverse.import({
      media_type: "images",
      ids: [IMAGE_ID, IMAGE_ID],
      parent_id: "folder-1"
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://api.openverse.org/v1/images/${IMAGE_ID}/`
    );
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(mocks.safeFetch.mock.calls[0]?.[0]).toBe(IMAGE.url);
    expect(mocks.assetFind).toHaveBeenCalledWith("user-1", "folder-1");
    expect(mocks.createAsset).toHaveBeenCalledTimes(1);
    const args = mocks.createAsset.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      userId: "user-1",
      name: "Cat on a mat.jpg",
      contentType: "image/jpeg",
      parentId: "folder-1",
      projectId: "default",
      metadata: {
        openverse: expect.objectContaining({
          id: IMAGE_ID,
          license: "by",
          license_url: IMAGE.license_url,
          attribution: IMAGE.attribution,
          landing_url: IMAGE.foreign_landing_url
        })
      }
    });
    expect(Array.from(args.content as Uint8Array)).toEqual([1, 2, 3]);
    expect(result.failed).toEqual([]);
    expect(result.assets).toHaveLength(1);
  });

  it("reports a file the source refuses without failing the batch", async () => {
    const second = "8624ba61-57f1-4f98-8a85-ece206c319cf";
    api(json(IMAGE), json({ ...IMAGE, id: second }));
    mocks.safeFetch
      .mockResolvedValueOnce(new Response("gone", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9]), {
          headers: { "content-type": "image/png" }
        })
      );
    mocks.createAsset.mockImplementation(async (args) => ({
      id: "asset-2",
      ...args
    }));

    const result = await caller().openverse.import({
      media_type: "images",
      ids: [IMAGE_ID, second]
    });

    expect(result.failed).toEqual([
      { id: IMAGE_ID, error: expect.stringContaining("HTTP 404") }
    ]);
    expect(result.assets).toHaveLength(1);
    expect(mocks.createAsset.mock.calls[0]?.[0]).toMatchObject({
      name: "Cat on a mat.png",
      parentId: "user-1"
    });
  });

  it("refuses a folder the user does not own", async () => {
    mocks.assetFind.mockResolvedValue(null);
    const fetchMock = api();

    await expect(
      caller().openverse.import({
        media_type: "images",
        ids: [IMAGE_ID],
        parent_id: "someone-elses"
      })
    ).rejects.toThrow("Folder not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
