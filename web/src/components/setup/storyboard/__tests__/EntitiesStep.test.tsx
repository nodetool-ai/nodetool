import { render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";

const entityAssets = [
  {
    id: "mara",
    project_id: "default",
    name: "mara.png",
    content_type: "image/png",
    created_at: "",
    metadata: {
      nodetool_entity: {
        kind: "character",
        name: "Mara",
        descriptor: "Mara wears a red raincoat"
      }
    }
  },
  {
    id: "station",
    project_id: "default",
    name: "station.png",
    content_type: "image/png",
    created_at: "",
    metadata: {
      nodetool_entity: {
        kind: "location",
        name: "Station",
        descriptor: "An empty concrete station"
      }
    }
  }
];
const searchAssets = jest.fn();
const getAsset = jest.fn();
const updateAsset = jest.fn();
const rpcRequest = jest.fn();
const getModelUnitPrice = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      search: { query: (...args: unknown[]) => searchAssets(...args) },
      get: { query: (...args: unknown[]) => getAsset(...args) },
      update: { mutate: (...args: unknown[]) => updateAsset(...args) }
    },
    projects: {
      assignDocument: { mutate: jest.fn() }
    }
  }
}));
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));
jest.mock("../../../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (...args: unknown[]) => getModelUnitPrice(...args)
}));
jest.mock("../../../../hooks/storyboard/useDefaultStillModel", () => ({
  useDefaultStillModel: jest.fn()
}));
const imageModels: unknown[] = [];
const languageModels: unknown[] = [];
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: imageModels }),
  useLanguageModelsByProvider: () => ({
    models: languageModels,
    isLoading: false
  })
}));
jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="image-model-select" />
}));
jest.mock("../../../entities/EntityAssetPickerDialog", () => () => null);
jest.mock("../../../entities/EntityEditorDialog", () => () => null);
// The gallery's viewer needs the router and the asset explorer; what the step
// decides is which media it opens on and what it pages through.
jest.mock("../../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({
    asset,
    sortedAssets,
    captions,
    onClose
  }: {
    asset: { id: string };
    sortedAssets: { id: string }[];
    captions: Record<string, string>;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Gallery">
      <p>{captions[asset.id]}</p>
      <p>{`${sortedAssets.length} items`}</p>
      <button type="button" onClick={onClose}>
        Close gallery
      </button>
    </div>
  )
}));

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { EntitiesStep } from "../EntitiesStep";
import { MediaGalleryProvider } from "../../MediaGallery";
import { clearSetupReports } from "../setupChoices";

const BOARD_ID = "board";

const renderStep = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <MediaGalleryProvider>
            <EntitiesStep boardId={BOARD_ID} />
          </MediaGalleryProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  getModelUnitPrice.mockReturnValue(null);
  imageModels.length = 0;
  languageModels.length = 0;
  clearSetupReports(BOARD_ID);
  searchAssets.mockResolvedValue({ assets: entityAssets });
  getAsset.mockImplementation(async ({ id }: { id: string }) => ({
    id,
    project_id: "default",
    name: `${id}.png`,
    content_type: "image/png",
    created_at: "",
    metadata: {}
  }));
  updateAsset.mockImplementation(
    async (input: { id: string; metadata: Record<string, unknown> }) => ({
      id: input.id,
      project_id: "default",
      name: `${input.id}.png`,
      content_type: "image/png",
      created_at: "",
      metadata: input.metadata
    })
  );
  useStoryboardStore.setState({ boards: {} });
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  useStoryboardStore.getState().setScreenplay(BOARD_ID, {
    type: "screenplay",
    id: "screenplay",
    title: "Rain",
    shots: [
      {
        type: "shot",
        id: "shot-1",
        index: 0,
        action: "Mara waits",
        status: "planned"
      },
      {
        type: "shot",
        id: "shot-2",
        index: 1,
        action: "The empty road",
        status: "planned"
      }
    ]
  });
  useStoryboardStore.getState().setDirectorModel(BOARD_ID, {
    type: "language_model",
    id: "director-1",
    provider: "openai",
    name: "Director"
  });
  useStoryboardStore.getState().setImageModel(BOARD_ID, {
    type: "image_model",
    id: "image-1",
    provider: "openai",
    name: "Still model",
    path: ""
  });
});

