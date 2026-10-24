import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageSketchEditor from "../ImageSketchEditor";
import type { Asset } from "../../../stores/ApiTypes";

const save = jest.fn<Promise<boolean>, []>();

jest.mock("../../../hooks/sketch/useSaveSketchToAsset", () => ({
  useSaveSketchToAsset: () => ({ save, saving: false })
}));
jest.mock("../../sketch/StandaloneSketchEditor", () => ({
  __esModule: true,
  default: ({ headerActions }: { headerActions: React.ReactNode }) => (
    <div>{headerActions}</div>
  )
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (select: (s: { update: jest.Mock }) => unknown) =>
    select({ update: jest.fn() })
}));

const asset = {
  id: "a1",
  name: "Untitled.png",
  sketch_document_id: "doc1"
} as Asset;

beforeEach(() => {
  save.mockReset();
});

describe("ImageSketchEditor", () => {
  it("saves the strokes to the image from its one action", async () => {
    save.mockResolvedValue(true);
    render(<ImageSketchEditor asset={asset} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Save to image" })
    );

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("has no Done button, since View/Edit leaves the editor", () => {
    render(<ImageSketchEditor asset={asset} />);

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
