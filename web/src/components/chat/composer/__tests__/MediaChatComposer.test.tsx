import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import MediaChatComposer from "../MediaChatComposer";
import mockTheme from "../../../../__mocks__/themeMock";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { useChatDraftStore } from "../../../../stores/ChatDraftStore";
import { useProvidersByCapability } from "../../../../hooks/useProviders";
import { asTextArea, stub } from "../../../../test-utils/doubles";
import type { MessageContent, MusicModel } from "../../../../stores/ApiTypes";
import type { ChatCommand } from "../../types/chat.types";

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

// The attach dialog has its own suite. Here it is a pair of buttons that make
// the picks the composer has to turn into prompt text.
jest.mock("../ComposerAttachDialog", () => ({
  ComposerAttachDialog: ({
    open,
    onSelectEntity,
    onSelectDocument
  }: {
    open: boolean;
    onSelectEntity: (entity: { id: string }) => void;
    onSelectDocument: (document: { name: string; uri: string }) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Add to message">
        <button onClick={() => onSelectEntity({ id: "ent1" })}>
          Pick entity
        </button>
        <button
          onClick={() =>
            onSelectDocument({ name: "Hero [v2]", uri: "sketch://sk1" })
          }
        >
          Pick document
        </button>
      </div>
    ) : null
}));

// The pickers own a model list, a search index and a packs query of their own.
// This suite is about the composer opening the right one, so each is a marker.
jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    selectedModel
  }: {
    open: boolean;
    selectedModel?: { id: string; provider?: string };
  }) =>
    open ? (
      <div
        data-testid="language-model-dialog"
        data-current={
          selectedModel ? `${selectedModel.provider}/${selectedModel.id}` : ""
        }
      />
    ) : null
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
          onModelChange(
            stub<MusicModel>({
              id: "music-1",
              name: "Test music",
              provider: "fal_ai"
            })
          )
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

const mockUseProvidersByCapability = jest.mocked(useProvidersByCapability);

const THREAD_ID = "thread-1";

const CHAT_MODEL = {
  type: "language_model" as const,
  id: "gpt-4",
  name: "GPT-4",
  provider: "openai"
};

