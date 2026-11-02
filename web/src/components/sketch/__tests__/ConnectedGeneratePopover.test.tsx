/**
 * @jest-environment jsdom
 */
/**
 * Tests for the generate popover: the visibility gate (bound document) and that
 * submitting creates a text-to-image layer and runs the direct-gen job for
 * full-frame generation.
 */

import { render, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { ConnectedGeneratePopover } from "../editor-shell/ConnectedGeneratePopover";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";

// The prompt box offers `@` entities from the library, which reads TanStack
// Query; these tests mount no QueryClientProvider.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

// Heavy model picker — stub to keep model-fetching deps out of jsdom.
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

// The `@` picker lists one entity; its menu is a single button.
jest.mock(
  "../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    useAssetMentionSearch: (query: string | null) => ({
      activeTab: "saved",
      setActiveTab: jest.fn(),
      entities:
        query === null
          ? []
          : [{ type: "entity", id: "e1", kind: "character", name: "Marta" }],
      displayedAssets: [],
      hasMoreSaved: false,
      loadMoreSaved: jest.fn(),
      handleRename: jest.fn()
    })
  })
);
jest.mock("../../node_types/editing/promptComposer/AssetMentionMenu", () => ({
  AssetMentionMenu: ({ onSelect }: { onSelect: (index: number) => void }) => (
    <button type="button" data-testid="pick-entity" onClick={() => onSelect(0)}>
      Marta
    </button>
  )
}));

const mockStart = jest.fn();
jest.mock("../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start: mockStart, cancel: jest.fn() })
}));

// useMediaOptions fetches per-model constraints via TanStack Query; these tests
// don't render a QueryClientProvider, so stub it (the form falls back to the
// full static option lists, which is what these assertions expect).
jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useMediaOptions: () => ({ data: undefined })
}));

function renderForm(open = true) {
  // The app theme mock carries the custom palette (Paper.overlay etc.)
  // the primitives style against; a bare createTheme lacks it.
  const theme = mockTheme;
  return render(
    <ThemeProvider theme={theme}>
      <ConnectedGeneratePopover
        open={open}
        anchorEl={null}
        onClose={jest.fn()}
      />
    </ThemeProvider>
  );
}

/** Seed a direct-gen binding so the form's model picker starts populated. */
function seedModel(): void {
  useSketchSessionStore.getState().upsertBinding({
    layerId: "seed-binding",
    kind: "text-to-image",
    prompt: "",
    provider: "fake",
    model: "flux-pro",
    sourceLayerId: null,
    status: "draft",
    versions: []
  });
}

beforeEach(() => {
  mockStart.mockReset();
  useSketchSessionStore.setState({ documentId: null, name: "", bindings: {} });
});

describe("<ConnectedGeneratePopover />", () => {
  it("renders nothing without a bound document", () => {
    const { queryByTestId } = renderForm();
    expect(queryByTestId("sketch-generate-form")).toBeNull();
  });

  it("renders nothing while closed", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    const { queryByTestId } = renderForm(false);
    expect(queryByTestId("sketch-generate-form")).toBeNull();
  });

  it("renders the form and submit with a bound document", () => {
    useSketchSessionStore.setState({ documentId: "doc-1", name: "portrait" });
    const { getByTestId } = renderForm();
    expect(getByTestId("sketch-generate-form")).toBeTruthy();
    expect(getByTestId("sketch-gen-submit")).toBeTruthy();
  });

  it("keeps submit disabled until a prompt is typed", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    const { getByTestId, getByPlaceholderText } = renderForm();
    expect(getByTestId("sketch-gen-submit")).toBeDisabled();
    fireEvent.change(getByPlaceholderText("Describe the image…"), {
      target: { value: "a red fox" }
    });
    expect(getByTestId("sketch-gen-submit")).not.toBeDisabled();
  });

  it("runs the direct-gen job on Generate submit", async () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    const { getByTestId, getByPlaceholderText } = renderForm();
    fireEvent.change(getByPlaceholderText("Describe the image…"), {
      target: { value: "a red fox" }
    });
    fireEvent.click(getByTestId("sketch-gen-submit"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  });

  it("writes a picked @ entity into the prompt as its entity:// token", async () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    const user = userEvent.setup();
    const { getByTestId, getByPlaceholderText, findByTestId } = renderForm();
    const prompt = getByPlaceholderText("Describe the image…");

    await user.type(prompt, "a portrait of @mar");
    await user.click(await findByTestId("pick-entity"));
    expect(prompt).toHaveValue("a portrait of entity://e1 ");

    fireEvent.click(getByTestId("sketch-gen-submit"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    const bindings = Object.values(useSketchSessionStore.getState().bindings);
    expect(bindings.map((binding) => binding.prompt)).toContain(
      "a portrait of entity://e1"
    );
  });
});
