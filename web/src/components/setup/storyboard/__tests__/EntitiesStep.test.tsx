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
jest.mock("../../../../hooks/storyboard/useDefaultStillModel", () => ({
  useDefaultStillModel: jest.fn()
}));
jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="image-model-select" />
}));
jest.mock("../../../entities/EntityAssetPickerDialog", () => () => null);
jest.mock("../../../entities/EntityEditorDialog", () => () => null);

import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import { EntitiesStep } from "../EntitiesStep";

const BOARD_ID = "board";

const renderStep = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <EntitiesStep boardId={BOARD_ID} />
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
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

it("opens a reference image without selecting the entity", async () => {
  const user = userEvent.setup();
  renderStep();

  const checkbox = await screen.findByRole("checkbox", {
    name: "Mara · character"
  });
  await user.click(
    screen.getByRole("button", { name: "View Mara reference image" })
  );

  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole("dialog", { name: /Mara/ })).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Mara reference image" })
  ).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: /Mara/ })
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
    })
  );
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual([
    "station",
    "lantern-asset"
  ]);
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

it("does not change the storyboard after the step is left", async () => {
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
  expect(useStoryboardStore.getState().getBoard(BOARD_ID)?.entityIds).toEqual(
    []
  );
});
