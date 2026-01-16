/**
 * @jest-environment jsdom
 */
import { createImageUrl, ImageSource } from "../imageUtils";

describe("imageUtils", () => {
  describe("createImageUrl", () => {
    describe("null/undefined handling", () => {
      it("returns empty url for null source", () => {
        const result = createImageUrl(null, null);
        expect(result.url).toBe("");
        expect(result.blobUrl).toBeNull();
      });

      it("returns empty url for undefined source", () => {
        const result = createImageUrl(undefined, null);
        expect(result.url).toBe("");
        expect(result.blobUrl).toBeNull();
      });
    });

    describe("ImageSource object handling", () => {
      it("returns uri when provided", () => {
        const source: ImageSource = { uri: "https://example.com/image.png" };
        const result = createImageUrl(source, null);
        expect(result.url).toBe("https://example.com/image.png");
        expect(result.blobUrl).toBeNull();
      });

      it("returns empty url when only data is provided in object", () => {
        const source: ImageSource = { data: "base64data" };
        const result = createImageUrl(source, null);
        expect(result.url).toBe("data:image/png;base64,base64data");
        expect(result.blobUrl).toBeNull();
      });

      it("prefers uri over data", () => {
        const source: ImageSource = { 
          uri: "https://example.com/image.png",
          data: "base64data"
        };
        const result = createImageUrl(source, null);
        expect(result.url).toBe("https://example.com/image.png");
      });

      it("returns empty url when both uri and data are missing", () => {
        const source: ImageSource = {};
        const result = createImageUrl(source, null);
        expect(result.url).toBe("");
        expect(result.blobUrl).toBeNull();
      });

      it("handles ImageSource with null uri and valid data", () => {
        const source: ImageSource = { uri: undefined, data: "test" };
        const result = createImageUrl(source, null);
        expect(result.url).toBe("data:image/png;base64,test");
      });

      it("handles ImageSource with undefined data", () => {
        const source: ImageSource = { uri: "https://test.com/img.png", data: undefined };
        const result = createImageUrl(source, null);
        expect(result.url).toBe("https://test.com/img.png");
      });
    });

    describe("string data handling", () => {
      it("passes through data URIs", () => {
        const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const result = createImageUrl(dataUri, null);
        expect(result.url).toBe(dataUri);
      });

      it("passes through blob URLs", () => {
        const blobUrl = "blob:http://localhost:3000/12345678-1234-1234-1234-123456789abc";
        const result = createImageUrl(blobUrl, null);
        expect(result.url).toBe(blobUrl);
      });

      it("passes through http URLs", () => {
        const httpUrl = "http://example.com/image.png";
        const result = createImageUrl(httpUrl, null);
        expect(result.url).toBe(httpUrl);
      });

      it("passes through https URLs", () => {
        const httpsUrl = "https://example.com/image.png";
        const result = createImageUrl(httpsUrl, null);
        expect(result.url).toBe(httpsUrl);
      });

      it("converts plain base64 to data URI", () => {
        const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const result = createImageUrl(base64Data, null);
        expect(result.url).toBe(`data:image/png;base64,${base64Data}`);
      });

      it("handles empty string as empty url", () => {
        const result = createImageUrl("", null);
        expect(result.url).toBe("");
      });

      it("handles plain string without data prefix", () => {
        const result = createImageUrl("just-a-string", null);
        expect(result.url).toBe("data:image/png;base64,just-a-string");
      });
    });

    describe("edge cases", () => {
      it("handles raw values (not wrapped in ImageSource)", () => {
        const result = createImageUrl("plain-base64", null);
        expect(result.url).toBe("data:image/png;base64,plain-base64");
      });

      it("handles string starting with http", () => {
        const result = createImageUrl("http://example.com/test.png", null);
        expect(result.url).toBe("http://example.com/test.png");
      });

      it("handles string starting with https", () => {
        const result = createImageUrl("https://example.com/test.png", null);
        expect(result.url).toBe("https://example.com/test.png");
      });

      it("handles string starting with data:", () => {
        const result = createImageUrl("data:text/plain,hello", null);
        expect(result.url).toBe("data:text/plain,hello");
      });

      it("handles string starting with blob:", () => {
        const result = createImageUrl("blob:some-blob-id", null);
        expect(result.url).toBe("blob:some-blob-id");
      });

      it("handles previousBlobUrl parameter", () => {
        const result = createImageUrl("base64data", null);
        expect(result.url).toBe("data:image/png;base64,base64data");
      });
    });
  });
});
