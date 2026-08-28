import { act, renderHook, waitFor } from "@testing-library/react";
import type { ASRModel } from "../../../../../stores/ApiTypes";
import useModelPreferencesStore from "../../../../../stores/ModelPreferencesStore";
import { useNotificationStore } from "../../../../../stores/NotificationStore";
import { ASR_MODEL_PREFERENCE, useVoiceInput } from "../useVoiceInput";

const mockStart = jest.fn<Promise<string | null>, []>();
const mockConfirm = jest.fn<Promise<Blob | null>, []>();
const mockCancel = jest.fn();
const levelsRef = { current: new Float32Array(4) };

jest.mock("../../../../../hooks/browser/useMicrophoneRecorder", () => ({
  LEVEL_BUFFER_SIZE: 4,
  useMicrophoneRecorder: () => ({
    status: "idle",
    isRecording: false,
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
    useModelPreferencesStore.setState({ defaults: {} });
    useNotificationStore.setState({ notifications: [] });
    mockStart.mockResolvedValue(null);
    mockUploadAsset.mockImplementation(
      ({ onCompleted }: { onCompleted: (asset: { id: string }) => void }) => {
        onCompleted({ id: "asset-1" });
      }
    );
    mockRpcRequest.mockResolvedValue({ text: "  hello there  " });
  });

  it("asks for a model instead of recording when no default is pinned", () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.isConfigOpen).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("pins the picked model as the default and starts recording", async () => {
    const { result } = renderHook(() =>
      useVoiceInput({ onTranscript: jest.fn() })
    );

    act(() => {
      result.current.startRecording();
    });
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

  it("uploads the take and transcribes it with the default model", async () => {
    pinDefaultModel();
    const onTranscript = jest.fn();
    mockConfirm.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));

    const { result } = renderHook(() => useVoiceInput({ onTranscript }));
    await act(async () => {
      result.current.confirmRecording();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("hello there"));
    expect(mockRpcRequest).toHaveBeenCalledWith("transcribe_audio", {
      provider: "openai",
      model: "whisper-1",
      asset_id: "asset-1"
    });
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
});
