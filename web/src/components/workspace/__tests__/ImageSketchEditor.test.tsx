import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("saves the strokes to the image before Done leaves the editor", async () => {
    save.mockResolvedValue(true);
    const onClose = jest.fn();
    render(<ImageSketchEditor asset={asset} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays in the editor when the save fails", async () => {
    save.mockResolvedValue(false);
    const onClose = jest.fn();
    render(<ImageSketchEditor asset={asset} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });
});
