import React from "react";
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
import type { MessageContent } from "../../../../stores/ApiTypes";

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

// The workspace chip resolves the active workspace through the workflow
// manager, which no chat surface has open. Answer with "none picked".
jest.mock("../../../../hooks/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: undefined,
    workspace: undefined,
    setWorkspaceId: jest.fn(),
    hasActiveWorkflow: false,
    canManage: true
  })
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

  it("renders the attach, mode, model, permission and workspace chips in chat mode", () => {
    const { container } = renderComposer(jest.fn());

    expect(screen.getByRole("button", { name: "Attach files" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Chat" })).toBeVisible();
    expect(screen.getByRole("button", { name: "GPT-4" })).toBeVisible();
    expect(
      container.querySelector(".permission-selector-trigger")
    ).toBeInTheDocument();
    expect(screen.getByTitle("Select a workspace folder")).toBeInTheDocument();
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
});
