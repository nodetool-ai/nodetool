import { modelMatchesTask } from "../modelTaskMatching";

describe("modelMatchesTask", () => {
  it("lets a model without declared tasks into basic generation", () => {
    expect(modelMatchesTask(undefined, "image_to_image")).toBe(true);
  });

  it("keeps a model without declared tasks out of image_edit", () => {
    expect(modelMatchesTask(undefined, "image_edit")).toBe(false);
    expect(modelMatchesTask([], "image_edit")).toBe(false);
  });

  it("matches image_edit only when the server tagged the model", () => {
    expect(
      modelMatchesTask(["text_to_image", "image_to_image"], "image_edit")
    ).toBe(false);
    expect(
      modelMatchesTask(
        ["text_to_image", "image_to_image", "image_edit"],
        "image_edit"
      )
    ).toBe(true);
  });
});
