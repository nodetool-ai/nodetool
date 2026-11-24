import { useCallback, useRef, useState } from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import MediaChatComposer from "../MediaChatComposer";
import { ASR_MODEL_PREFERENCE } from "../voice/useVoiceInput";
import mockTheme from "../../../../__mocks__/themeMock";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import useModelPreferencesStore from "../../../../stores/ModelPreferencesStore";
import { useChatDraftStore } from "../../../../stores/ChatDraftStore";
import { useProvidersByCapability } from "../../../../hooks/useProviders";
import { asTextArea, stub } from "../../../../test-utils/doubles";
import type { MessageContent } from "../../../../stores/ApiTypes";

const mockRecorderStart = jest.fn();
const mockRecorderConfirm = jest.fn();
const mockRecorderCancel = jest.fn();
const mockUploadAsset = jest.fn();
const mockRpcRequest = jest.fn();

// Stateful mock of useMicrophoneRecorder so real useVoiceInput transitions
// through idle -> recording -> transcribing -> idle end-to-end.
jest.mock("../../../../hooks/browser/useMicrophoneRecorder", () => ({
  LEVEL_BUFFER_SIZE: 8,
  useMicrophoneRecorder: () => {
    const [status, setStatus] = useState<"idle" | "recording">("idle");
    const levelsRef = useRef(new Float32Array(8));

    const start = useCallback(async () => {
      mockRecorderStart();
      setStatus("recording");
      return null;
    }, []);

    const confirm = useCallback(async () => {
      setStatus("idle");
      return mockRecorderConfirm();
    }, []);

    const cancel = useCallback(() => {
      mockRecorderCancel();
      setStatus("idle");
    }, []);

    return {
      status,
      isRecording: status === "recording",
      error: null,
      durationMs: 1_500,
      levelsRef,
      start,
      confirm,
      cancel
    };
  }
}));

jest.mock("../../../../serverState/useAssetUpload", () => {
  const store = Object.assign(
    (selector: (state: { uploadAsset: typeof mockUploadAsset }) => unknown) =>
      selector({ uploadAsset: mockUploadAsset }),
    {
      getState: () => ({ uploadAsset: mockUploadAsset })
    }
  );
  return {
    __esModule: true,
    default: store,
    useAssetUpload: store
  };
});

jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (command: string, data: Record<string, unknown>) =>
    mockRpcRequest(command, data)
}));

jest.mock("../../../../hooks/useProviders", () => ({
  ...jest.requireActual("../../../../hooks/useProviders"),
  useProvidersByCapability: jest.fn()
}));

jest.mock("../../../../hooks/useFirstRunLanguageModel", () => ({
  useFirstRunLanguageModel: () => undefined
}));

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

jest.mock("../../../model_menu/ASRModelMenuDialog", () => ({
  __esModule: true,
  default: () => null
}));

const mockUseProvidersByCapability = jest.mocked(useProvidersByCapability);

const THREAD_ID = "thread-voice-1";

const CHAT_MODEL = {
  type: "language_model" as const,
  id: "gpt-4",
  name: "GPT-4",
  provider: "openai"
};

