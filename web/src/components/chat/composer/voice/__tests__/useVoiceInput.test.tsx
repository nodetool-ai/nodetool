import { act, renderHook, waitFor } from "@testing-library/react";
import type { ASRModel } from "../../../../../stores/ApiTypes";
import useModelPreferencesStore from "../../../../../stores/ModelPreferencesStore";
import { useNotificationStore } from "../../../../../stores/NotificationStore";
import useRuntimePackagePromptStore from "../../../../../stores/RuntimePackagePromptStore";
import useRuntimePackagesStore from "../../../../../stores/RuntimePackagesStore";
import { ASR_MODEL_PREFERENCE, useVoiceInput } from "../useVoiceInput";

const mockStart = jest.fn<Promise<string | null>, []>();
const mockConfirm = jest.fn<Promise<Blob | null>, []>();
const mockCancel = jest.fn();
const levelsRef = { current: new Float32Array(4) };
let mockIsRecording = false;

jest.mock("../../../../../hooks/browser/useMicrophoneRecorder", () => ({
  LEVEL_BUFFER_SIZE: 4,
  useMicrophoneRecorder: () => ({
    status: mockIsRecording ? "recording" : "idle",
    isRecording: mockIsRecording,
    error: null,
    durationMs: 0,
    levelsRef,
    start: mockStart,
    confirm: mockConfirm,
    cancel: mockCancel
  })
}));

const mockUploadAsset = jest.fn();
jest.mock("../../../../../serverState/useAssetUpload", () => ({
  useAssetUpload: {
    getState: () => ({ uploadAsset: mockUploadAsset })
  }
}));

const mockRpcRequest = jest.fn();
jest.mock("../../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (command: string, data: Record<string, unknown>) =>
    mockRpcRequest(command, data)
}));

const mockAsrByProvider = jest.fn();
jest.mock("../../../../../lib/trpc", () => ({
  trpc: {
    models: {
      asrByProvider: {
        query: (input: { provider: string }) => mockAsrByProvider(input)
      }
    }
  }
}));

const mockDeleteAsset = jest.fn();
jest.mock("../../../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      delete: {
        mutate: (input: { id: string }) => mockDeleteAsset(input)
      }
    }
  }
}));

/** Make the hook see the desktop app, with whisper.cpp installed or not. */
function asDesktop(whisperInstalled: boolean) {
  useRuntimePackagesStore.setState({
    available: true,
    error: null,
    refresh: jest.fn(async () => {
      useRuntimePackagesStore.setState({
        statuses: [
          {
            id: "whisper-cpp",
            name: "whisper.cpp",
            description: "",
            installed: whisperInstalled,
            installing: false
          }
        ]
      });
    })
  });
}

const whisper: ASRModel = {
  type: "asr_model",
  id: "whisper-1",
  name: "Whisper",
  provider: "openai" as ASRModel["provider"]
};

function pinDefaultModel() {
  useModelPreferencesStore.getState().setDefault(ASR_MODEL_PREFERENCE, {
    provider: "openai",
    id: "whisper-1",
    name: "Whisper"
  });
}

