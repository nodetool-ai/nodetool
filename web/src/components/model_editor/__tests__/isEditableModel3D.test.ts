import { isEditableModel3DAsset } from "../isEditableModel3D";
import type { Asset } from "../../../stores/ApiTypes";

const makeAsset = (overrides: Partial<Asset>): Asset =>
  ({
    id: "a1",
    name: "model",
    content_type: "",
    get_url: null,
    ...overrides
  } as Asset);

describe("isEditableModel3DAsset", () => {
  it("matches gltf-binary content type", () => {
    expect(
      isEditableModel3DAsset(makeAsset({ content_type: "model/gltf-binary" }))
    ).toBe(true);
  });

  it("matches gltf+json content type", () => {
    expect(
      isEditableModel3DAsset(makeAsset({ content_type: "model/gltf+json" }))
    ).toBe(true);
  });

  it("matches by name extension", () => {
    expect(isEditableModel3DAsset(makeAsset({ name: "robot.glb" }))).toBe(true);
    expect(isEditableModel3DAsset(makeAsset({ name: "robot.gltf" }))).toBe(true);
  });

  it("matches by get_url extension when name and content type are generic", () => {
    expect(
      isEditableModel3DAsset(
        makeAsset({
          name: "robot",
          content_type: "application/octet-stream",
          get_url: "/api/assets/abc/download?token=xyz"
        })
      )
    ).toBe(false);
    expect(
      isEditableModel3DAsset(
        makeAsset({
          name: "robot",
          content_type: "application/octet-stream",
          get_url: "/api/assets/abc.glb?token=xyz"
        })
      )
    ).toBe(true);
  });

  it("does not match non-editable 3D formats", () => {
    expect(
      isEditableModel3DAsset(makeAsset({ name: "scene.obj", content_type: "model/obj" }))
    ).toBe(false);
    expect(isEditableModel3DAsset(makeAsset({ name: "scene.stl" }))).toBe(false);
  });

  it("does not match images or plain binaries", () => {
    expect(
      isEditableModel3DAsset(makeAsset({ name: "photo.png", content_type: "image/png" }))
    ).toBe(false);
    expect(
      isEditableModel3DAsset(
        makeAsset({ name: "data.bin", content_type: "application/octet-stream" })
      )
    ).toBe(false);
  });
});
