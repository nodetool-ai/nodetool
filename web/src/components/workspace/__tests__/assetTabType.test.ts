/**
 * @jest-environment node
 */
import { assetTabType } from "../assetTabType";

describe("assetTabType", () => {
  describe("image assets", () => {
    it("returns 'image' for image content types", () => {
      expect(assetTabType({ content_type: "image/png" })).toBe("image");
      expect(assetTabType({ content_type: "image/jpeg" })).toBe("image");
      expect(assetTabType({ content_type: "image/webp" })).toBe("image");
    });
  });

  describe("svg assets", () => {
    it("returns 'svg' for the SVG content type", () => {
      expect(assetTabType({ content_type: "image/svg+xml" })).toBe("svg");
    });

    it("returns 'svg' for a .svg name whatever the content type", () => {
      // Saved without an explicit type, an SVG lands as text/plain or
      // octet-stream; the name is then the only thing that says vector.
      expect(assetTabType({ content_type: "text/plain", name: "logo.svg" })).toBe(
        "svg"
      );
      expect(
        assetTabType({ content_type: "application/octet-stream", name: "Logo.SVG" })
      ).toBe("svg");
    });

    it("wins over both the image and the text branch", () => {
      // Either would otherwise claim it: image/ by prefix, text by the xml
      // language mapping for the .svg extension.
      expect(assetTabType({ content_type: "image/svg+xml", name: "a.svg" })).not.toBe(
        "image"
      );
      expect(assetTabType({ content_type: "image/svg+xml", name: "a.svg" })).not.toBe(
        "text"
      );
    });
  });

  describe("audio assets", () => {
    it("returns 'audio' for audio content types", () => {
      expect(assetTabType({ content_type: "audio/mpeg" })).toBe("audio");
      expect(assetTabType({ content_type: "audio/wav" })).toBe("audio");
      expect(assetTabType({ content_type: "audio/ogg" })).toBe("audio");
    });
  });

  describe("3D model assets", () => {
    it("returns 'model3d' for model/ content types", () => {
      expect(assetTabType({ content_type: "model/gltf+json" })).toBe(
        "model3d"
      );
      expect(assetTabType({ content_type: "model/gltf-binary" })).toBe(
        "model3d"
      );
    });

    it("returns 'model3d' for 3D file extensions in the name", () => {
      expect(
        assetTabType({ content_type: "", name: "scene.glb" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "model.gltf" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "mesh.obj" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "char.fbx" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "part.stl" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "cloud.ply" })
      ).toBe("model3d");
      expect(
        assetTabType({ content_type: "", name: "scene.usdz" })
      ).toBe("model3d");
    });
  });

  describe("text assets", () => {
    it("returns 'text' for text content types", () => {
      expect(assetTabType({ content_type: "text/plain", name: "readme.txt" })).toBe("text");
    });
  });

  describe("null/undefined handling", () => {
    it("returns null when content_type is null or undefined", () => {
      expect(assetTabType({ content_type: null })).toBeNull();
      expect(assetTabType({ content_type: undefined })).toBeNull();
      expect(assetTabType({})).toBeNull();
    });

    it("returns null for unrecognized content types", () => {
      expect(assetTabType({ content_type: "video/mp4" })).toBeNull();
      expect(
        assetTabType({ content_type: "application/octet-stream" })
      ).toBeNull();
    });
  });
});
