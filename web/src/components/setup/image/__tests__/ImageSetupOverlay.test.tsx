jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: { create: jest.Mock }) => unknown) =>
    selector({ create: jest.fn() })
}));
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
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
// The look step reads the whole query result, not just the models, so the
// mock answers with every field the four availability states are read from.
const mockImageModels: Array<{
  type: string;
  id: string;
  name: string;
  provider: string;
}> = [];
const mockProviders: string[] = [];
const mockRefetchModels = jest.fn(async () => {});
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => ({ models: [] }),
  useImageModelsByProvider: () => ({
    models: mockImageModels,
    providers: mockProviders,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockRefetchModels
  })
}));

jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange
  }: {
    open: boolean;
    onModelChange: (model: {
      id: string;
      provider: string;
      name: string;
    }) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onModelChange({
            id: "brief-model",
            provider: "openai",
            name: "Brief model"
          })
        }
      >
        Choose brief model
      </button>
    ) : null
}));

jest.mock("../../../model_menu/ImageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange,
    task
  }: {
    open: boolean;
    onModelChange: (model: {
      id: string;
      provider: string;
      name: string;
    }) => void;
    task: string;
  }) =>
    open ? (
      <button
        onClick={() =>
          onModelChange({
            id: "model-1",
            provider: "prov",
            name: "Model One"
          })
        }
      >
        Choose {task} model
      </button>
    ) : null
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
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { rpcRequest } from "../../../../lib/websocket/rpcRequest";

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

const setModels = (
  models: Array<{ type: string; id: string; name: string; provider: string }>
): void => {
  mockImageModels.splice(0, mockImageModels.length, ...models);
  mockProviders.splice(
    0,
    mockProviders.length,
    ...new Set(models.map((model) => model.provider))
  );
};

beforeEach(() => {
  createAsset.mockClear();
  mockRefetchModels.mockClear();
  setModels([]);
  seed();
});

describe("resume by stage (criterion 2)", () => {
  it.each(["idea", "useCase", "review"] as const)(
    "offers a language model picker at %s and uses the choice for refinement",
    async (stage) => {
      useGlobalChatStore.setState({ selectedModel: undefined });
      seed({ stage, brief: "a dripper", use_case: "product" });
      renderOverlay();
      await userEvent.click(
        screen.getByRole("button", { name: /Select language model/ })
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Choose brief model" })
      );
      expect(useGlobalChatStore.getState().selectedModel?.id).toBe(
        "brief-model"
      );
      if (stage === "idea") {
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));
      }
      jest.mocked(rpcRequest).mockClear();
      await userEvent.click(
        screen.getByRole("button", {
          name: stage === "review" ? "Re-refine" : "Refine the brief"
        })
      );
      await waitFor(() =>
        expect(rpcRequest).toHaveBeenCalledWith(
          "generate_text",
          expect.objectContaining({ model: "brief-model", provider: "openai" })
        )
      );
    }
  );
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

// The use case is one choice out of seven, so the cards are radios in a named
// radio group, not buttons — `OptionCardGrid` reads that off `selectedId`.
describe("use-case cards", () => {
  it("writes the use case, its variation count and its size", async () => {
    seed({ stage: "useCase", brief: "a dripper" });
    renderOverlay();
    await userEvent.click(screen.getByRole("radio", { name: /Key art/ }));
    expect(useSketchStore.getState().document.setup).toMatchObject({
      use_case: "key-art",
      variations: 2
    });
    expect(useSketchStore.getState().document.canvas).toMatchObject({
      width: 683,
      height: 1024
    });
    // The pick is visible as a pick, not only as a document write.
    expect(screen.getByRole("radio", { name: /Key art/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("offers all seven in one radio group", () => {
    seed({ stage: "useCase", brief: "a dripper" });
    renderOverlay();
    const group = screen.getByRole("radiogroup", { name: "Use case" });
    expect(group).toBeInTheDocument();
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
        screen.getByRole("radio", { name: new RegExp(title) })
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
    expect(useSketchStore.getState().document.setup?.refined?.lighting).toBe(
      "hard"
    );
  });

  // The count is one choice of three, so the row is a radio group and the
  // chosen count is checked — not three independent toggles (F26).
  it("offers 1, 2 and 4 variations as one radio group and records the pick", async () => {
    seed(reviewing);
    renderOverlay();
    const group = screen.getByRole("radiogroup", { name: "Variations" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: "4" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await userEvent.click(within(group).getByRole("radio", { name: "2" }));
    expect(useSketchStore.getState().document.setup?.variations).toBe(2);
    expect(within(group).getByRole("radio", { name: "2" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(within(group).getByRole("radio", { name: "4" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
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

/**
 * F14 — the model list is a query with four answers, and the step says which
 * one it got instead of showing an empty grid under a dead button.
 * F28 — "No style" is a choice, so it is a tile that can look chosen.
 */
describe("look step", () => {
  const atLook = (): void => {
    seed({ stage: "look", brief: "a dripper", use_case: "product" });
  };

  it("explains an unconnected provider instead of showing an empty grid", () => {
    atLook();
    renderOverlay();
    expect(
      screen.getByText(/No image provider is connected/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate your image" })
    ).toBeDisabled();
  });

  it("offers No style as a selectable option and records it", async () => {
    atLook();
    setModels([
      {
        type: "image_model",
        id: "model-1",
        name: "Model One",
        provider: "prov"
      }
    ]);
    renderOverlay();

    const noStyle = screen.getByRole("radio", { name: /No style/ });
    await userEvent.click(noStyle);
    expect(useSketchStore.getState().document.setup).toMatchObject({
      style_entity_id: "no-style"
    });
    expect(screen.getByRole("radio", { name: /No style/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("persists the model choice on the document", async () => {
    atLook();
    setModels([
      {
        type: "image_model",
        id: "model-1",
        name: "Model One",
        provider: "prov"
      }
    ]);
    renderOverlay();

    expect(
      screen.queryByRole("radiogroup", { name: "Image model" })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Select Image Model" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Choose text_to_image model" })
    );
    expect(
      screen.getByRole("button", { name: "Model One" })
    ).toBeInTheDocument();
    expect(useSketchStore.getState().document.setup).toMatchObject({
      image_provider: "prov",
      image_model: "model-1"
    });
    expect(
      screen.getByRole("button", { name: "Generate your image" })
    ).toBeEnabled();
  });
});

/**
 * F4 — the composer's reference images and entities travel on the document,
 * and step 1 shows them, so the creator does not attach the same picture
 * twice.
 */
describe("context carried from the composer", () => {
  it("shows the attached references on the idea step", () => {
    seed({
      stage: "idea",
      brief: "a dripper",
      references: [
        {
          uri: "data:image/png;base64,AAA",
          name: "counter.png",
          type: "image/png"
        }
      ],
      entity_ids: ["entity-1"]
    });
    renderOverlay();

    expect(
      screen.getByRole("heading", { name: "Came with your prompt" })
    ).toBeInTheDocument();
    expect(screen.getByAltText("counter.png")).toBeInTheDocument();
  });

  it("says nothing when the composer carried nothing", () => {
    seed({ stage: "idea", brief: "a dripper" });
    renderOverlay();
    expect(
      screen.queryByRole("heading", { name: "Came with your prompt" })
    ).not.toBeInTheDocument();
  });
});
