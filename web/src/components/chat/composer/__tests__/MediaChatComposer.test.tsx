import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import MediaChatComposer from "../MediaChatComposer";
import mockTheme from "../../../../__mocks__/themeMock";
import useMediaGenerationStore from "../../../../stores/MediaGenerationStore";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { useChatDraftStore } from "../../../../stores/ChatDraftStore";
import { useProvidersByCapability } from "../../../../hooks/useProviders";
import type { MessageContent, MusicModel } from "../../../../stores/ApiTypes";

// The provider query decides whether the composer refuses a send and shows the
// setup banner instead. Every mode here has a provider. The rest of the module
// stays real — `useModelsByProvider` reads it too.
jest.mock("../../../../hooks/useProviders", () => ({
  ...jest.requireActual("../../../../hooks/useProviders"),
  useProvidersByCapability: jest.fn()
}));

// A first-run account gets its language model filled from the recommended
// list. That is three model queries this suite does not exercise.
jest.mock("../../../../hooks/useFirstRunLanguageModel", () => ({
  useFirstRunLanguageModel: () => undefined
}));

// The `/` and `@` menus are covered by their own hook suites; here they only
// need to stay closed so the keydown chain reaches the composer.
jest.mock("../../../../hooks/skills/useSkills", () => ({
  useSkills: () => ({ data: [] })
}));
jest.mock(
  "../../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    useAssetMentionSearch: () => ({
      activeTab: "saved",
      setActiveTab: jest.fn(),
      entities: [],
      displayedAssets: [],
      handleRename: jest.fn()
    })
  })
);

// The pickers own a model list, a search index and a packs query of their own.
// This suite is about the composer opening the right one, so each is a marker.
jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="language-model-dialog" /> : null
}));
jest.mock("../../../model_menu/ImageModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="image-model-dialog" /> : null
}));
jest.mock("../../../model_menu/VideoModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="video-model-dialog" /> : null
}));
jest.mock("../../../model_menu/MusicModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange
  }: {
    open: boolean;
    onModelChange: (model: MusicModel) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onModelChange({
            id: "music-1",
            name: "Test music",
            provider: "fal_ai"
          } as MusicModel)
        }
      >
        Pick music model
      </button>
    ) : null
}));
jest.mock("../../../model_menu/TTSModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tts-model-dialog" /> : null
}));

const mockUseProvidersByCapability =
  useProvidersByCapability as jest.MockedFunction<
    typeof useProvidersByCapability
  >;

const THREAD_ID = "thread-1";

const CHAT_MODEL = {
  type: "language_model" as const,
  id: "gpt-4",
  name: "GPT-4",
  provider: "openai"
};

const MEDIA_DEFAULTS = (() => {
  const s = useMediaGenerationStore.getState();
  return {
    mode: s.mode,
    image: s.image,
    imageEdit: s.imageEdit,
    video: s.video,
    imageToVideo: s.imageToVideo,
    referenceToVideo: s.referenceToVideo,
    music: s.music,
    audio: s.audio
  };
})();

interface ComposerOverrides {
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  threadId?: string | null;
}

