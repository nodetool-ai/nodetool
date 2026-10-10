/**
 * @jest-environment jsdom
 *
 * The image look step's style reaches the prompt. The tiles are shipped
 * presets filed under project "default", so a step that looked the choice up
 * in the active project's entities alone sent every batch without its style.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import type { StylePresetEntity } from "../../../../serverState/useStylePresets";

const NOIR: StylePresetEntity = {
  entityId: "style-noir",
  presetId: "noir",
  name: "Noir",
  descriptor: "high-contrast black and white, hard shadows",
  thumbnail: "package://styles/noir.png"
};

let mockPresets: { data: StylePresetEntity[] | undefined; isLoading: boolean } =
  { data: [NOIR], isLoading: false };
jest.mock("../../../../serverState/useStylePresets", () => ({
  ...jest.requireActual("../../../../serverState/useStylePresets"),
  useStylePresets: () => mockPresets
}));
// The active project's library holds none of the shipped styles.
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [], isLoading: false })
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({
    models: [
      { type: "image_model", id: "model-1", name: "Model", provider: "prov" }
    ],
    providers: ["prov"],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  })
}));
const mockGenerateVariations = jest.fn(
  async (_request: { prompt: string }) => [] as { layerId: string }[]
);
jest.mock("../../../../hooks/sketch/useGenerateVariations", () => ({
  useGenerateVariations: () => ({
    generateVariations: (request: { prompt: string }) =>
      mockGenerateVariations(request)
  })
}));

import { LookStep, useLookStep, type LookStepControls } from "../LookStep";
import mockTheme from "../../../../__mocks__/themeMock";
import { useProviderOnboardingStore } from "../../../../stores/ProviderOnboardingStore";
import { useSketchStore } from "../../../sketch/state/useSketchStore";
import { createDefaultDocument } from "../../../sketch/types";

beforeEach(() => {
  mockGenerateVariations.mockClear();
  mockPresets = { data: [NOIR], isLoading: false };
  const document = createDefaultDocument(1024, 1024);
  document.setup = {
    stage: "look",
    brief: "a pour-over dripper",
    style_entity_id: NOIR.entityId,
    image_provider: "prov",
    image_model: "model-1"
  };
  act(() => {
    useSketchStore.getState().setDocument(document);
  });
});

describe("useLookStep style", () => {
  it("sends a shipped preset's descriptor with the batch", async () => {
    const { result } = renderHook(() => useLookStep());
    await act(async () => {
      await result.current.generate();
    });
    expect(mockGenerateVariations.mock.calls[0][0].prompt).toContain(
      NOIR.descriptor
    );
  });

  it("holds the button while the chosen style is still loading", () => {
    mockPresets = { data: undefined, isLoading: true };
    const { result } = renderHook(() => useLookStep());
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toBe("Loading the chosen style");
  });
});

describe("LookStep with no image provider", () => {
  it("opens the provider dialog for image providers from the warning", () => {
    mockPresets = { data: [], isLoading: false };
    const look = {
      availability: "no-provider",
      modelMissing: false,
      sizePresets: [],
      styleChoice: null,
      setStyleChoice: jest.fn(),
      refetchModels: jest.fn()
    } as unknown as LookStepControls;
    render(
      <ThemeProvider theme={mockTheme}>
        <LookStep look={look} />
      </ThemeProvider>
    );
    expect(screen.getByText(/No image provider is connected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect a provider" }));
    expect(useProviderOnboardingStore.getState()).toMatchObject({
      open: true,
      capability: "text_to_image"
    });
  });
});
