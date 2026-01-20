const mockRevokeObjectURL = jest.fn();
const mockCreateObjectURL = jest.fn(() => "blob:test-url");

describe("imageUtils", () => {
  beforeAll(() => {
    (global as any).URL = {
      revokeObjectURL: mockRevokeObjectURL,
      createObjectURL: mockCreateObjectURL,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createImageUrl", () => {
    it("returns empty url for null source", () => {
      const { createImageUrl } = require("../imageUtils");
      const result = createImageUrl(null, null);
      expect(result.url).toBe("");
      expect(result.blobUrl).toBeNull();
    });

    it("returns empty url for undefined source", () => {
      const { createImageUrl } = require("../imageUtils");
      const result = createImageUrl(undefined, null);
      expect(result.url).toBe("");
      expect(result.blobUrl).toBeNull();
    });

    it("revokes previous blob URL", () => {
      const { createImageUrl } = require("../imageUtils");
      const prevUrl = "blob:prev-url";
      createImageUrl(null, prevUrl);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(prevUrl);
    });

    it("does not revoke when previous blob is null", () => {
      const { createImageUrl } = require("../imageUtils");
      createImageUrl("data:image/png;base64,abc", null);
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });

    it("returns uri directly when provided", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = { uri: "https://example.com/image.png" };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("https://example.com/image.png");
      expect(result.blobUrl).toBeNull();
    });

    it("handles data URI directly", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = "data:image/png;base64,abc123";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/png;base64,abc123");
      expect(result.blobUrl).toBeNull();
    });

    it("handles blob URI directly", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = "blob:some-blob-url";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("blob:some-blob-url");
      expect(result.blobUrl).toBeNull();
    });

    it("handles http URI directly", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = "http://example.com/image.png";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("http://example.com/image.png");
      expect(result.blobUrl).toBeNull();
    });

    it("handles slash path directly", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = "/path/to/image.png";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("/path/to/image.png");
      expect(result.blobUrl).toBeNull();
    });

    it("converts plain base64 to data URI", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = "abc123";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/png;base64,abc123");
      expect(result.blobUrl).toBeNull();
    });

    it("creates blob URL for Uint8Array", () => {
      const { createImageUrl } = require("../imageUtils");
      const bytes = new Uint8Array([137, 80, 78, 71]);
      const result = createImageUrl(bytes, null);
      expect(result.url).toContain("blob:");
      expect(result.blobUrl).toBe(result.url);
    });

    it("creates blob URL for number array", () => {
      const { createImageUrl } = require("../imageUtils");
      const bytes = [137, 80, 78, 71];
      const result = createImageUrl(bytes, null);
      expect(result.url).toContain("blob:");
      expect(result.blobUrl).toBe(result.url);
    });

    it("handles empty ImageSource object", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = {};
      const result = createImageUrl(source, null);
      expect(result.url).toBe("");
      expect(result.blobUrl).toBeNull();
    });

    it("prefers uri over data in ImageSource", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = { uri: "https://example.com/img.png", data: "should-not-use" };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("https://example.com/img.png");
    });

    it("uses data when uri not provided in ImageSource", () => {
      const { createImageUrl } = require("../imageUtils");
      const source = { data: "base64data" };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/png;base64,base64data");
    });

    it("returns empty for unsupported data type", () => {
      const { createImageUrl } = require("../imageUtils");
      const result = createImageUrl(Symbol("invalid"), null);
      expect(result.url).toBe("");
      expect(result.blobUrl).toBeNull();
    });
  });
});
