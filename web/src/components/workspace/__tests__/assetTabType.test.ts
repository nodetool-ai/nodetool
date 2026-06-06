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
      expect(assetTabType({ content_type: "image/svg+xml" })).toBe("image");
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
