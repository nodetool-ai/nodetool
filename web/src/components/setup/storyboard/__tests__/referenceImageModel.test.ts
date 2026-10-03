import { referenceImageModel } from "../referenceImageModel";
import type { ImageModel, ImageModelValue } from "../../../../stores/ApiTypes";

const value = (id: string, name = id): ImageModelValue => ({
  type: "image_model",
  id,
  provider: "atlascloud",
  name,
  path: ""
});

const listed = (id: string, name: string, tasks: string[]): ImageModel =>
  ({
    type: "image_model",
    id,
    name,
    provider: "atlascloud",
    supported_tasks: tasks
  }) as ImageModel;

const CATALOG = [
  listed("black-forest-labs/flux-2-flex/edit", "FLUX.2 Flex — Edit", [
    "image_to_image"
  ]),
  listed(
    "black-forest-labs/flux-2-flex/text-to-image",
    "FLUX.2 Flex — Text to Image",
    ["text_to_image"]
  ),
  listed("alibaba/qwen-image-3/edit", "Qwen Image 3 — Edit", ["image_to_image"])
];

describe("referenceImageModel", () => {
  it("keeps a model that creates images from text", () => {
    const selected = value("black-forest-labs/flux-2-flex/text-to-image");
    expect(referenceImageModel(selected, CATALOG)).toEqual({
      kind: "ready",
      model: selected
    });
  });

  it("uses the text-to-image variant of an editing-only model", () => {
    expect(
      referenceImageModel(value("black-forest-labs/flux-2-flex/edit"), CATALOG)
    ).toEqual({
      kind: "ready",
      model: value(
        "black-forest-labs/flux-2-flex/text-to-image",
        "FLUX.2 Flex — Text to Image"
      ),
      substituteFor: "FLUX.2 Flex — Edit"
    });
  });

  it("reports an editing-only model with no text-to-image variant", () => {
    expect(
      referenceImageModel(value("alibaba/qwen-image-3/edit"), CATALOG)
    ).toEqual({ kind: "edit_only", name: "Qwen Image 3 — Edit" });
  });

  it("leaves a model the catalog does not list to the provider", () => {
    const selected = value("unknown/model");
    expect(referenceImageModel(selected, [])).toEqual({
      kind: "ready",
      model: selected
    });
  });
});