describe("useVoiceInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRecording = false;
    useModelPreferencesStore.setState({ defaults: {} });
    useNotificationStore.setState({ notifications: [] });
    useRuntimePackagePromptStore.setState({ packageId: null });
    useRuntimePackagesStore.setState({
      available: false,
      statuses: [],
      error: null
    });
    mockAsrByProvider.mockResolvedValue([]);
    mockDeleteAsset.mockResolvedValue({ deleted_asset_ids: ["asset-1"] });
    mockStart.mockResolvedValue(null);
    mockUploadAsset.mockImplementation(
      ({ onCompleted }: { onCompleted: (asset: { id: string }) => void }) => {
        onCompleted({ id: "asset-1" });
      }
    );
    mockRpcRequest.mockResolvedValue({ text: "  hello there  " });
  });

  it("asks for a model instead of recording when no default is pinned", async () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    await waitFor(() => expect(result.current.isConfigOpen).toBe(true));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("defaults to a downloaded whisper.cpp model on desktop", async () => {
    asDesktop(true);
    mockAsrByProvider.mockResolvedValue([
      {
        type: "asr_model",
        id: "/m/ggml-base.en.bin",
        name: "base.en",
        provider: "whisper_cpp"
      },
      {
        type: "asr_model",
        id: "/m/ggml-large-v3-turbo-q5_0.bin",
        name: "large-v3-turbo-q5_0",
        provider: "whisper_cpp"
      }
    ]);
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(mockAsrByProvider).toHaveBeenCalledWith({ provider: "whisper_cpp" });
    expect(
      useModelPreferencesStore.getState().defaults[ASR_MODEL_PREFERENCE]
    ).toEqual({
      provider: "whisper_cpp",
      id: "/m/ggml-large-v3-turbo-q5_0.bin",
      name: "large-v3-turbo-q5_0"
    });
    expect(result.current.isConfigOpen).toBe(false);
  });

  it("offers to install whisper.cpp on desktop when it is missing", async () => {
    asDesktop(false);
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    await waitFor(() =>
      expect(useRuntimePackagePromptStore.getState().packageId).toBe(
        "whisper-cpp"
      )
    );
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockAsrByProvider).not.toHaveBeenCalled();
    expect(result.current.isConfigOpen).toBe(false);
  });

  it("opens the picker on desktop when no whisper.cpp model is downloaded", async () => {
    asDesktop(true);
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    await waitFor(() => expect(result.current.isConfigOpen).toBe(true));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("offers the install when a pinned whisper.cpp model fails after an uninstall", async () => {
    asDesktop(false);
    useModelPreferencesStore.getState().setDefault(ASR_MODEL_PREFERENCE, {
      provider: "whisper_cpp",
      id: "/m/ggml-small.bin",
      name: "small"
    });
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockRejectedValue(new Error("not installed"));

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );
    await act(async () => {
      result.current.confirmRecording();
    });

    await waitFor(() =>
      expect(useRuntimePackagePromptStore.getState().packageId).toBe(
        "whisper-cpp"
      )
    );
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("pins the picked model as the default and starts recording", async () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });
    await waitFor(() => expect(result.current.isConfigOpen).toBe(true));
    await act(async () => {
      result.current.selectModel(whisper);
    });

    expect(
      useModelPreferencesStore.getState().defaults[ASR_MODEL_PREFERENCE]
    ).toEqual({ provider: "openai", id: "whisper-1", name: "Whisper" });
    expect(result.current.isConfigOpen).toBe(false);
    expect(mockStart).toHaveBeenCalled();
  });

  it("records straight away once a default is pinned", () => {
    pinDefaultModel();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.isConfigOpen).toBe(false);
    expect(mockStart).toHaveBeenCalled();
  });

  it("uploads the take and transcribes it to draft with the default model", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );
    await act(async () => {
      result.current.confirmRecording();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello there"));
    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(mockRpcRequest).toHaveBeenCalledWith("transcribe_audio", {
      provider: "openai",
      model: "whisper-1",
      asset_id: "asset-1"
    });
  });

  it("toggles start when idle and confirm when recording", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));

    const { result, rerender } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.toggleRecording();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);

    mockIsRecording = true;
    rerender();

    await act(async () => {
      result.current.toggleRecording();
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello there"));
    expect(onSubmitTranscript).not.toHaveBeenCalled();
  });

  it("stops, transcribes, and submits when requestSend is called while recording", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockConfirm.mockImplementation(async () => {
      mockIsRecording = false;
      return new Blob(["audio"], { type: "audio/webm" });
    });
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    mockIsRecording = true;
    const { result, rerender } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    let handled = false;
    act(() => {
      handled = result.current.requestSend();
    });
    expect(handled).toBe(true);
    expect(result.current.phase).toBe("transcribing");
    expect(result.current.pendingSend).toBe(true);
    expect(mockConfirm).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveRpc({ text: "send me now" });
    });
    rerender();

    await waitFor(() =>
      expect(onSubmitTranscript).toHaveBeenCalledWith("send me now")
    );
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.pendingSend).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  it("queues send when requestSend is called while transcribing", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));
    expect(result.current.phase).toBe("transcribing");
    expect(result.current.pendingSend).toBe(false);

    let handled = false;
    act(() => {
      handled = result.current.requestSend();
    });
    expect(handled).toBe(true);
    expect(result.current.pendingSend).toBe(true);

    await act(async () => {
      resolveRpc({ text: "queued submit" });
    });

    await waitFor(() =>
      expect(onSubmitTranscript).toHaveBeenCalledWith("queued submit")
    );
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.pendingSend).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  it("returns false from requestSend when idle", () => {
    pinDefaultModel();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    expect(result.current.requestSend()).toBe(false);
    expect(result.current.pendingSend).toBe(false);
  });

  it("drops late transcription results and clears pendingSend when cancelled during transcription", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.requestSend();
    });
    expect(result.current.pendingSend).toBe(true);

    act(() => {
      result.current.cancelRecording();
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.pendingSend).toBe(false);

    // Late resolution from the cancelled transcription must be ignored.
    await act(async () => {
      resolveRpc({ text: "stale transcript" });
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(result.current.phase).toBe("idle");
  });

  it("ignores stale transcription rejection after cancel", async () => {
    pinDefaultModel();
    let rejectRpc: (error: Error) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((_, reject) => {
        rejectRpc = reject;
      })
    );

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.cancelRecording();
    });

    await act(async () => {
      rejectRpc(new Error("late failure"));
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(result.current.phase).toBe("idle");
  });

  it("does not transcribe a discarded recording", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    mockConfirm.mockResolvedValue(null);

    const { result } = renderHook(() => useVoiceInput({ onTranscript }));
    await act(async () => {
      result.current.confirmRecording();
    });

    expect(mockRpcRequest).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports a failed transcription and sends nothing", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockRejectedValue(new Error("provider unavailable"));

    const { result } = renderHook(() => useVoiceInput({ onTranscript }));
    await act(async () => {
      result.current.confirmRecording();
    });

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    );
    expect(useNotificationStore.getState().notifications[0].content).toContain(
      "provider unavailable"
    );
    expect(onTranscript).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.phase).toBe("idle"));
  });

  it("cancelling discards the take", () => {
    pinDefaultModel();
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.cancelRecording();
    });

    expect(mockCancel).toHaveBeenCalled();
    expect(mockRpcRequest).not.toHaveBeenCalled();
  });

  it("deletes the uploaded asset and skips transcription when cancelled while upload is in flight", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let completeUpload: (asset: { id: string }) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockUploadAsset.mockImplementation(
      ({ onCompleted }: { onCompleted: (asset: { id: string }) => void }) => {
        completeUpload = onCompleted;
      }
    );

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockUploadAsset).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.cancelRecording();
    });
    expect(mockDeleteAsset).not.toHaveBeenCalled();

    // Upload finishes after cancel -> delete orphaned asset and never transcribe.
    await act(async () => {
      completeUpload({ id: "asset-late-upload" });
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsset).toHaveBeenCalledWith({ id: "asset-late-upload" });
    expect(mockRpcRequest).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("deletes the uploaded asset immediately when cancelled while transcribe_audio is in flight", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.cancelRecording();
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsset).toHaveBeenCalledWith({ id: "asset-1" });

    // Late RPC settlement must not emit a transcript or double-delete.
    await act(async () => {
      resolveRpc({ text: "late transcript" });
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("cleans up the uploaded asset and drops callbacks when unmounted while transcribe_audio is in flight", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    const onSubmitTranscript = jest.fn();
    let resolveRpc: (value: { text: string }) => void = () => undefined;
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));
    mockRpcRequest.mockReturnValue(
      new Promise<{ text: string }>((resolve) => {
        resolveRpc = resolve;
      })
    );

    const { result, unmount } = renderHook(() =>
      useVoiceInput({ onTranscript, onSubmitTranscript })
    );

    act(() => {
      result.current.confirmRecording();
    });
    await waitFor(() => expect(mockRpcRequest).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.requestSend();
    });

    unmount();

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsset).toHaveBeenCalledWith({ id: "asset-1" });

    await act(async () => {
      resolveRpc({ text: "unmounted transcript" });
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onSubmitTranscript).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("ignores late recorder.start failure and cancels capture when unmounted", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    let resolveStart: (failure: string | null) => void = () => undefined;
    mockStart.mockReturnValue(
      new Promise<string | null>((resolve) => {
        resolveStart = resolve;
      })
    );

    const { result, unmount } = renderHook(() =>
      useVoiceInput({ onTranscript })
    );

    act(() => {
      result.current.startRecording();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart("Microphone access was denied.");
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