const renderComposer = (onSendMessage: jest.Mock) => {
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
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const promptBox = () => asTextArea(screen.getByLabelText("Message prompt"));

const sendButton = () => screen.getByRole("button", { name: /^send$/i });

const pressVoiceShortcut = () => {
  fireEvent.keyDown(window, {
    code: "KeyM",
    key: "M",
    altKey: true,
    shiftKey: true
  });
};

describe("MediaChatComposer draft-first voice dictation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProvidersByCapability.mockReturnValue(
      stub<ReturnType<typeof useProvidersByCapability>>({
        providers: [
          {
            provider: "openai",
            capabilities: ["generate_message"]
          }
        ],
        isLoading: false,
        isFetching: false,
        error: null
      })
    );
    useChatDraftStore.setState({ drafts: {} });
    useGlobalChatStore.setState({ selectedModel: CHAT_MODEL });
    useModelPreferencesStore.getState().setDefault(ASR_MODEL_PREFERENCE, {
      provider: "openai",
      id: "whisper-1",
      name: "Whisper"
    });
    mockRecorderConfirm.mockResolvedValue(
      new Blob(["audio"], { type: "audio/webm" })
    );
    mockUploadAsset.mockImplementation(
      ({ onCompleted }: { onCompleted: (asset: { id: string }) => void }) => {
        onCompleted({ id: "asset-voice-1" });
      }
    );
    mockRpcRequest.mockResolvedValue({ text: "summarize the second paragraph" });
  });

  it("toggles start and stop with the same mic button and lands transcript in draft without auto-sending", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    renderComposer(onSendMessage);

    await user.type(promptBox(), "Please");

    const micStart = screen.getByRole("button", {
      name: "Record voice message"
    });
    await user.click(micStart);

    // Recording state: same mic button stays visible, enabled, and active.
    const micStop = await screen.findByRole("button", {
      name: "Stop recording"
    });
    expect(micStop).toBeEnabled();
    expect(micStop).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Discard recording" })
    ).toBeVisible();

    await user.click(micStop);

    await waitFor(() =>
      expect(promptBox()).toHaveValue("Please summarize the second paragraph")
    );
    expect(promptBox()).toHaveFocus();
    expect(onSendMessage).not.toHaveBeenCalled();

    // User can edit the draft and then send normally.
    await user.type(promptBox(), " clearly");
    await user.keyboard("{Enter}");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "Please summarize the second paragraph clearly" }],
      "Please summarize the second paragraph clearly"
    );
    expect(promptBox()).toHaveValue("");
  });

  it("toggles start and stop with Alt+Shift+M and lands transcript in draft without auto-sending", async () => {
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    renderComposer(onSendMessage);

    act(() => {
      pressVoiceShortcut();
    });

    await screen.findByRole("button", { name: "Stop recording" });
    expect(sendButton()).toBeEnabled();

    act(() => {
      pressVoiceShortcut();
    });

    await waitFor(() =>
      expect(promptBox()).toHaveValue("summarize the second paragraph")
    );
    expect(promptBox()).toHaveFocus();
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("stops, transcribes, and submits immediately when Send is clicked while recording", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    renderComposer(onSendMessage);
    expect(sendButton()).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    await screen.findByRole("button", { name: "Stop recording" });
    expect(sendButton()).toBeEnabled();

    await user.click(sendButton());

    expect(
      await screen.findByText("Sending once transcribed…")
    ).toBeInTheDocument();
    expect(onSendMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveRpc({ text: "rewrite the opening" });
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "rewrite the opening" }],
      "rewrite the opening"
    );
    expect(promptBox()).toHaveValue("");
  });

  it("stops, transcribes, and submits immediately when Enter is pressed while recording", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    renderComposer(onSendMessage);

    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    await screen.findByRole("button", { name: "Stop recording" });

    // Shift+Enter must not submit while recording.
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(mockRecorderConfirm).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("Sending once transcribed…")
    ).toBeInTheDocument();

    await act(async () => {
      resolveRpc({ text: "enter while recording" });
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "enter while recording" }],
      "enter while recording"
    );
    expect(promptBox()).toHaveValue("");
  });

  it("queues and submits automatically when Send is clicked while transcribing", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    renderComposer(onSendMessage);

    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Stop recording" })
    );

    expect(await screen.findByText("Transcribing…")).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();

    await user.click(sendButton());
    expect(
      await screen.findByText("Sending once transcribed…")
    ).toBeInTheDocument();

    await act(async () => {
      resolveRpc({ text: "clicked send while transcribing" });
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "clicked send while transcribing" }],
      "clicked send while transcribing"
    );
    expect(promptBox()).toHaveValue("");
  });

  it("queues and submits automatically when Enter is pressed while transcribing", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    renderComposer(onSendMessage);

    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Stop recording" })
    );

    expect(await screen.findByText("Transcribing…")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(
      await screen.findByText("Sending once transcribed…")
    ).toBeInTheDocument();

    await act(async () => {
      resolveRpc({ text: "enter while transcribing" });
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage).toHaveBeenCalledWith(
      [{ type: "text", text: "enter while transcribing" }],
      "enter while transcribing"
    );
    expect(promptBox()).toHaveValue("");
  });

  it("cancels during recording via X without uploading or transcribing", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    renderComposer(onSendMessage);

    await user.type(promptBox(), "Existing draft");
    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );

    await user.click(
      await screen.findByRole("button", { name: "Discard recording" })
    );

    expect(mockRecorderCancel).toHaveBeenCalledTimes(1);
    expect(mockUploadAsset).not.toHaveBeenCalled();
    expect(mockRpcRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Voice recording" })).toBeNull();
    expect(promptBox()).toHaveValue("Existing draft");
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("cancels during transcribing via X without landing text or sending", async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn<void, [MessageContent[], string]>();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    renderComposer(onSendMessage);

    await user.type(promptBox(), "Keep untouched");
    await user.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    await screen.findByRole("button", { name: "Stop recording" });

    // Queue a pending send while recording, then cancel during transcription.
    await user.click(sendButton());
    expect(
      await screen.findByText("Sending once transcribed…")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cancel transcription" })
    );

    expect(
      screen.queryByText("Sending once transcribed…")
    ).not.toBeInTheDocument();

    // Late resolution from the cancelled request must be ignored.
    await act(async () => {
      resolveRpc({ text: "must be dropped" });
    });

    expect(promptBox()).toHaveValue("Keep untouched");
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
