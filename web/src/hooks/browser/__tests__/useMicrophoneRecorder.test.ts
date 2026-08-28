import { act, renderHook, waitFor } from "@testing-library/react";
import { useMicrophoneRecorder } from "../useMicrophoneRecorder";

type RecorderHandlers = {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

class FakeMediaRecorder implements RecorderHandlers {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";

  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const stopTrack = jest.fn();
const mockGetUserMedia = jest.fn();

function installMediaStack() {
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
    FakeMediaRecorder;
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true
  });
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }]
  } as unknown as MediaStream);
}

describe("useMicrophoneRecorder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakeMediaRecorder.instances = [];
    installMediaStack();
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useMicrophoneRecorder());
    expect(result.current.status).toBe("idle");
    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("records after start", async () => {
    const { result } = renderHook(() => useMicrophoneRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    await waitFor(() => expect(result.current.status).toBe("recording"));
  });

  it("confirm resolves the recorded audio and releases the microphone", async () => {
    const { result } = renderHook(() => useMicrophoneRecorder());
    await act(async () => {
      await result.current.start();
    });

    let blob: Blob | null = null;
    await act(async () => {
      blob = await result.current.confirm();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("cancel throws the recording away", async () => {
    const { result } = renderHook(() => useMicrophoneRecorder());
    await act(async () => {
      await result.current.start();
    });

    const stopped = new Promise<Blob | null>((resolve) => {
      // `cancel` fires and forgets, so watch the recorder's own settle path.
      const recorder = FakeMediaRecorder.instances[0];
      const originalOnStop = recorder.onstop;
      recorder.onstop = () => {
        originalOnStop?.();
        resolve(null);
      };
    });

    await act(async () => {
      result.current.cancel();
      await stopped;
    });

    expect(stopTrack).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("reports a denied microphone instead of throwing", async () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    mockGetUserMedia.mockRejectedValueOnce(denied);

    const { result } = renderHook(() => useMicrophoneRecorder());
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.start();
    });

    expect(failure).toContain("Microphone access was denied");
    expect(result.current.status).toBe("idle");
  });

  it("reports unsupported browsers", async () => {
    (global as unknown as { MediaRecorder?: unknown }).MediaRecorder =
      undefined;
    const { result } = renderHook(() => useMicrophoneRecorder());
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.start();
    });
    expect(failure).toBe("Recording is not supported in this browser.");
  });
});
