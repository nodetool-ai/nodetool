import { createAssetFile } from "../createAssetFile";

describe("createAssetFile", () => {
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
});