const renderComposer = (
  onSendMessage: jest.Mock,
  overrides: ComposerOverrides = {}
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <MediaChatComposer
          isLoading={false}
          isStreaming={false}
          onSendMessage={onSendMessage}
          threadId={THREAD_ID}
          {...overrides}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const promptBox = () =>
  screen.getByLabelText("Message prompt") as HTMLTextAreaElement;

describe("MediaChatComposer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProvidersByCapability.mockReturnValue({
      providers: [
        {
          provider: "openai",
          capabilities: [
            "generate_message",
            "text_to_image",
            "text_to_video",
            "text_to_speech"
          ]
        }
      ],
      isLoading: false,
      isFetching: false,
      error: null
    } as ReturnType<typeof useProvidersByCapability>);
    useMediaGenerationStore.setState({ ...MEDIA_DEFAULTS });
    useChatDraftStore.setState({ drafts: {} });
    useGlobalChatStore.setState({ selectedModel: CHAT_MODEL });
  });

  it("renders the attach, mode, model and permission chips in chat mode", () => {
    const { container } = renderComposer(jest.fn());

    expect(screen.getByRole("button", { name: "Attach files" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Chat" })).toBeVisible();
    expect(screen.getByRole("button", { name: "GPT-4" })).toBeVisible();
    expect(
      container.querySelector(".permission-selector-trigger")
    ).toBeInTheDocument();
  });

  it("sends the typed prompt on Enter and clears the box", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("hello there{Enter}");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [content, prompt] = onSendMessage.mock.calls[0] as [
      MessageContent[],
      string
    ];
    expect(content).toEqual([{ type: "text", text: "hello there" }]);
    expect(prompt).toBe("hello there");
    expect(promptBox().value).toBe("");
  });

  it("keeps the prompt on Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("hello{Shift>}{Enter}{/Shift}");

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(promptBox().value).toContain("hello");
  });

  it("stops the reply on Escape while streaming", async () => {
    const user = userEvent.setup();
    const onStop = jest.fn();
    renderComposer(jest.fn(), { isStreaming: true, onStop });

    await user.click(promptBox());
    await user.keyboard("{Escape}");

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when nothing is in flight", async () => {
    const user = userEvent.setup();
    const onStop = jest.fn();
    renderComposer(jest.fn(), { onStop });

    await user.click(promptBox());
    await user.keyboard("{Escape}");

    expect(onStop).not.toHaveBeenCalled();
  });

  it("takes a seed parked after mount into an empty box", async () => {
    renderComposer(jest.fn());

    act(() => {
      useChatDraftStore.getState().setDraft(THREAD_ID, "a cat on a bike");
    });

    await waitFor(() => expect(promptBox().value).toBe("a cat on a bike"));
    expect(useChatDraftStore.getState().drafts[THREAD_ID]).toBeUndefined();
    expect(promptBox()).toHaveFocus();
  });

  it("appends a seed below what the user already typed", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn());

    await user.click(promptBox());
    await user.keyboard("half written");

    act(() => {
      useChatDraftStore.getState().setDraft(THREAD_ID, "seeded line");
    });

    await waitFor(() =>
      expect(promptBox().value).toBe("half written\nseeded line")
    );
  });

  it("ignores a seed parked for another thread", async () => {
    renderComposer(jest.fn());

    act(() => {
      useChatDraftStore.getState().setDraft("other-thread", "not mine");
    });

    await waitFor(() =>
      expect(useChatDraftStore.getState().drafts["other-thread"]).toBe(
        "not mine"
      )
    );
    expect(promptBox().value).toBe("");
  });

  it("shows the image chips and gates Generate on a prompt", async () => {
    const user = userEvent.setup();
    useMediaGenerationStore.setState({ mode: "image" });
    renderComposer(jest.fn());

    expect(screen.getByRole("button", { name: "Select Model" })).toBeVisible();
    expect(screen.getByRole("button", { name: "1K" })).toBeVisible();
    expect(screen.getByRole("button", { name: "16:9" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();

    await user.click(promptBox());
    await user.keyboard("a lighthouse");

    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  it("opens the image picker instead of sending when no model is picked", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    useMediaGenerationStore.setState({ mode: "image" });
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("a lighthouse");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId("image-model-dialog")).toBeInTheDocument();
  });

  it("selects music, gates on its own model, and sends the requested duration", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    renderComposer(onSendMessage);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Generate Music" })
    );
    expect(mockUseProvidersByCapability).toHaveBeenLastCalledWith(
      "text_to_music"
    );
    await user.type(promptBox(), "Warm ambient piano{Enter}");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(promptBox()).toHaveValue("Warm ambient piano");
    await user.click(screen.getByRole("button", { name: "Pick music model" }));
    await user.click(
      screen.getByRole("button", { name: "30 Sec" })
    );
    await user.click(screen.getByText("60 Sec"));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][2]).toEqual({
      mode: "music",
      provider: "fal_ai",
      model: "music-1",
      duration: 60
    });
    expect(promptBox()).toHaveValue("");
  });

  it("sends the media generation payload once a model is picked", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    useMediaGenerationStore.setState({
      mode: "image",
      image: {
        ...MEDIA_DEFAULTS.image,
        model: {
          type: "image_model",
          id: "flux",
          provider: "fal_ai",
          name: "Flux",
          path: ""
        }
      }
    });
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("a lighthouse");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][2]).toMatchObject({
      mode: "image",
      provider: "fal_ai",
      model: "flux"
    });
  });

  it("sends reference-to-video with the shot params, and the audio flag only when on", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    const setMode = (useReferenceVideoAudio: boolean) =>
      useMediaGenerationStore.setState({
        mode: "reference_to_video",
        referenceToVideo: {
          ...MEDIA_DEFAULTS.referenceToVideo,
          model: {
            type: "video_model",
            id: "minimax/h3/reference-to-video",
            provider: "fal_ai",
            name: "Minimax H3"
          },
          duration: 6,
          resolution: "1080p",
          aspectRatio: "9:16",
          useReferenceVideoAudio
        }
      });

    setMode(false);
    const off = renderComposer(onSendMessage);
    await user.click(promptBox());
    await user.keyboard("she walks into frame");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onSendMessage.mock.calls[0][2]).toEqual({
      mode: "reference_to_video",
      provider: "fal_ai",
      model: "minimax/h3/reference-to-video",
      aspect_ratio: "9:16",
      resolution: "1080p",
      duration: 6,
      // A model that cannot take reference audio rejects the request, so an
      // off toggle must state nothing rather than `false`.
      use_reference_video_audio: null
    });
    off.unmount();

    onSendMessage.mockClear();
    setMode(true);
    renderComposer(onSendMessage);
    await user.click(promptBox());
    await user.keyboard("she walks into frame");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onSendMessage.mock.calls[0][2]).toMatchObject({
      use_reference_video_audio: true
    });
  });

  it("opens the video picker instead of sending when no reference model is picked", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    useMediaGenerationStore.setState({
      mode: "reference_to_video",
      referenceToVideo: { ...MEDIA_DEFAULTS.referenceToVideo, model: null }
    });
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("she walks into frame");
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId("video-model-dialog")).toBeInTheDocument();
  });
});
