import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import EffectsGallery from "../EffectsGallery";
import { EFFECT_PRESETS } from "../../../lib/presets/catalog";
import { useEffectsGalleryStore } from "../../../stores/EffectsGalleryStore";
import { useLastModelStore } from "../../../stores/lastModelStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { rpcRequest } from "../../../lib/websocket/rpcRequest";

const mockCreateAsset = jest.fn();
const mockOpenAsWorkflow = jest.fn();
const mockOpenSetup = jest.fn();
let mockNeedsSetup = false;

jest.mock("../../../lib/websocket/rpcRequest", () => ({ rpcRequest: jest.fn() }));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (select: (state: unknown) => unknown) =>
    select({ createAsset: mockCreateAsset })
}));
jest.mock("../../../hooks/presets/useOpenPresetAsWorkflow", () => ({
  useOpenPresetAsWorkflow: () => mockOpenAsWorkflow
}));
jest.mock("../../chat/composer/useModeProviderSetup", () => ({
  useModeProviderSetup: () => ({
    needsSetup: mockNeedsSetup,
    reason: mockNeedsSetup
      ? "Animating images needs a video provider. Connect one to continue."
      : null,
    openSetup: mockOpenSetup
  })
}));
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({
    models: [{ id: "fake-video", provider: "fake", supported_tasks: ["image_to_video"] }],
    isLoading: false
  }),
  useImageModelsByProvider: () => ({
    models: [{ id: "fake-image", provider: "fake", supported_tasks: ["image_to_image"] }],
    isLoading: false
  })
}));
jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (m: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ type: "video_model", id: "fake-video", provider: "fake", name: "Fake" })}
    >
      {value ? `video model ${value}` : "pick video model"}
    </button>
  )
}));
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (m: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ type: "image_model", id: "fake-image", provider: "fake", name: "Fake" })}
    >
      {value ? `image model ${value}` : "pick image model"}
    </button>
  )
}));
jest.mock("../../../hooks/useResolvedMediaUri", () => ({
  ...jest.requireActual("../../../hooks/useResolvedMediaUri"),
  useResolvedMedia: () => ({ url: null, thumbUrl: null, contentType: null })
}));

const renderGallery = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <EffectsGallery />
      </ThemeProvider>
    </QueryClientProvider>
  );

const picture = () => new File(["x"], "product.png", { type: "image/png" });
const dropPicture = async () => {
  const zone = screen.getByTestId("effects-drop-zone");
  fireEvent.drop(zone, { dataTransfer: { files: [picture()], items: [], types: ["Files"] } });
  await waitFor(() => expect(mockCreateAsset).toHaveBeenCalled());
};
const applyButton = () => screen.getByRole("button", { name: /^Apply effect$|^Applying/ });
const card = (name: string) => screen.getByRole("button", { name });

