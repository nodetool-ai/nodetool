import { createAssetFile, CreateAssetFileOptions } from "../createAssetFile";
import { Chunk } from "../stores/ApiTypes";

describe("createAssetFile", () => {
  const defaultOptions: CreateAssetFileOptions = {
    maxTextChars: 5000000,
  };

  describe("text handling", () => {
    it("creates a text file from string chunks", async () => {
      const chunks: Chunk[] = [
        { chunk: "Hello " },
        { chunk: "World" },
      ];
      
      const result = await createAssetFile(chunks, "text/plain", defaultOptions);
      
      expect(result.filename).toBe("output.txt");
      expect(result.type).toBe("text/plain");
      expect(result.file.name).toBe("output.txt");
      
      const text = await result.file.text();
      expect(text).toBe("Hello World");
    });

    it("truncates long text files", async () => {
      const longText = "a".repeat(10000);
      const chunks: Chunk[] = [{ chunk: longText }];
      
      const result = await createAssetFile(chunks, "text/plain", { maxTextChars: 1000 });
      
      const text = await result.file.text();
      expect(text.length).toBe(1000 + "\n… (truncated)".length);
      expect(text.endsWith("\n… (truncated)")).toBe(true);
    });

    it("handles empty chunks", async () => {
      const chunks: Chunk[] = [];
      
      const result = await createAssetFile(chunks, "text/plain", defaultOptions);
      
      const text = await result.file.text();
      expect(text).toBe("");
    });
  });

  describe("JSON handling", () => {
    it("creates a JSON file", async () => {
      const chunks: Chunk[] = [
        { chunk: '{"key": ' },
        { chunk: '"value"' },
        { chunk: "}" },
      ];
      
      const result = await createAssetFile(chunks, "application/json", defaultOptions);
      
      expect(result.filename).toBe("output.json");
      expect(result.type).toBe("application/json");
      
      const text = await result.file.text();
      expect(text).toBe('{"key": "value"}');
    });
  });

  describe("MIME type mapping", () => {
    it("maps image MIME types to extensions", async () => {
      const chunks: Chunk[] = [{ chunk: "" }];
      
      const pngResult = await createAssetFile(chunks, "image/png", defaultOptions);
      expect(pngResult.filename).toMatch(/\.png$/);
      
      const jpgResult = await createAssetFile(chunks, "image/jpeg", defaultOptions);
      expect(jpgResult.filename).toMatch(/\.jpg$/);
      
      const webpResult = await createAssetFile(chunks, "image/webp", defaultOptions);
      expect(webpResult.filename).toMatch(/\.webp$/);
    });

    it("maps audio MIME types to extensions", async () => {
      const chunks: Chunk[] = [{ chunk: "" }];
      
      const mp3Result = await createAssetFile(chunks, "audio/mpeg", defaultOptions);
      expect(mp3Result.filename).toMatch(/\.mp3$/);
      
      const wavResult = await createAssetFile(chunks, "audio/wav", defaultOptions);
      expect(wavResult.filename).toMatch(/\.wav$/);
    });
  });

  describe("filename generation", () => {
    it("generates sequential filenames", async () => {
      const chunks: Chunk[] = [{ chunk: "" }];
      
      const result1 = await createAssetFile(chunks, "text/plain", defaultOptions);
      const result2 = await createAssetFile(chunks, "text/plain", defaultOptions);
      
      expect(result1.filename).toBe("output.txt");
      expect(result2.filename).toBe("output_1.txt");
    });
  });
});
