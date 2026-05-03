import { describe, it, expect } from "@jest/globals";
import { resolveAssetUri, getMimeTypeFromUri } from "../hooks";

// BASE_URL is auto-mocked to "http://localhost:7777" by the Jest moduleNameMapper

describe("output/hooks", () => {
  describe("resolveAssetUri", () => {
    it("returns empty string for undefined", () => {
      expect(resolveAssetUri(undefined)).toBe("");
    });

    it("returns empty string for null", () => {
      expect(resolveAssetUri(null)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(resolveAssetUri("")).toBe("");
    });

    it("converts asset:// URIs to the API storage URL", () => {
      expect(resolveAssetUri("asset://abc123")).toBe(
        "http://localhost:7777/api/storage/abc123"
      );
    });

    it("converts asset:// URIs with sub-paths", () => {
      expect(resolveAssetUri("asset://user-1/image.png")).toBe(
        "http://localhost:7777/api/storage/user-1/image.png"
      );
    });

    it("prepends BASE_URL to /api/storage/ relative paths", () => {
      expect(resolveAssetUri("/api/storage/my-asset-id")).toBe(
        "http://localhost:7777/api/storage/my-asset-id"
      );
    });

    it("passes through absolute http URLs unchanged", () => {
      expect(resolveAssetUri("http://example.com/image.jpg")).toBe(
        "http://example.com/image.jpg"
      );
    });

    it("passes through absolute https URLs unchanged", () => {
      expect(resolveAssetUri("https://cdn.example.com/photo.png")).toBe(
        "https://cdn.example.com/photo.png"
      );
    });

    it("passes through blob URLs unchanged", () => {
      const blobUrl = "blob:http://localhost/some-uuid";
      expect(resolveAssetUri(blobUrl)).toBe(blobUrl);
    });
  });

  describe("getMimeTypeFromUri", () => {
    it("returns undefined for undefined", () => {
      expect(getMimeTypeFromUri(undefined)).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(getMimeTypeFromUri(null)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(getMimeTypeFromUri("")).toBeUndefined();
    });

    describe("image types", () => {
      it("returns image/png for .png", () => {
        expect(getMimeTypeFromUri("photo.png")).toBe("image/png");
      });

      it("returns image/jpeg for .jpg", () => {
        expect(getMimeTypeFromUri("photo.jpg")).toBe("image/jpeg");
      });

      it("returns image/jpeg for .jpeg", () => {
        expect(getMimeTypeFromUri("photo.jpeg")).toBe("image/jpeg");
      });

      it("returns image/gif for .gif", () => {
        expect(getMimeTypeFromUri("anim.gif")).toBe("image/gif");
      });

      it("returns image/webp for .webp", () => {
        expect(getMimeTypeFromUri("photo.webp")).toBe("image/webp");
      });

      it("returns image/svg+xml for .svg", () => {
        expect(getMimeTypeFromUri("icon.svg")).toBe("image/svg+xml");
      });
    });

    describe("audio types", () => {
      it("returns audio/mp3 for .mp3", () => {
        expect(getMimeTypeFromUri("track.mp3")).toBe("audio/mp3");
      });

      it("returns audio/wav for .wav", () => {
        expect(getMimeTypeFromUri("sound.wav")).toBe("audio/wav");
      });

      it("returns audio/ogg for .ogg", () => {
        expect(getMimeTypeFromUri("audio.ogg")).toBe("audio/ogg");
      });

      it("returns audio/flac for .flac", () => {
        expect(getMimeTypeFromUri("lossless.flac")).toBe("audio/flac");
      });
    });

    describe("video types", () => {
      it("returns video/mp4 for .mp4", () => {
        expect(getMimeTypeFromUri("video.mp4")).toBe("video/mp4");
      });

      it("returns video/webm for .webm", () => {
        expect(getMimeTypeFromUri("video.webm")).toBe("video/webm");
      });

      it("returns video/quicktime for .mov", () => {
        expect(getMimeTypeFromUri("clip.mov")).toBe("video/quicktime");
      });

      it("returns video/x-msvideo for .avi", () => {
        expect(getMimeTypeFromUri("video.avi")).toBe("video/x-msvideo");
      });
    });

    describe("3D model types", () => {
      it("returns model/gltf-binary for .glb", () => {
        expect(getMimeTypeFromUri("model.glb")).toBe("model/gltf-binary");
      });

      it("returns model/gltf+json for .gltf", () => {
        expect(getMimeTypeFromUri("model.gltf")).toBe("model/gltf+json");
      });
    });

    describe("document types", () => {
      it("returns application/pdf for .pdf", () => {
        expect(getMimeTypeFromUri("document.pdf")).toBe("application/pdf");
      });

      it("returns application/json for .json", () => {
        expect(getMimeTypeFromUri("data.json")).toBe("application/json");
      });
    });

    describe("unknown extensions", () => {
      it("returns undefined for an unrecognised extension", () => {
        expect(getMimeTypeFromUri("file.xyz")).toBeUndefined();
      });

      it("returns undefined when there is no extension", () => {
        expect(getMimeTypeFromUri("no-extension")).toBeUndefined();
      });
    });

    describe("URLs with query parameters", () => {
      it("strips query params before checking extension", () => {
        expect(getMimeTypeFromUri("image.png?width=100&height=200")).toBe(
          "image/png"
        );
      });
    });

    describe("case handling", () => {
      it("handles lowercase extensions (normalises to lower)", () => {
        expect(getMimeTypeFromUri("IMAGE.PNG")).toBe("image/png");
      });
    });
  });
});
