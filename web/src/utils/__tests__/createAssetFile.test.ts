import { createAssetFile } from "../createAssetFile";

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

  describe("binary data handling", () => {
    it("handles Uint8Array input directly", async () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const [result] = await createAssetFile(
        { type: "image", data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles ArrayBuffer input", async () => {
      const buffer = new ArrayBuffer(8);
      const [result] = await createAssetFile(
        { type: "audio", data: buffer },
        "test"
      );
      expect(result.filename).toBe("preview_test.mp3");
    });

    it("handles DataView input", async () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      const [result] = await createAssetFile(
        { type: "video", data: view },
        "test"
      );
      expect(result.filename).toBe("preview_test.mp4");
    });

    it("handles string base64 data", async () => {
      const base64 = btoa("Hello World");
      const [result] = await createAssetFile(
        { type: "image", data: base64 },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles data URI format", async () => {
      const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const [result] = await createAssetFile(
        { type: "image", data: dataUri },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles array of numbers as binary data", async () => {
      const data = [255, 216, 255, 224];
      const [result] = await createAssetFile(
        { type: "image", data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles object with data property", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const [result] = await createAssetFile(
        { type: "image", data: { data } },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles object with content property", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const [result] = await createAssetFile(
        { type: "image", content: data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles plain object as binary", async () => {
      const data = { 0: 1, 1: 2, 2: 3 };
      const [result] = await createAssetFile(
        { type: "image", data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });
  });

  describe("object and array output types", () => {
    it("creates JSON file for object type", async () => {
      const data = { key: "value", nested: { a: 1 } };
      const [result] = await createAssetFile(
        { type: "object", data },
        "test"
      );
      expect(result.filename).toBe("preview_test.json");
      expect(result.type).toBe("application/json");
      const textContent = await readFileAsText(result.file);
      expect(textContent).toContain('"key": "value"');
    });

    it("creates JSON file for array type", async () => {
      const data = [1, 2, 3, 4, 5];
      const [result] = await createAssetFile(
        { type: "array", data },
        "test"
      );
      expect(result.filename).toBe("preview_test.json");
      expect(result.type).toBe("application/json");
    });

    it("handles mixed chunk types in array", async () => {
      const chunks = [
        { type: "chunk", content_type: "text", content: "hello" },
        { type: "chunk", content_type: "image", content: "data:image/png;base64,abc" }
      ];
      const results = await createAssetFile(chunks, "mixed");
      expect(results).toHaveLength(2);
      expect(results[0].filename).toBe("preview_mixed_0.txt");
      expect(results[1].filename).toBe("preview_mixed_1.png");
    });
  });

  describe("text output handling", () => {
    it("creates text file for text type with string data", async () => {
      const [result] = await createAssetFile(
        { type: "text", data: "Hello World" },
        "test"
      );
      expect(result.filename).toBe("preview_test.txt");
      expect(result.type).toBe("text/plain");
      const textContent = await readFileAsText(result.file);
      expect(textContent).toBe("Hello World");
    });

    it("stringifies non-string data for text type", async () => {
      const data = { foo: "bar" };
      const [result] = await createAssetFile(
        { type: "text", data },
        "test"
      );
      expect(result.type).toBe("text/plain");
      const textContent = await readFileAsText(result.file);
      expect(textContent).toContain('"foo": "bar"');
    });
  });

  describe("output data extraction", () => {
    it("extracts data from output.value", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const [result] = await createAssetFile(
        { type: "image", value: data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("extracts data from output.content", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const [result] = await createAssetFile(
        { type: "image", content: data },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });
  });

  describe("empty and null data handling", () => {
    it("handles null data", async () => {
      const [result] = await createAssetFile(
        { type: "text", data: null },
        "test"
      );
      expect(result.filename).toBe("preview_test.txt");
    });

    it("handles undefined data", async () => {
      const [result] = await createAssetFile(
        { type: "text", data: undefined },
        "test"
      );
      expect(result.filename).toBe("preview_test.txt");
    });

    it("handles empty string data", async () => {
      const [result] = await createAssetFile(
        { type: "text", data: "" },
        "test"
      );
      expect(result.filename).toBe("preview_test.txt");
    });

    it("handles empty Uint8Array", async () => {
      const [result] = await createAssetFile(
        { type: "image", data: new Uint8Array() },
        "test"
      );
      expect(result.filename).toBe("preview_test.png");
    });

    it("handles empty array data", async () => {
      const [result] = await createAssetFile(
        { type: "array", data: [] },
        "test"
      );
      expect(result.filename).toBe("preview_test.json");
    });
  });

  describe("streaming chunks", () => {
    it("handles empty chunks array by returning empty array", async () => {
      const chunks: any[] = [];
      const results = await createAssetFile(chunks, "stream");
      expect(results).toHaveLength(0);
    });

    it("handles chunks with non-text content", async () => {
      const chunks = [
        { type: "chunk", content_type: "image", content: "data:image/png;base64,abc" }
      ];
      const results = await createAssetFile(chunks, "stream");
      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe("preview_stream_0.png");
    });

    it("handles chunks with mixed content types", async () => {
      const chunks = [
        { type: "chunk", content_type: "text", content: "Hello" },
        { type: "chunk", content_type: "audio", content: "data:audio/wav;base64,abc" }
      ];
      const results = await createAssetFile(chunks, "stream");
      expect(results).toHaveLength(2);
    });

    it("handles chunk with missing content", async () => {
      const chunks = [
        { type: "chunk", content_type: "text" }
      ];
      const [result] = await createAssetFile(chunks, "stream");
      expect(result.filename).toBe("preview_stream.txt");
    });
  });
});