interface ComposerOverrides {
  commands?: ChatCommand[];
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
  asTextArea(screen.getByLabelText("Message prompt"));

describe("MediaChatComposer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProvidersByCapability.mockReturnValue(
      stub<ReturnType<typeof useProvidersByCapability>>({
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
      })
    );
    useChatDraftStore.setState({ drafts: {} });
    useGlobalChatStore.setState({ selectedModel: CHAT_MODEL });
  });

  it("renders the attach, model and permission chips without a mode picker", () => {
    const { container } = renderComposer(jest.fn());

    expect(
      screen.getByRole("button", { name: "Add to message" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Chat" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GPT-4" })).toBeVisible();
    expect(
      container.querySelector(".permission-selector-trigger")
    ).toBeInTheDocument();
  });

  // UX study 4 D6: the composer's picker marked the current model only with
  // a pin, where a node's picker marks it with a check.
  it("tells the language model picker which model is current", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn());

    await user.click(screen.getByRole("button", { name: "GPT-4" }));
    expect(screen.getByTestId("language-model-dialog")).toHaveAttribute(
      "data-current",
      "openai/gpt-4"
    );
  });

  it("opens the attach dialog from the plus button", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to message" }));
    expect(
      screen.getByRole("dialog", { name: "Add to message" })
    ).toBeInTheDocument();
  });

  it("writes picked entities and documents into the prompt at the caret", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn());

    await user.click(promptBox());
    await user.keyboard("use");
    await user.click(screen.getByRole("button", { name: "Add to message" }));
    await user.click(screen.getByRole("button", { name: "Pick entity" }));
    expect(promptBox().value).toBe("use entity://ent1 ");

    await user.click(screen.getByRole("button", { name: "Add to message" }));
    await user.click(screen.getByRole("button", { name: "Pick document" }));
    expect(promptBox().value).toBe("use entity://ent1 [Hero v2](sketch://sk1) ");
  });

  it("sends the typed prompt on Enter and clears the box", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("hello there{Enter}");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [content, prompt] = onSendMessage.mock.calls[0];
    expect(content).toEqual([{ type: "text", text: "hello there" }]);
    expect(prompt).toBe("hello there");
    expect(promptBox().value).toBe("");
  });

  it("runs a thread command from the slash menu instead of sending it", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    const run = jest.fn();
    renderComposer(onSendMessage, {
      commands: [{ name: "compact", description: "Summarize", run }]
    });

    await user.click(promptBox());
    await user.keyboard("/comp");
    expect(await screen.findByTestId("skill-option-compact")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(promptBox().value).toBe("/compact ");
    await user.keyboard("{Enter}");

    expect(run).toHaveBeenCalledWith("");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(promptBox().value).toBe("");
  });

  it("puts the text a command returns back into the prompt", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn(), {
      commands: [
        {
          name: "rewind",
          description: "Take back",
          run: async () => "the earlier prompt"
        }
      ]
    });

    await user.click(promptBox());
    await user.keyboard("/rewind {Enter}");

    await waitFor(() => expect(promptBox().value).toBe("the earlier prompt"));
  });

  it("holds a thread command while a reply streams", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    const run = jest.fn();
    renderComposer(onSendMessage, {
      commands: [{ name: "compact", description: "Summarize", run }],
      isStreaming: true
    });

    await user.click(promptBox());
    await user.keyboard("/compact {Enter}");

    expect(run).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(promptBox().value).toBe("/compact ");
  });

  it("sends an unknown command as a prompt", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    renderComposer(onSendMessage);

    await user.click(promptBox());
    await user.keyboard("/compact {Enter}");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("opens the model picker on /model", async () => {
    const user = userEvent.setup();
    renderComposer(jest.fn());

    await user.click(promptBox());
    await user.keyboard("/model {Enter}");

    expect(screen.getByTestId("language-model-dialog")).toBeInTheDocument();
    expect(promptBox().value).toBe("");
  });

  it("sets the permission mode on /mode and cycles it without an argument", async () => {
    const user = userEvent.setup();
    useGlobalChatStore.getState().setPermissionMode(THREAD_ID, "default");
    renderComposer(jest.fn());

    await user.click(promptBox());
    await user.keyboard("/mode plan{Enter}");
    expect(useGlobalChatStore.getState().getPermissionMode(THREAD_ID)).toBe(
      "plan"
    );

    await user.keyboard("/mode {Enter}");
    expect(useGlobalChatStore.getState().getPermissionMode(THREAD_ID)).toBe(
      "default"
    );

    await user.keyboard("/mode bogus{Enter}");
    expect(useGlobalChatStore.getState().getPermissionMode(THREAD_ID)).toBe(
      "default"
    );
    expect(promptBox().value).toBe("/mode bogus");
  });

  it("shows Send disabled until there is a prompt, then sends on click", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn();
    renderComposer(onSendMessage);

    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).toBeDisabled();

    await user.type(promptBox(), "hello there");
    expect(send).toBeEnabled();
    await user.click(send);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(promptBox()).toHaveValue("");
  });

  it("swaps Send for Stop while a reply streams", () => {
    renderComposer(jest.fn(), { isStreaming: true, onStop: jest.fn() });

    expect(screen.queryByRole("button", { name: /^send$/i })).toBeNull();
  });

  it("keeps an unaccepted draft and prevents duplicate sends", async () => {
    const user = userEvent.setup();
    let accept: (accepted: boolean) => void = () => undefined;
    const onSendMessage = jest.fn(() => new Promise<boolean>((resolve) => {
      accept = resolve;
    }));
    renderComposer(onSendMessage);
    await user.type(promptBox(), "keep this draft{Enter}");
    expect(promptBox()).toHaveValue("keep this draft");
    await user.keyboard("{Enter}");
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    await act(async () => accept(false));
    expect(promptBox()).toHaveValue("keep this draft");
    await user.keyboard("{Enter}");
    await act(async () => accept(true));
    expect(promptBox()).toHaveValue("");
  });

  it("keeps edits made while a send is pending", async () => {
    const user = userEvent.setup();
    let accept: () => void = () => undefined;
    renderComposer(jest.fn(() => new Promise<void>((resolve) => {
      accept = resolve;
    })));
    await user.type(promptBox(), "first{Enter} plus edits");
    await act(async () => accept());
    expect(promptBox()).toHaveValue("first plus edits");
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
});
