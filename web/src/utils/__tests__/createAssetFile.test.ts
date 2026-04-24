import { createAssetFile } from "../createAssetFile";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      get: { query: jest.fn() }
    }
  }
}));

import { trpcClient } from "../../trpc/client";
const assetGetQuery = trpcClient.assets.get.query as jest.Mock;

const readFileAsText = async (file: File): Promise<string> => {
  if (typeof file.text === "function") {
    return file.text();
  }
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

describe("createAssetFile", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn();
  });

  it("creates a file for single image output", async () => {
    const data = { 0: 1, 1: 2, 2: 3, 3: 4 };
    const [result] = await createAssetFile({ type: "image", data }, "abc");

    expect(result.filename).toBe("preview_abc.png");
    expect(result.type).toBe("image/png");
    expect(result.file.name).toBe("preview_abc.png");
    expect(result.file.type).toBe("image/png");
    expect(result.file).toBeInstanceOf(File);
  });

  it("creates multiple files when given an array of outputs", async () => {
    const outputs = [
      { type: "text", data: "hello" },
      { type: "audio", data: { 0: 1, 1: 2 } }
    ];

    const results = await createAssetFile(outputs, "id");
    expect(results).toHaveLength(2);
    expect(results[0].filename).toBe("preview_id_0.txt");
    expect(results[1].filename).toBe("preview_id_1.mp3");
  });

  it("flattens streaming text chunks into a single file", async () => {
    const chunks = [
      { type: "chunk", content_type: "text", content: "hello " },
      { type: "chunk", content_type: "text", content: "world" }
    ];

    const [result] = await createAssetFile(chunks, "stream");
    expect(result.filename).toBe("preview_stream.txt");
    expect(result.type).toBe("text/plain");
    const textContent = await readFileAsText(result.file);
    expect(textContent).toBe("hello world");
  });

  it("truncates large streaming text chunks when maxTextChars is set", async () => {
    const chunks = [
      { type: "chunk", content_type: "text", content: "hello " },
      { type: "chunk", content_type: "text", content: "world" }
    ];

    const [result] = await createAssetFile(chunks, "stream", { maxTextChars: 5 });
    const textContent = await readFileAsText(result.file);
    expect(textContent).toBe("hello\n… (truncated)");
  });

  it("converts dataframes to CSV files", async () => {
    const output = {
      type: "dataframe",
      data: {
        columns: [{ name: "a" }, { name: "b" }],
        data: [
          [1, 2],
          [3, 4]
        ]
      }
    };
    const [result] = await createAssetFile(output, "table");
    expect(result.filename).toBe("preview_table.csv");
    expect(result.type).toBe("text/csv");
    expect(result.file.name).toBe("preview_table.csv");
  });

  it("handles unknown types as plain text", async () => {
    const output = { foo: "bar" } as any;
    const [result] = await createAssetFile(output, "test");
    expect(result.filename).toBe("preview_test.txt");
    expect(result.type).toBe("text/plain");
  });

  it("handles missing binary payloads gracefully", async () => {
    const [result] = await createAssetFile({ type: "image" }, "img");
    expect(result.filename).toBe("preview_img.png");
    expect(result.type).toBe("image/png");
  });

  it("preserves mime types and filenames when provided", async () => {
    const [result] = await createAssetFile(
      {
        type: "image",
        mime_type: "image/webp",
        filename: "photo.webp",
        data: new Uint8Array([1, 2, 3])
      },
      "node"
    );
    expect(result.filename).toBe("photo.webp");
    expect(result.type).toBe("image/webp");
  });

  it("appends suffix to provided filenames for arrays", async () => {
    const outputs = [
      { type: "text", filename: "note.txt", data: "a" },
      { type: "text", filename: "note.txt", data: "b" }
    ];
    const files = await createAssetFile(outputs, "node");
    expect(files[0].filename).toBe("note.txt");
    expect(files[1].filename).toBe("note_1.txt");
  });

  it("fetches image via storage URI when data is a non-binary wrapper (ExtData-like)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10]).buffer
    });

    // Simulate `@msgpack/msgpack`'s ExtData with a placeholder payload.
    class ExtData {
      type: number;
      data: Uint8Array;
      constructor(type: number, data: Uint8Array) {
        this.type = type;
        this.data = data;
      }
    }
    const ext = new ExtData(17, new Uint8Array([0]));

    const [result] = await createAssetFile(
      {
        type: "image",
        uri: "/api/storage/temp/abc.png",
        data: ext as unknown as Uint8Array,
        mimeType: "image/png",
        width: 1672,
        height: 1024
      } as any,
      "node"
    );

    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain("/api/storage/temp/abc.png");
    expect(result.file.size).toBe(6);
    expect(result.type).toBe("image/png");
  });

  it("uses inline ExtData.data Uint8Array when it actually contains real bytes", async () => {
    class ExtData {
      type: number;
      data: Uint8Array;
      constructor(type: number, data: Uint8Array) {
        this.type = type;
        this.data = data;
      }
    }
    const realBytes = new Uint8Array(64).fill(7);
    const ext = new ExtData(17, realBytes);

    const [result] = await createAssetFile(
      { type: "image", data: ext as unknown as Uint8Array, mimeType: "image/png" } as any,
      "node"
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.file.size).toBe(64);
  });

  it("fetches image from asset:// when asset_id is absent (URI-only image ref)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer
    });

    const [result] = await createAssetFile(
      {
        type: "image",
        uri: "asset://abc123.png"
      },
      "node"
    );

    expect(assetGetQuery).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain("/api/storage/");
    expect(fetchUrl).toContain("abc123.png");
    expect(result.file.size).toBe(4);
  });

  it("resolves asset refs through asset metadata instead of fetching asset:// directly", async () => {
    assetGetQuery.mockResolvedValueOnce({
      id: "asset-1",
      name: "fal-video.mp4",
      get_url: "/api/storage/asset-1.mp4"
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    });

    const [result] = await createAssetFile(
      {
        type: "video",
        uri: "asset://asset-1.mp4",
        asset_id: "asset-1"
      },
      "node"
    );

    expect(assetGetQuery).toHaveBeenCalledWith({ id: "asset-1" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/storage/asset-1.mp4"),
      expect.objectContaining({ mode: "cors" })
    );
    expect(result.filename).toBe("fal-video.mp4");
    expect(result.file.size).toBe(3);
  });
});
