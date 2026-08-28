import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

export type MicrophoneRecorderStatus =
  | "idle"
  | "starting"
  | "recording"
  | "stopping";

/** Samples kept for the scrolling waveform (~8s at SAMPLE_INTERVAL_MS). */
export const LEVEL_BUFFER_SIZE = 240;

/** How often the analyser writes one amplitude sample into the buffer. */
const SAMPLE_INTERVAL_MS = 33;

/** How often the elapsed-time readout re-renders. */
const TICK_INTERVAL_MS = 100;

interface UseMicrophoneRecorderReturn {
  status: MicrophoneRecorderStatus;
  isRecording: boolean;
  error: string | null;
  durationMs: number;
  /** Amplitudes in [0,1], oldest first — the waveform reads this per frame. */
  levelsRef: MutableRefObject<Float32Array>;
  /** Begins capture. Resolves with a reason when it could not start. */
  start: () => Promise<string | null>;
  /** Stops and resolves the recorded audio, or null when nothing was captured. */
  confirm: () => Promise<Blob | null>;
  /** Stops and throws the recording away. */
  cancel: () => void;
}

/** The first container the browser will actually record into. */
function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function describeStartError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied. Allow it in your browser settings to record.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found.";
  }
  return err instanceof Error ? err.message : "Could not start recording.";
}

/**
 * Microphone capture for the chat composer: one take, confirmed or discarded.
 *
 * Amplitudes land in a ref rather than state — the waveform draws them on its
 * own animation frame, so a recording re-renders React ten times a second for
 * the timer instead of sixty times a second for the wave.
 */
export function useMicrophoneRecorder(): Readonly<UseMicrophoneRecorderReturn> {
  const [status, setStatus] = useState<MicrophoneRecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const levelsRef = useRef<Float32Array>(new Float32Array(LEVEL_BUFFER_SIZE));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastSampleAtRef = useRef<number>(0);
  const discardRef = useRef<boolean>(false);
  const settleRef = useRef<((blob: Blob | null) => void) | null>(null);

  const releaseCapture = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      // Closing is async and nothing waits on it; a failure here only leaks a
      // suspended context, so the rejection is dropped on purpose.
      audioContext.close().catch(() => undefined);
    }
  }, []);

  const sampleLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }
    frameRef.current = requestAnimationFrame(sampleLevels);
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) {
      return;
    }
    lastSampleAtRef.current = now;

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const centered = (samples[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const levels = levelsRef.current;
    levels.copyWithin(0, 1);
    // Speech sits low in the RMS range; scale so a normal voice fills the bar.
    levels[levels.length - 1] = Math.min(1, rms * 3);
  }, []);

  const attachAnalyser = useCallback(
    (stream: MediaStream) => {
      const AudioContextCtor =
        typeof window === "undefined"
          ? undefined
          : window.AudioContext ??
            (window as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      lastSampleAtRef.current = 0;
      frameRef.current = requestAnimationFrame(sampleLevels);
    },
    [sampleLevels]
  );

  const start = useCallback(async (): Promise<string | null> => {
    if (recorderRef.current) {
      return null;
    }
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      const reason = "Recording is not supported in this browser.";
      setError(reason);
      return reason;
    }

    setError(null);
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const settle = settleRef.current;
        settleRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob =
          discardRef.current || chunks.length === 0
            ? null
            : new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        recorderRef.current = null;
        releaseCapture();
        levelsRef.current = new Float32Array(LEVEL_BUFFER_SIZE);
        setStatus("idle");
        setDurationMs(0);
        settle?.(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      attachAnalyser(stream);

      startedAtRef.current = Date.now();
      setDurationMs(0);
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, TICK_INTERVAL_MS);
      setStatus("recording");
      return null;
    } catch (err) {
      releaseCapture();
      recorderRef.current = null;
      setStatus("idle");
      const reason = describeStartError(err);
      setError(reason);
      return reason;
    }
  }, [attachAnalyser, releaseCapture]);

  const stop = useCallback(
    (discard: boolean): Promise<Blob | null> => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        return Promise.resolve(null);
      }
      discardRef.current = discard;
      setStatus("stopping");
      return new Promise<Blob | null>((resolve) => {
        settleRef.current = resolve;
        recorder.stop();
      });
    },
    []
  );

  const confirm = useCallback(() => stop(false), [stop]);

  const cancel = useCallback(() => {
    void stop(true);
  }, [stop]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      settleRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        discardRef.current = true;
        recorder.stop();
      }
      releaseCapture();
    },
    [releaseCapture]
  );

  return {
    status,
    isRecording: status === "recording" || status === "starting",
    error,
    durationMs,
    levelsRef,
    start,
    confirm,
    cancel
  };
}
