import { createImageUrl, ImageSource, ImageData } from "../imageUtils";

const mockBlobUrls: string[] = [];

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  (URL as any).createObjectURL = jest.fn((_blob: Blob) => {
    const url = `blob:mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mockBlobUrls.push(url);
    return url;
  });
  (URL as any).revokeObjectURL = jest.fn((url: string) => {
    const index = mockBlobUrls.indexOf(url);
    if (index > -1) {
      mockBlobUrls.splice(index, 1);
    }
  });
});

afterAll(() => {
  (URL as any).createObjectURL = originalCreateObjectURL;
  (URL as any).revokeObjectURL = originalRevokeObjectURL;
  mockBlobUrls.forEach((url) => URL.revokeObjectURL(url));
});

describe("imageUtils", () => {
  describe("createImageUrl", () => {
    beforeEach(() => {
      mockBlobUrls.length = 0;
    });

    afterAll(() => {
      mockBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    });

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

    it("handles ImageSource with uri", () => {
      const source: ImageSource = { uri: "https://example.com/image.png" };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("https://example.com/image.png");
      expect(result.blobUrl).toBeNull();
    });

    it("handles ImageSource with data", () => {
      const source: ImageSource = { data: "base64data" };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/png;base64,base64data");
      expect(result.blobUrl).toBeNull();
    });

    it("handles raw data URI string", () => {
      const source: ImageData = "data:image/jpeg;base64,abc123";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/jpeg;base64,abc123");
      expect(result.blobUrl).toBeNull();
    });

    it("handles raw blob URI string", () => {
      const source: ImageData = "blob:http://example.com/uuid";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("blob:http://example.com/uuid");
      expect(result.blobUrl).toBeNull();
    });

    it("handles raw http URI string", () => {
      const source: ImageData = "http://example.com/image.png";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("http://example.com/image.png");
      expect(result.blobUrl).toBeNull();
    });

    it("converts plain base64 string to data URI", () => {
      const source: ImageData = "abc123";
      const result = createImageUrl(source, null);
      expect(result.url).toBe("data:image/png;base64,abc123");
      expect(result.blobUrl).toBeNull();
    });

    it("converts Uint8Array to blob URL", () => {
      const source: ImageData = new Uint8Array([137, 80, 78, 71, 13, 10]);
      const result = createImageUrl(source, null);
      expect(result.url).toContain("blob:");
      expect(result.blobUrl).toContain("blob:");
    });

    it("converts number array to blob URL", () => {
      const source: ImageData = [137, 80, 78, 71, 13, 10];
      const result = createImageUrl(source, null);
      expect(result.url).toContain("blob:");
      expect(result.blobUrl).toContain("blob:");
    });

    it("revokes previous blob URL when new one is created", () => {
      const source1: ImageData = new Uint8Array([1, 2, 3]);
      const result1 = createImageUrl(source1, null);
      expect(result1.blobUrl).toContain("blob:");
      const blobUrl = result1.blobUrl;

      const source2: ImageData = new Uint8Array([4, 5, 6]);
      const result2 = createImageUrl(source2, blobUrl);
      expect(result2.blobUrl).toContain("blob:");
      expect(result2.blobUrl).not.toBe(blobUrl);
    });

    it("handles empty ImageSource object", () => {
      const source: ImageSource = {};
      const result = createImageUrl(source, null);
      expect(result.url).toBe("");
      expect(result.blobUrl).toBeNull();
    });

    it("prefers uri over data in ImageSource", () => {
      const source: ImageSource = {
        uri: "https://example.com/image.png",
        data: "base64data"
      };
      const result = createImageUrl(source, null);
      expect(result.url).toBe("https://example.com/image.png");
      expect(result.blobUrl).toBeNull();
    });
  });
});
