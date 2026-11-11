import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CreateSurface from "../CreateSurface";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import {
  EMPTY_CREATE_DRAFT,
  GLOBAL_CREATE_SESSION,
  createDraftOf,
  useCreateViewStore,
  type CreateDraft
} from "../../../stores/CreateViewStore";
import {
  useGenerationActivityStore,
  type GenerationActivity
} from "../../../stores/GenerationActivityStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: { send: jest.fn().mockResolvedValue(undefined) }
}));

let assetListData: { assets: unknown[] } | undefined = { assets: [] };
let sessionRecords: unknown[] = [];
const mockNameSession = jest.fn(async (..._args: [string, string]) => undefined);
// Only a media thread's messages are read, and these tabs have none.
jest.mock("../../../stores/GlobalChatStore", () => {
  const { create } = jest.requireActual("zustand");
  return { __esModule: true, default: create(() => ({ messageCache: {} })) };
});
jest.mock("../openCreateSession", () => ({
  nameSessionAfterPrompt: (...args: [string, string]) => mockNameSession(...args)
}));
jest.mock("../../../trpc/client", () => ({
  trpc: {
    generations: {
      list: {
        useQuery: ({ thread_id }: { thread_id: string }) => ({
          data: {
            generations: sessionRecords.filter(
              (record) => (record as { thread_id: string }).thread_id === thread_id
            )
          },
          isLoading: false,
          error: null,
          refetch: jest.fn()
        })
      }
    },
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

const renderSurface = (props: { sessionId?: string; projectId?: string } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <CreateSurface {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );

/** Set the draft of the Create view that has no session. */
const setDraft = (patch: Partial<CreateDraft>, sessionId: string = GLOBAL_CREATE_SESSION) =>
  useCreateViewStore.setState((state) => ({
    drafts: { ...state.drafts, [sessionId]: { ...createDraftOf(state, sessionId), ...patch } }
  }));

const draft = (sessionId: string = GLOBAL_CREATE_SESSION) =>
  createDraftOf(useCreateViewStore.getState(), sessionId);

describe("CreateSurface", () => {
  beforeEach(() => {
    send.mockClear();
    mockNameSession.mockClear();
    assetListData = { assets: [] };
    sessionRecords = [];
    seedGenerations();
    useCreateViewStore.setState({ drafts: {} });
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
      setDraft({ batch: 3 });
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
      setDraft({ batch: 2, prompt: "x" });
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(await screen.findByText(/Started 0 of 2 takes/)).toBeInTheDocument();
    });
  });

  describe("modes", () => {
    it("switches kind and keeps each kind's last mode", async () => {
      const user = userEvent.setup();
      renderSurface();
      const kinds = screen.getByRole("group", { name: "What to create" });
      await user.click(within(kinds).getByRole("button", { name: "Video" }));
      const modes = screen.getByRole("group", { name: "How to create it" });
      await user.click(within(modes).getByRole("button", { name: "Extend" }));
      await user.click(within(kinds).getByRole("button", { name: "Audio" }));
      expect(draft().mode).toBe("audio");
      await user.click(within(kinds).getByRole("button", { name: "Video" }));
      expect(draft().mode).toBe("extend");
    });

    it("asks for the picture to edit instead of sending an edit without one", async () => {
      const user = userEvent.setup();
      setDraft({ mode: "image_edit", prompt: "make it night" });
      renderSurface();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(send).not.toHaveBeenCalled();
      expect(screen.getByText("Add the picture to edit.")).toBeInTheDocument();
    });

    it("sends an edit of the attached picture", async () => {
      const user = userEvent.setup();
      useMediaGenerationStore.setState({
        imageEdit: {
          ...useMediaGenerationStore.getState().imageEdit,
          model: { type: "image_model", id: "kontext", provider: "fake" as never, name: "Kontext", path: "" }
        }
      });
      setDraft({
        mode: "image_edit",
        prompt: "make it night",
        references: [{ assetId: "pic", contentType: "image/png", name: "pic" }]
      });
      renderSurface();
      expect(screen.getByText("Source image")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].data).toMatchObject({
        mode: "image_edit",
        model: "kontext",
        source_asset_id: "pic",
        prompt: "make it night"
      });
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

    it("animates a picture from its More menu", async () => {
      const user = userEvent.setup();
      seedGenerations(generation("a"));
      renderSurface();
      await user.click(screen.getByRole("button", { name: "More actions for prompt a" }));
      await user.click(screen.getByRole("menuitem", { name: "Animate this picture" }));
      const state = draft();
      expect(state.mode).toBe("image_to_video");
      expect(state.references).toEqual([
        { assetId: "asset-a", contentType: "image/png", name: "prompt a" }
      ]);
      expect(screen.getByText("Start frame")).toBeInTheDocument();
    });

    it("plays an audio take in place rather than opening it", () => {
      seedGenerations(
        generation("s", { kind: "audio", request: { mode: "audio", provider: "fake", model: "tts" } })
      );
      renderSurface();
      expect(screen.queryByRole("button", { name: "Open prompt s" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Retake prompt s/ })).toBeInTheDocument();
    });
  });
  describe("session tab", () => {
    const record = (id: string, overrides: Record<string, unknown> = {}) => ({
      generation_id: id,
      thread_id: "s1",
      request_id: null,
      status: "completed",
      model: "flux",
      capability: "text_to_image",
      prompt: `prompt ${id}`,
      asset_ids: [`asset-${id}`],
      started_at: new Date(50).toISOString(),
      generation_error: null,
      provider_error: null,
      submission_error: null,
      output_error: null,
      ...overrides
    });

    it("tags every take with its thread and project, and names the tab after the prompt", async () => {
      const user = userEvent.setup();
      setDraft({ batch: 2 }, "s1");
      renderSurface({ sessionId: "s1", projectId: "p1" });
      await user.type(screen.getByRole("textbox"), "a lighthouse");
      await user.click(screen.getByRole("button", { name: "Generate" }));
      expect(send).toHaveBeenCalledTimes(2);
      for (const [message] of send.mock.calls) {
        expect(message.data).toMatchObject({ thread_id: "s1", project_id: "p1" });
      }
      expect(mockNameSession).toHaveBeenCalledWith("s1", "a lighthouse");
      // The view without a session kept its own empty draft.
      expect(draft()).toBe(EMPTY_CREATE_DRAFT);
    });

    it("lists only its own takes, from the tracker and the server, until All takes is chosen", async () => {
      const user = userEvent.setup();
      seedGenerations(
        generation("mine", { threadId: "s1", startedAt: 100 }),
        generation("other", { threadId: "s2", startedAt: 200 }),
        // Recorded by the server too: listed once, as the tracked take.
        generation("tracked", { threadId: "s1", startedAt: 300 })
      );
      sessionRecords = [record("reloaded"), record("dupe", { request_id: "tracked" })];
      renderSurface({ sessionId: "s1" });
      const list = () => within(screen.getByRole("list", { name: "Generations" })).getAllByRole("listitem");
      expect(list().map((item) => item.textContent)).toEqual([
        expect.stringContaining("prompt tracked"),
        expect.stringContaining("prompt mine"),
        expect.stringContaining("prompt reloaded")
      ]);
      await user.click(screen.getByRole("button", { name: "All takes" }));
      expect(draft("s1").scope).toBe("all");
      expect(list().map((item) => item.textContent)).toEqual([
        expect.stringContaining("prompt tracked"),
        expect.stringContaining("prompt other"),
        expect.stringContaining("prompt mine")
      ]);
    });

    it("has no scope choice in the Create view without a session", () => {
      renderSurface();
      expect(screen.queryByRole("group", { name: "Which takes to show" })).not.toBeInTheDocument();
    });
  });
});