it("assigns a selected entity to matching shots, then allows shot refinement", async () => {
  const user = userEvent.setup();
  renderStep();

  await user.click(
    await screen.findByRole("checkbox", { name: "Mara · character" })
  );

  let board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.entityIds).toEqual(["mara"]);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([["mara"], []]);

  const shotAssignments = [1, 2].map((number) =>
    within(screen.getByRole("region", { name: `Shot ${number}` })).getByRole(
      "checkbox",
      { name: "Mara" }
    )
  );
  expect(shotAssignments).toHaveLength(2);
  for (const assignment of shotAssignments) {
    expect(
      assignment.closest("label")?.querySelector("img")
    ).toBeInTheDocument();
  }
  await user.click(shotAssignments[1]);

  board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([
    ["mara"],
    ["mara"]
  ]);

  await user.click(
    screen.getByRole("checkbox", { name: "Station · location" })
  );
  board = useStoryboardStore.getState().getBoard(BOARD_ID);
  expect(board?.shots.map((shot) => shot.entity_ids)).toEqual([
    ["mara", "station"],
    ["mara", "station"]
  ]);
  for (const assignment of screen.getAllByRole("checkbox", {
    name: "Station"
  })) {
    expect(assignment.closest("label")?.querySelector("img")).toBeNull();
  }
});

it("filters the library without losing selections or shot assignments", async () => {
  const user = userEvent.setup();
  renderStep();

  await user.click(
    await screen.findByRole("checkbox", { name: "Mara · character" })
  );
  await user.type(
    screen.getByRole("textbox", { name: "Search entities" }),
    "concrete"
  );
  expect(
    screen.queryByRole("checkbox", { name: "Mara · character" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Station · location" })
  ).not.toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent(
    "1 selected for this storyboard"
  );

  await user.click(screen.getByRole("button", { name: "Clear search" }));
  await user.click(screen.getByRole("button", { name: "Selected only" }));
  expect(
    screen.getByRole("checkbox", { name: "Mara · character" })
  ).toBeChecked();
  expect(
    screen.queryByRole("checkbox", { name: "Station · location" })
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox", { name: "Mara" })[0]).toBeChecked();
});

it("opens a reference image fullscreen without selecting the entity", async () => {
  const user = userEvent.setup();
  renderStep();

  const checkbox = await screen.findByRole("checkbox", {
    name: "Mara · character"
  });
  await user.click(
    screen.getByRole("button", { name: "View Mara reference image" })
  );

  expect(checkbox).not.toBeChecked();
  const gallery = await screen.findByRole("dialog", { name: "Gallery" });
  expect(
    within(gallery).getByText("Mara: Mara wears a red raincoat")
  ).toBeInTheDocument();
  await user.click(
    within(gallery).getByRole("button", { name: "Close gallery" })
  );
  expect(
    screen.queryByRole("dialog", { name: "Gallery" })
  ).not.toBeInTheDocument();
});

it("finds entities in the screenplay and creates a selected reference", async () => {
  let finishImage: (value: { asset_ids: string[] }) => void = () => {};
  const imageResult = new Promise<{ asset_ids: string[] }>((resolve) => {
    finishImage = resolve;
  });
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A dented brass railway lantern with amber glass",
            reference_prompt:
              "A dented brass railway lantern with amber glass, centered on a neutral background"
          }
        ]
      }
    })
    .mockReturnValueOnce(imageResult);
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  expect(
    await screen.findByText("A dented brass railway lantern with amber glass")
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create The Lantern" }));
  await user.click(
    await screen.findByRole("checkbox", { name: "Station · location" })
  );
  finishImage({ asset_ids: ["lantern-asset"] });

  await waitFor(() =>
    expect(updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lantern-asset",
        expected_metadata: {},
        metadata: expect.objectContaining({
          nodetool_entity: expect.objectContaining({
            kind: "prop",
            name: "The Lantern"
          })
        })
      })
    )
  );
  expect(rpcRequest).toHaveBeenNthCalledWith(
    2,
    "generate_media",
    expect.objectContaining({
      mode: "image",
      model: "image-1",
      aspect_ratio: "1:1",
      variations: 1
    }),
    undefined,
    undefined
  );
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual([
    "station",
    "lantern-asset"
  ]);
});

