import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DashboardExampleModels from "../DashboardExampleModels";
import { EXAMPLE_MODEL_PACKS } from "../../../utils/exampleModels";

const openTab = jest.fn();
const navigate = jest.fn();
const createAsset = jest.fn();
const notify = jest.fn();

const GAME_MODELS_DIR = join(
  __dirname,
  "../../../../../packages/base-nodes/nodetool/assets/nodetool-base/game-models"
);
const shippedCatalog = (pack: string): { models: { file: string }[] } =>
  JSON.parse(readFileSync(join(GAME_MODELS_DIR, pack, "catalog.json"), "utf8"));

jest.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "personal:test",
  useWorkspaceTabsStore: <T,>(
    select: (state: { openTab: typeof openTab }) => T
  ) => select({ openTab })
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(
    select: (state: { createAsset: typeof createAsset }) => T
  ) => select({ createAsset })
}));
jest.mock("../../../utils/notifyMutationError", () => ({
  notifyMutationError: (...args: unknown[]) => notify(...args)
}));
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ alt }: { alt: string }) => <img alt={alt} />
}));

function showGallery(): void {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <DashboardExampleModels />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (url: string) => {
    const match = /game-models\/([^/]+)\/(.+)$/.exec(url);
    if (match?.[2] === "catalog.json") {
      return { ok: true, json: async () => shippedCatalog(match[1]) };
    }
    return { ok: true, blob: async () => new Blob(["glb"]) };
  }) as unknown as typeof fetch;
  createAsset.mockResolvedValue({
    id: "1234567890abcdef1234567890abcdef",
    name: "woodland-ranger.glb"
  });
});

it("lists a tab for every shipped pack directory", () => {
  const shipped = readdirSync(GAME_MODELS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  expect(shipped.length).toBeGreaterThan(0);
  expect(EXAMPLE_MODEL_PACKS.map((pack) => pack.slug).sort()).toEqual(shipped);
});

it("opens a shipped model as a 3D model asset in the current project", async () => {
  showGallery();
  const buttons = await screen.findAllByRole("button", { name: /^Open / });
  expect(buttons).toHaveLength(shippedCatalog("adventure").models.length);

  await userEvent.click(
    screen.getByRole("button", { name: "Open Woodland ranger" })
  );

  await waitFor(() => expect(openTab).toHaveBeenCalled());
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/api/assets/packages/nodetool-base/game-models/adventure/woodland-ranger.glb"
    )
  );
  const [file, , , , , projectId] = createAsset.mock.calls[0];
  expect(file).toBeInstanceOf(File);
  expect((file as File).name).toBe("woodland-ranger.glb");
  expect((file as File).type).toBe("model/gltf-binary");
  expect(projectId).toBe("personal:test");
  expect(openTab).toHaveBeenCalledWith({
    type: "model3d",
    ref: "1234567890abcdef1234567890abcdef",
    mode: "edit",
    title: "woodland-ranger.glb",
    projectId: "personal:test"
  });
  expect(navigate).toHaveBeenCalledWith("/workspace");
});

it("switches packs and reports a failed download", async () => {
  showGallery();
  await userEvent.click(screen.getByRole("tab", { name: "Dungeon" }));
  const button = await screen.findByRole("button", {
    name: "Open Arched oak door"
  });
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false
  });
  await userEvent.click(button);
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      "add the example model",
      expect.any(Error)
    )
  );
  expect(createAsset).not.toHaveBeenCalled();
  expect(openTab).not.toHaveBeenCalled();
});
