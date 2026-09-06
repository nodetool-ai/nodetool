/**
 * @jest-environment jsdom
 *
 * PRD § 10.7, criteria 1 and 2 — where the flow opens.
 *
 * A document resumes at the step its stage names, and a document with no
 * `setup` at all opens as the plain editor: the stage is persisted, never
 * inferred from what is on the canvas (D3).
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn(async () => ({ data: {} }))
}));

jest.mock("../../../../serverState/useStylePresets", () => ({
  useStylePresets: () => ({ data: [] })
}));
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] }),
  useSaveEntity: () => ({ mutateAsync: jest.fn() })
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [], isLoading: false })
}));

const createAsset = jest.fn(async (file: File) => ({
  id: "asset-upload",
  get_url: "https://example.test/asset-upload.png",
  name: file.name
}));
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: { getState: () => ({ createAsset }) }
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { ImageSetupOverlay } from "../ImageSetupOverlay";
import { useSketchStore } from "../../../sketch/state/useSketchStore";
import { createDefaultDocument } from "../../../sketch/types";
import type { SketchSetup } from "@nodetool-ai/protocol/api-schemas/sketch.js";

const renderOverlay = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ImageSetupOverlay />
    </ThemeProvider>
  );

/** A document as the server hands it back, with the stage the flow resumes at. */
const seed = (setup?: SketchSetup): void => {
  const document = createDefaultDocument(1024, 1024);
  if (setup) {
    document.setup = setup;
  }
  act(() => {
    useSketchStore.getState().setDocument(document);
  });
};

beforeEach(() => {
  createAsset.mockClear();
  seed();
});

describe("resume by stage (criterion 2)", () => {
  it("opens as the editor when the document has no setup", () => {
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("opens as the editor at stage done", () => {
    seed({ stage: "done", brief: "a dripper" });
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("resumes at the idea step", () => {
    seed({ stage: "idea", brief: "a dripper" });
    renderOverlay();
    expect(
      screen.getByRole("heading", { name: "What image do you want?" })
    ).toBeInTheDocument();
  });

  it("resumes at the use-case step", () => {
    seed({ stage: "useCase", brief: "a dripper" });
    renderOverlay();
    expect(
      screen.getByRole("heading", { name: "What is it for?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refine the brief" })
    ).toBeInTheDocument();
  });

  it("resumes at the review step with the refined fields", () => {
    seed({
      stage: "review",
      brief: "a dripper",
      use_case: "product",
      variations: 4,
      refined: {
        subject: "a ceramic pour-over dripper",
        composition: "centred on seamless white",
        lighting: "soft window light",
        style_words: "85mm",
        negative: "hands"
      }
    });
    renderOverlay();
    expect(screen.getByLabelText("Subject")).toHaveValue(
      "a ceramic pour-over dripper"
    );
    expect(
      screen.getByRole("button", { name: "Re-refine" })
    ).toBeInTheDocument();
  });

  it("resumes at the look step", () => {
    seed({ stage: "look", brief: "a dripper", use_case: "product" });
    renderOverlay();
    expect(
      screen.getByRole("heading", { name: "Choose the look" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate your image" })
    ).toBeInTheDocument();
  });
});

describe("use-case cards", () => {
  it("writes the use case, its variation count and its size", async () => {
    seed({ stage: "useCase", brief: "a dripper" });
    renderOverlay();
    await userEvent.click(
      screen.getByRole("button", { name: /Key art/ })
    );
    expect(useSketchStore.getState().document.setup).toMatchObject({
      use_case: "key-art",
      variations: 2
    });
    expect(useSketchStore.getState().document.canvas).toMatchObject({
      width: 683,
      height: 1024
    });
  });

  it("offers all seven", () => {
    seed({ stage: "useCase", brief: "a dripper" });
    renderOverlay();
    for (const title of [
      "Product shot",
      "Portrait",
      "Key art",
      "Social post",
      "Logo",
      "Concept art",
      "Texture"
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(title) })
      ).toBeInTheDocument();
    }
  });
});

describe("review step", () => {
  const reviewing: SketchSetup = {
    stage: "review",
    brief: "a dripper",
    use_case: "product",
    variations: 4,
    refined: {
      subject: "a ceramic pour-over dripper",
      composition: "centred",
      lighting: "soft",
      style_words: "85mm",
      negative: "hands"
    }
  };

  it("writes an edited field straight back onto the document", async () => {
    seed(reviewing);
    renderOverlay();
    const lighting = screen.getByLabelText("Lighting");
    await userEvent.clear(lighting);
    await userEvent.type(lighting, "hard");
    expect(
      useSketchStore.getState().document.setup?.refined?.lighting
    ).toBe("hard");
  });

  it("offers 1, 2 and 4 variations and records the pick", async () => {
    seed(reviewing);
    renderOverlay();
    const group = screen.getByRole("group", { name: "Variations" });
    expect(
      Array.from(group.querySelectorAll("[aria-pressed]")).length
    ).toBe(3);
    await userEvent.click(screen.getByText("2"));
    expect(useSketchStore.getState().document.setup?.variations).toBe(2);
  });
});

describe("step 1 alternatives (criterion 1)", () => {
  it("a blank canvas finishes the flow at stage done", async () => {
    seed({ stage: "idea", brief: "" });
    renderOverlay();
    await userEvent.click(
      screen.getByRole("button", { name: /Start with a blank canvas/ })
    );
    expect(useSketchStore.getState().document.setup?.stage).toBe("done");
  });

  it("an upload lands as the first layer and opens the editor", async () => {
    seed({ stage: "idea", brief: "" });
    renderOverlay();
    const file = new File(["bytes"], "reference.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload an image to edit");

    // jsdom decodes no pixels, so the natural size is measured off a stubbed
    // load — the flow only needs the number, not the bitmap.
    const original = Object.getOwnPropertyDescriptor(
      globalThis.Image.prototype,
      "src"
    );
    Object.defineProperty(globalThis.Image.prototype, "src", {
      configurable: true,
      set(this: HTMLImageElement) {
        Object.defineProperty(this, "naturalWidth", { value: 800 });
        Object.defineProperty(this, "naturalHeight", { value: 600 });
        setTimeout(() => this.onload?.(new Event("load")));
      }
    });
    globalThis.URL.createObjectURL = jest.fn(() => "blob:reference");
    globalThis.URL.revokeObjectURL = jest.fn();

    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(createAsset).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(useSketchStore.getState().document.setup?.stage).toBe("done");
    });
    const first = useSketchStore.getState().document.layers[0];
    expect(first.imageReference?.uri).toBe(
      "https://example.test/asset-upload.png"
    );
    expect(useSketchStore.getState().document.canvas).toMatchObject({
      width: 800,
      height: 600
    });

    if (original) {
      Object.defineProperty(globalThis.Image.prototype, "src", original);
    }
  });
});