it("draws a reference with the text-to-image variant of an editing-only still model", async () => {
  imageModels.push(
    {
      type: "image_model",
      id: "black-forest-labs/flux-2-flex/edit",
      name: "FLUX.2 Flex — Edit",
      provider: "atlascloud",
      supported_tasks: ["image_to_image"]
    },
    {
      type: "image_model",
      id: "black-forest-labs/flux-2-flex/text-to-image",
      name: "FLUX.2 Flex — Text to Image",
      provider: "atlascloud",
      supported_tasks: ["text_to_image"]
    }
  );
  useStoryboardStore.getState().setImageModel(BOARD_ID, {
    type: "image_model",
    id: "black-forest-labs/flux-2-flex/edit",
    provider: "atlascloud",
    name: "FLUX.2 Flex — Edit",
    path: ""
  });
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A dented brass railway lantern",
            reference_prompt: "A dented brass railway lantern on grey"
          }
        ]
      }
    })
    .mockResolvedValueOnce({ asset_ids: ["lantern-asset"] });
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  expect(
    await screen.findByText(
      "FLUX.2 Flex — Edit only edits images, so references use FLUX.2 Flex — Text to Image. Stills in the Look step keep FLUX.2 Flex — Edit."
    )
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create The Lantern" }));

  await waitFor(() =>
    expect(rpcRequest).toHaveBeenNthCalledWith(
      2,
      "generate_media",
      expect.objectContaining({
        provider: "atlascloud",
        model: "black-forest-labs/flux-2-flex/text-to-image"
      }),
      undefined,
      undefined
    )
  );
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.imageModel?.id).toBe(
    "black-forest-labs/flux-2-flex/edit"
  );
});

it("asks for another model when the still model only edits and has no text-to-image variant", async () => {
  imageModels.push({
    type: "image_model",
    id: "alibaba/qwen-image-3/edit",
    name: "Qwen Image 3 — Edit",
    provider: "atlascloud",
    supported_tasks: ["image_to_image"]
  });
  useStoryboardStore.getState().setImageModel(BOARD_ID, {
    type: "image_model",
    id: "alibaba/qwen-image-3/edit",
    provider: "atlascloud",
    name: "Qwen Image 3 — Edit",
    path: ""
  });
  rpcRequest.mockResolvedValueOnce({
    data: {
      entities: [
        {
          name: "The Lantern",
          kind: "prop",
          descriptor: "A dented brass railway lantern",
          reference_prompt: "A dented brass railway lantern on grey"
        }
      ]
    }
  });
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  await user.click(
    await screen.findByRole("button", { name: "Create The Lantern" })
  );

  expect(
    await screen.findAllByText(
      "Qwen Image 3 — Edit only edits images, so it cannot draw a reference from a description. Pick a model that creates images from text."
    )
  ).not.toHaveLength(0);
  expect(rpcRequest).toHaveBeenCalledTimes(1);
});

it("creates suggested references in parallel with a generating mark on each active button", async () => {
  let finishLantern: (value: { asset_ids: string[] }) => void = () => {};
  let finishStation: (value: { asset_ids: string[] }) => void = () => {};
  const lanternResult = new Promise<{ asset_ids: string[] }>((resolve) => {
    finishLantern = resolve;
  });
  const stationResult = new Promise<{ asset_ids: string[] }>((resolve) => {
    finishStation = resolve;
  });
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A brass lantern",
            reference_prompt: "A brass lantern on a neutral background"
          },
          {
            name: "Night Platform",
            kind: "location",
            descriptor: "A rain-soaked train platform",
            reference_prompt: "A rain-soaked platform at night"
          }
        ]
      }
    })
    .mockReturnValueOnce(lanternResult)
    .mockReturnValueOnce(stationResult);
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  await user.click(
    await screen.findByRole("button", { name: "Create The Lantern" })
  );
  expect(
    screen.getByRole("button", { name: "Creating The Lantern" })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Create Night Platform" })
  ).toBeEnabled();
  await user.click(
    screen.getByRole("button", { name: "Create Night Platform" })
  );

  expect(rpcRequest).toHaveBeenCalledTimes(3);
  expect(screen.getAllByTestId("thinking-mark")).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Creating Night Platform" })
  ).toBeDisabled();

  finishStation({ asset_ids: ["platform-asset"] });
  await waitFor(() =>
    expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
      ["platform-asset"]
    )
  );
  expect(
    screen.getByRole("button", { name: "Creating The Lantern" })
  ).toBeDisabled();

  finishLantern({ asset_ids: ["lantern-asset"] });
  await waitFor(() =>
    expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
      ["platform-asset", "lantern-asset"]
    )
  );
  expect(screen.queryAllByTestId("thinking-mark")).toHaveLength(0);
});

