import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CreateSurface from "../CreateSurface";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { useCreateViewStore } from "../../../stores/CreateViewStore";
import {
  useGenerationActivityStore,
  type GenerationActivity
} from "../../../stores/GenerationActivityStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: { send: jest.fn().mockResolvedValue(undefined) }
}));

let assetListData: { assets: unknown[] } | undefined = { assets: [] };
jest.mock("../../../trpc/client", () => ({
  trpc: {
    assets: {
      list: {
        useQuery: ({ content_type }: { content_type: string }) => ({
          data: {
            assets: (assetListData?.assets ?? []).filter((asset) =>
              (asset as { content_type: string }).content_type.startsWith(content_type)
            )
          },
          isLoading: false,
          error: null,
          refetch: jest.fn()
        })
      }
    }
  }
}));

// The chips are the composer's own and are covered by its tests; here they
// would pull in the model and provider queries.
jest.mock("../../chat/composer/ModeChips", () => ({
  __esModule: true,
  default: () => <div data-testid="mode-chips" />
}));
jest.mock("../../chat/composer/ModeSelectChip", () => ({
  __esModule: true,
  default: () => <div data-testid="mode-select-chip" />
}));
jest.mock("../../chat/composer/MediaCostEstimate", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../chat/composer/useModeProviderSetup", () => ({
  useModeProviderSetup: () => ({ needsSetup: false, reason: null, openSetup: jest.fn() })
}));
jest.mock("../useCreateModelDefaults", () => ({ useCreateModelDefaults: jest.fn() }));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => jest.fn()
}));
jest.mock("../../../hooks/useEditVideoAsset", () => ({
  useEditVideoAsset: () => jest.fn()
}));
const send = jest.mocked(globalWebSocketManager.send);

const generation = (
  id: string,
  overrides: Partial<GenerationActivity> = {}
): GenerationActivity => ({
  id,
  channel: "rpc",
  status: "generated",
  kind: "image",
  prompt: `prompt ${id}`,
  model: "flux",
  source: null,
  threadId: null,
  startedAt: 1,
  endedAt: 2,
  assetIds: [`asset-${id}`],
  error: null,
  request: { mode: "image", provider: "fake", model: "flux", width: 1024, height: 1024 },
  ...overrides
});

const seedGenerations = (...items: GenerationActivity[]) =>
  useGenerationActivityStore.setState({
    generations: Object.fromEntries(items.map((item) => [item.id, item]))
  });

const renderSurface = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <CreateSurface />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("CreateSurface", () => {
  beforeEach(() => {
    send.mockClear();
    assetListData = { assets: [] };
    seedGenerations();
    useCreateViewStore.setState({ mode: "image", prompt: "", batch: 1 });
    useMediaGenerationStore.setState({
      image: {
        ...useMediaGenerationStore.getState().image,
        model: { type: "image_model", id: "flux", provider: "fake" as never, name: "Flux", path: "" }
      }
    });
  });

  describe("submission", () => {
    it("sends one generate_media request per take with distinct seeds, and no chat turn", async () => {
      const user = userEvent.setup();
      useCreateViewStore.setState({ batch: 3 });
      renderSurface();
      await user.type(screen.getByRole("textbox"), "a lighthouse at dusk");
      await user.click(screen.getByRole("button", { name: "Generate" }));

      expect(send).toHaveBeenCalledTimes(3);
      const messages = send.mock.calls.map(([message]) => message);
      expect(messages.every((message) => message.command === "generate_media")).toBe(true);
      const data = messages.map(
        (message) => message.data as { prompt: string; seed: number; variations: number }
      );
      expect(data.map((entry) => entry.prompt)).toEqual(Array(3).fill("a lighthouse at dusk"));
      expect(new Set(data.map((entry) => entry.seed)).size).toBe(3);
      expect(data.every((entry) => entry.variations === 1)).toBe(true);
    });

    it("says what is missing instead of sending an empty prompt", async () => {
      const user = userEvent.setup();
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(send).not.toHaveBeenCalled();
      expect(screen.getByText("Write a prompt to generate.")).toBeInTheDocument();
    });

    it("clears that message with the next edit", async () => {
      const user = userEvent.setup();
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      await user.type(screen.getByRole("textbox"), "x");
      expect(screen.queryByText("Write a prompt to generate.")).not.toBeInTheDocument();
    });

    it("reports a take that never reached the server", async () => {
      const user = userEvent.setup();
      send.mockRejectedValueOnce(new Error("socket closed"));
      useCreateViewStore.setState({ batch: 2, prompt: "x" });
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(await screen.findByText(/Started 0 of 2 takes/)).toBeInTheDocument();
    });
  });

  describe("grid feed", () => {
    it("lists tracked generations, newest first, with older renders after them", () => {
      seedGenerations(
        generation("old", { startedAt: 100 }),
        generation("new", { startedAt: 300 })
      );
      assetListData = {
        assets: [
          {
            id: "render-1",
            name: "image_1",
            content_type: "image/png",
            created_at: new Date(200).toISOString(),
            metadata: {
              prompt: "prompt render",
              generation: { provider: "fake", model: "flux", capability: "text_to_image" }
            }
          },
          { id: "upload", name: "photo", content_type: "image/png", created_at: new Date(250).toISOString(), metadata: null }
        ]
      };
      renderSurface();
      const items = within(screen.getByRole("list", { name: "Generations" })).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual([
        expect.stringContaining("prompt new"),
        expect.stringContaining("prompt render"),
        expect.stringContaining("prompt old")
      ]);
    });

    it("shows a running generation with its status and a stop control", () => {
      seedGenerations(generation("run", { status: "generating", assetIds: [], endedAt: null }));
      renderSurface();
      expect(screen.getByText("generating")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop generating" })).toBeInTheDocument();
    });

    it("offers an empty state that leads to the prompt", async () => {
      const user = userEvent.setup();
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Write a prompt" }));
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  describe("item actions", () => {
    it("retakes with the same settings and a new seed", async () => {
      const user = userEvent.setup();
      seedGenerations(
        generation("a", { request: { mode: "image", provider: "fake", model: "flux", seed: 5, width: 512 } })
      );
      renderSurface();
      await user.click(screen.getByRole("button", { name: /^Retake prompt a/ }));
      expect(send).toHaveBeenCalledTimes(1);
      const data = send.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).toMatchObject({ mode: "image", model: "flux", width: 512, prompt: "prompt a" });
      expect(data.seed).not.toBe(5);
    });

    it("hides Send to timeline on an image and Open as workflow without presets", () => {
      seedGenerations(generation("a"));
      renderSurface();
      expect(screen.queryByRole("button", { name: /Send .* to a timeline/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /as a workflow/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Download prompt a/ })).toBeInTheDocument();
    });

    it("offers Send to timeline on a video and Open as workflow on a preset generation", () => {
      seedGenerations(
        generation("v", {
          kind: "video",
          preset_ids: ["camera.arc"],
          request: { mode: "video", provider: "fake", model: "wan" }
        })
      );
      renderSurface();
      expect(screen.getByRole("button", { name: /Send prompt v to a timeline/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open prompt v as a workflow/ })).toBeInTheDocument();
    });
  });
});