describe("EffectsGallery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNeedsSetup = false;
    mockCreateAsset.mockResolvedValue({ id: "asset-1" });
    useEffectsGalleryStore.setState({
      sourceAssetId: null,
      effectId: null,
      studio: null,
      run: { status: "idle", effectId: null, sourceAssetId: null, assetIds: [], error: null }
    });
    useLastModelStore.setState({ byKind: {}, byTask: {} });
    useModelPreferencesStore.setState({ defaults: {} });
  });

  it("shows a card for every effect in the catalogue", () => {
    renderGallery();
    const group = screen.getByRole("group", { name: "Effects" });
    const cards = Array.from(group.querySelectorAll("[data-preset-id]"));
    expect(cards.map((element) => element.getAttribute("data-preset-id"))).toEqual(
      EFFECT_PRESETS.map((preset) => preset.id)
    );
    expect(card("Levitate")).toBeInTheDocument();
    expect(card("Claymation")).toBeInTheDocument();
  });

  it("shows only a studio's effects until asked for all of them", async () => {
    useEffectsGalleryStore
      .getState()
      .openStudio("studio.photo-effects", ["effect.petal-burst", "effect.levitate"]);
    renderGallery();
    const group = screen.getByRole("group", { name: "Effects" });
    const shown = () =>
      Array.from(group.querySelectorAll("[data-preset-id]")).map((element) =>
        element.getAttribute("data-preset-id")
      );
    expect(shown()).toEqual(["effect.petal-burst", "effect.levitate"]);
    expect(
      screen.getByText("Showing the effects of the Animate a photo studio.")
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all effects" }));
    expect(shown()).toEqual(EFFECT_PRESETS.map((preset) => preset.id));
    expect(useEffectsGalleryStore.getState().effectId).toBe("effect.petal-burst");
  });

  it("is empty with a reason and the next step before anything is chosen", () => {
    renderGallery();
    expect(applyButton()).toBeDisabled();
    expect(screen.getByText("Add a picture to apply an effect.")).toBeInTheDocument();
    expect(screen.getByText("Your result appears here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose picture/ })).toBeEnabled();
  });

  it("names the next missing step as the picture and the effect arrive", async () => {
    renderGallery();
    await dropPicture();
    expect(await screen.findByText("Pick an effect below.")).toBeInTheDocument();
    expect(mockCreateAsset.mock.calls[0][0]).toBeInstanceOf(File);
    await userEvent.click(card("Levitate"));
    expect(await screen.findByText("Choose a video model.")).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it("rejects a file that is not a picture", async () => {
    renderGallery();
    const zone = screen.getByTestId("effects-drop-zone");
    const text = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, { dataTransfer: { files: [text], items: [], types: ["Files"] } });
    expect(await screen.findByText(/That file is not a picture/)).toBeInTheDocument();
    expect(mockCreateAsset).not.toHaveBeenCalled();
  });

  it("explains an upload failure in plain words", async () => {
    mockCreateAsset.mockRejectedValue(new Error("413"));
    renderGallery();
    const zone = screen.getByTestId("effects-drop-zone");
    fireEvent.drop(zone, { dataTransfer: { files: [picture()], items: [], types: ["Files"] } });
    expect(await screen.findByText(/could not be uploaded/)).toBeInTheDocument();
  });

  it("applies an image-to-video effect through generate_media and shows the result in place", async () => {
    (rpcRequest as jest.Mock).mockResolvedValue({ asset_ids: ["result-1"] });
    useLastModelStore.getState().remember("video", { provider: "fake", model: "fake-video" });
    renderGallery();
    await dropPicture();
    await userEvent.click(card("Levitate"));
    expect(screen.getByText("video model fake-video")).toBeInTheDocument();
    await waitFor(() => expect(applyButton()).toBeEnabled());
    await userEvent.click(applyButton());

    await waitFor(() => expect(rpcRequest).toHaveBeenCalled());
    const [command, payload] = (rpcRequest as jest.Mock).mock.calls[0];
    expect(command).toBe("generate_media");
    expect(payload).toMatchObject({
      mode: "video",
      provider: "fake",
      model: "fake-video",
      preset_ids: ["effect.levitate"],
      source_asset_id: "asset-1"
    });
    expect(await screen.findByTestId("effects-result")).toBeInTheDocument();
    expect(screen.getByText("Levitate is ready.")).toBeInTheDocument();
  });

  it("uses the image model and image_edit for an editing effect", async () => {
    (rpcRequest as jest.Mock).mockResolvedValue({ asset_ids: ["result-2"] });
    renderGallery();
    await dropPicture();
    await userEvent.click(card("Claymation"));
    await userEvent.click(screen.getByRole("button", { name: "pick image model" }));
    await waitFor(() => expect(applyButton()).toBeEnabled());
    await userEvent.click(applyButton());
    await waitFor(() => expect(rpcRequest).toHaveBeenCalled());
    expect((rpcRequest as jest.Mock).mock.calls[0][1]).toMatchObject({
      mode: "image_edit",
      model: "fake-image",
      preset_ids: ["effect.claymation"]
    });
  });

  it("shows the server's reason on failure and retries from the error", async () => {
    (rpcRequest as jest.Mock)
      .mockRejectedValueOnce(new Error("The provider rejected this picture"))
      .mockResolvedValueOnce({ asset_ids: ["result-3"] });
    useLastModelStore.getState().remember("video", { provider: "fake", model: "fake-video" });
    renderGallery();
    await dropPicture();
    await userEvent.click(card("Frost crystals"));
    await waitFor(() => expect(applyButton()).toBeEnabled());
    await userEvent.click(applyButton());
    const error = await screen.findByTestId("effects-result-error");
    expect(error).toHaveTextContent("The provider rejected this picture.");
    await userEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("effects-result")).toBeInTheDocument();
    expect(rpcRequest).toHaveBeenCalledTimes(2);
  });

  it("leads with the provider banner when no provider serves the mode", async () => {
    mockNeedsSetup = true;
    useLastModelStore.getState().remember("video", { provider: "fake", model: "fake-video" });
    renderGallery();
    await dropPicture();
    await userEvent.click(card("Levitate"));
    expect(screen.getByText(/needs a video provider/)).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Connect a provider/i }));
    expect(mockOpenSetup).toHaveBeenCalled();
  });

  it("opens an effect as a workflow from its card menu", async () => {
    renderGallery();
    await userEvent.click(screen.getByRole("button", { name: "Levitate actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Open as workflow" }));
    expect(mockOpenAsWorkflow).toHaveBeenCalledWith(["effect.levitate"], {
      kind: "video",
      model: null
    });
  });

  it("keeps the picture and the result when the page is closed and opened again", async () => {
    (rpcRequest as jest.Mock).mockResolvedValue({ asset_ids: ["result-4"] });
    useLastModelStore.getState().remember("video", { provider: "fake", model: "fake-video" });
    const first = renderGallery();
    await dropPicture();
    await userEvent.click(card("Levitate"));
    await waitFor(() => expect(applyButton()).toBeEnabled());
    await userEvent.click(applyButton());
    await screen.findByTestId("effects-result");
    first.unmount();
    renderGallery();
    expect(screen.getByTestId("effects-result")).toBeInTheDocument();
    expect(card("Levitate")).toHaveAttribute("aria-pressed", "true");
  });
});