// F9: the entity is saved and paid for, so it joins the board even when the
// step unmounted before the render landed.
it("attaches an entity that lands after the step is left", async () => {
  let finishImage: (value: { asset_ids: string[] }) => void = () => {};
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A dented brass railway lantern",
            reference_prompt: "A dented brass railway lantern"
          }
        ]
      }
    })
    .mockReturnValueOnce(
      new Promise<{ asset_ids: string[] }>((resolve) => {
        finishImage = resolve;
      })
    );
  const user = userEvent.setup();
  const { unmount } = renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  await user.click(
    await screen.findByRole("button", { name: "Create The Lantern" })
  );
  unmount();
  finishImage({ asset_ids: ["lantern-asset"] });

  await waitFor(() => expect(updateAsset).toHaveBeenCalled());
  await waitFor(() =>
    expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
      ["lantern-asset"]
    )
  );
});

// F9: each creation is reported to the flow, which can abort it.
it("reports a creation to the flow and drops it once aborted", async () => {
  let controller = new AbortController();
  const done = jest.fn();
  const onCreationStart = jest.fn(() => ({ signal: controller.signal, done }));
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A dented brass railway lantern",
            reference_prompt: "A dented brass railway lantern"
          }
        ]
      }
    })
    .mockImplementationOnce(
      (
        _command: string,
        _data: unknown,
        _timeout: unknown,
        signal?: AbortSignal
      ) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("The request was aborted.", "AbortError"))
          );
        })
    );
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <MediaGalleryProvider>
          <EntitiesStep boardId={BOARD_ID} onCreationStart={onCreationStart} />
        </MediaGalleryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  await user.click(
    await screen.findByRole("button", { name: "Create The Lantern" })
  );
  expect(onCreationStart).toHaveBeenCalledTimes(1);
  controller.abort();
  controller = new AbortController();

  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(updateAsset).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
    []
  );
});

// F10: a creation canceled while its entity was being saved stays off the
// board, even though the save itself finished.
it("keeps an entity off the board when it is canceled during the save", async () => {
  const controller = new AbortController();
  const done = jest.fn();
  const onCreationStart = jest.fn(() => ({ signal: controller.signal, done }));
  let finishSave: () => void = () => {};
  updateAsset.mockImplementationOnce(
    (input: { id: string; metadata: Record<string, unknown> }) =>
      new Promise((resolve) => {
        finishSave = () =>
          resolve({
            id: input.id,
            project_id: "default",
            name: `${input.id}.png`,
            content_type: "image/png",
            created_at: "",
            metadata: input.metadata
          });
      })
  );
  rpcRequest
    .mockResolvedValueOnce({
      data: {
        entities: [
          {
            name: "The Lantern",
            kind: "prop",
            descriptor: "A dented brass railway lantern",
            reference_prompt: "A dented brass railway lantern"
          }
        ]
      }
    })
    .mockResolvedValueOnce({ asset_ids: ["lantern-asset"] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <MediaGalleryProvider>
          <EntitiesStep boardId={BOARD_ID} onCreationStart={onCreationStart} />
        </MediaGalleryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  await user.click(
    await screen.findByRole("button", { name: "Create The Lantern" })
  );
  await waitFor(() => expect(updateAsset).toHaveBeenCalled());
  controller.abort();
  finishSave();

  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
    []
  );
});

// F11: the suggestions read the screenplay the creator reviewed, not the
// Director's first draft kept in the envelope.
it("finds entities in the reviewed shots and title", async () => {
  useStoryboardStore.getState().updateShot(BOARD_ID, "shot-1", {
    action: "Mara lights the brass lantern"
  });
  useStoryboardStore.getState().setTitle(BOARD_ID, "Lantern Night");
  rpcRequest.mockResolvedValueOnce({ data: { entities: [] } });
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));

  await waitFor(() => expect(rpcRequest).toHaveBeenCalledTimes(1));
  const prompt = (rpcRequest.mock.calls[0][1] as { prompt: string }).prompt;
  expect(prompt).toContain("Title: Lantern Night");
  expect(prompt).toContain("Mara lights the brass lantern");
  expect(prompt).not.toContain("Mara waits");
});

// F11: a failed find is not a failed creation.
it("names a failed find as a find", async () => {
  rpcRequest.mockRejectedValueOnce(new Error("The model is unavailable."));
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));

  expect(
    await screen.findByText("Could not find entities")
  ).toBeInTheDocument();
  expect(screen.queryByText("Could not create entities")).toBeNull();
});

// F16: in view mode the step changes nothing on the board.
it("holds every pick and paid action in view mode", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <MediaGalleryProvider>
          <EntitiesStep boardId={BOARD_ID} readOnly />
        </MediaGalleryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  const pick = await screen.findByRole("checkbox", {
    name: "Mara · character"
  });
  expect(pick).toBeDisabled();
  expect(screen.getByRole("button", { name: "Find entities" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Create entity from an image" })
  ).toBeDisabled();
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
    []
  );
  // Reading stays available: the reference opens fullscreen.
  await user.click(
    screen.getByRole("button", { name: "View Mara reference image" })
  );
  expect(
    await screen.findByRole("dialog", { name: "Gallery" })
  ).toBeInTheDocument();
});

// A shotlist import goes from step 1 straight to Look, past the genre step
// that fills in the screenplay model. `Find entities` asks that model, so
// without it the step could only say "Director model first" with no picker.
it("fills in the screenplay model a shotlist import skipped", async () => {
  useStoryboardStore.getState().setDirectorModel(BOARD_ID, null);
  languageModels.push({
    id: "catalog-model",
    provider: "openai",
    name: "Catalog"
  });
  renderStep();

  await waitFor(() =>
    expect(
      useStoryboardStore.getState().getBoard(BOARD_ID)?.directorModel?.id
    ).toBe("catalog-model")
  );
});

it("says the library failed to load rather than that it is empty", async () => {
  searchAssets.mockRejectedValueOnce(new Error("The server is unreachable."));
  const user = userEvent.setup();
  renderStep();

  expect(
    await screen.findByText("Could not load your entities")
  ).toBeInTheDocument();
  expect(screen.queryByText("No entities yet")).toBeNull();
  expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("checkbox", { name: "Mara · character" })
  ).toBeInTheDocument();
});

// Cancel and Back both remount the step. The suggestions were paid for, so
// they come back with it instead of asking for another Find.
it("keeps found suggestions when the step remounts", async () => {
  rpcRequest.mockResolvedValueOnce({
    data: {
      entities: [
        {
          name: "The Lantern",
          kind: "prop",
          descriptor: "A dented brass railway lantern with amber glass",
          reference_prompt: "A dented brass railway lantern"
        }
      ]
    }
  });
  const user = userEvent.setup();
  const { unmount } = renderStep();
  await user.click(screen.getByRole("button", { name: "Find entities" }));
  expect(
    await screen.findByText("A dented brass railway lantern with amber glass")
  ).toBeInTheDocument();
  unmount();

  renderStep();

  expect(
    await screen.findByText("A dented brass railway lantern with amber glass")
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Refresh suggestions" })
  ).toBeInTheDocument();
  expect(rpcRequest).toHaveBeenCalledTimes(1);
});

// Both buttons spend money, so each says what before it is pressed.
it("prices Find entities and each Create before they are pressed", async () => {
  getModelUnitPrice.mockReturnValue({ unit_price: 0.04, breakdown: "" });
  useStoryboardStore.getState().setDirectorModel(BOARD_ID, {
    type: "language_model",
    id: "gpt-4o-mini",
    provider: "openai",
    name: "GPT-4o mini"
  });
  rpcRequest.mockResolvedValueOnce({
    data: {
      entities: [
        {
          name: "The Lantern",
          kind: "prop",
          descriptor: "A dented brass railway lantern with amber glass",
          reference_prompt: "A dented brass railway lantern"
        }
      ]
    }
  });
  const user = userEvent.setup();
  renderStep();

  expect(
    await screen.findByRole("group", { name: "Before you generate" })
  ).toHaveTextContent(/GPT-4o mini · ~\$/);
  await user.click(screen.getByRole("button", { name: "Find entities" }));
  const create = await screen.findByRole("button", {
    name: "Create The Lantern"
  });
  expect(create).toHaveAccessibleDescription("About $0.04");
  expect(getModelUnitPrice).toHaveBeenCalledWith(
    { id: "image-1", provider: "openai" },
    expect.objectContaining({ resolution: "1K" })
  );
});

it("cancels Find entities and returns focus to its button", async () => {
  let findSignal: AbortSignal | undefined;
  rpcRequest.mockImplementationOnce(
    (
      _method: string,
      _input: unknown,
      _options: unknown,
      signal: AbortSignal
    ) => {
      findSignal = signal;
      return new Promise(() => undefined);
    }
  );
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));
  expect(
    screen.getByRole("button", { name: "Finding entities" })
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Cancel finding entities" })
  );

  expect(findSignal?.aborted).toBe(true);
  const find = screen.getByRole("button", { name: "Find entities" });
  expect(find).toBeEnabled();
  await waitFor(() => expect(find).toHaveFocus());
  expect(
    screen.queryByRole("button", { name: "Cancel finding entities" })
  ).toBeNull();
  expect(screen.queryByText("Could not find entities")).toBeNull();
});

// Continue and Back unmount the step while Find is still running. The answer
// is paid for either way, so it waits for the creator's return.
it("keeps suggestions that land after the step is left", async () => {
  let finishFind: (value: unknown) => void = () => undefined;
  rpcRequest.mockReturnValueOnce(
    new Promise((resolve) => {
      finishFind = resolve;
    })
  );
  const user = userEvent.setup();
  const { unmount } = renderStep();
  await user.click(screen.getByRole("button", { name: "Find entities" }));
  unmount();
  finishFind({
    data: {
      entities: [
        {
          name: "The Lantern",
          kind: "prop",
          descriptor: "A dented brass railway lantern with amber glass",
          reference_prompt: "A dented brass railway lantern"
        }
      ]
    }
  });

  renderStep();

  expect(
    await screen.findByText("A dented brass railway lantern with amber glass")
  ).toBeInTheDocument();
});

// Continue and Back remount the step while Find is still running. The step
// must still show the call as running, so it is not bought a second time, and
// its Cancel must still stop it.
it("shows a Find that is still running after the step remounts", async () => {
  let findSignal: AbortSignal | undefined;
  rpcRequest.mockImplementationOnce(
    (
      _method: string,
      _input: unknown,
      _options: unknown,
      signal: AbortSignal
    ) => {
      findSignal = signal;
      return new Promise(() => undefined);
    }
  );
  const user = userEvent.setup();
  const { unmount } = renderStep();
  await user.click(screen.getByRole("button", { name: "Find entities" }));
  unmount();

  renderStep();

  expect(
    screen.getByRole("button", { name: "Finding entities" })
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Cancel finding entities" })
  );
  expect(findSignal?.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "Find entities" })).toBeEnabled();
  expect(rpcRequest).toHaveBeenCalledTimes(1);
});

// A paid Find that found nothing must say so, rather than leave the step
// looking as if the button did nothing.
it("says when Find entities found nothing", async () => {
  rpcRequest.mockResolvedValueOnce({ data: { entities: [] } });
  const user = userEvent.setup();
  renderStep();

  await user.click(screen.getByRole("button", { name: "Find entities" }));

  expect(
    await screen.findByText(
      "No recurring characters, places or props were found in your screenplay."
    )
  ).toBeInTheDocument();
});
