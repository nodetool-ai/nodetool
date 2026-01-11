import { useCallback, useEffect, useRef, useState } from "react";
import log from "loglevel";
import { useSettingsStore } from "../../stores/SettingsStore";

export type AudioDevice = {
  deviceId: string;
  label: string;
};

export interface UseAudioInputTestResult {
  /** Whether the test is currently running */
  isTesting: boolean;
  /** Start testing the audio input - captures audio and shows signal level */
  startTest: () => void;
  /** Stop the audio input test */
  stopTest: () => void;
  /** Current signal level (0-1) when testing */
  signalLevel: number;
  /** Error message if any */
  error: string | null;
  /** Clear error message */
  clearError: () => void;
  /** List of available audio input devices */
  audioInputDevices: AudioDevice[];
  /** Currently selected device ID */
  selectedDeviceId: string;
  /** Change the selected device */
  setSelectedDeviceId: (deviceId: string) => void;
  /** Fetch/refresh audio devices list */
  refreshDevices: () => void;
  /** Whether devices are being fetched */
  isLoadingDevices: boolean;
}

/**
 * Hook for testing audio input devices and managing device selection.
 * Can be used in both WaveRecorder and Settings menu.
 *
 * @param useGlobalDefault - If true, uses and syncs with the global default device from settings
 */
export function useAudioInputTest(
  useGlobalDefault: boolean = false
): UseAudioInputTestResult {
  const [isTesting, setIsTesting] = useState(false);
  const [signalLevel, setSignalLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDevice[]>([]);
  const [localSelectedDeviceId, setLocalSelectedDeviceId] = useState<string>("");
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Global default device from settings
  const globalDefaultDeviceId = useSettingsStore(
    (state) => state.settings.defaultAudioInputDeviceId
  );
  const setGlobalDefaultDeviceId = useSettingsStore(
    (state) => state.setDefaultAudioInputDeviceId
  );

  // Use global or local device ID based on prop
  const selectedDeviceId = useGlobalDefault
    ? globalDefaultDeviceId
    : localSelectedDeviceId;

  const setSelectedDeviceId = useCallback(
    (deviceId: string) => {
      if (useGlobalDefault) {
        setGlobalDefaultDeviceId(deviceId);
      } else {
        setLocalSelectedDeviceId(deviceId);
      }
    },
    [useGlobalDefault, setGlobalDefaultDeviceId]
  );

  // Initialize local device ID from global default when not using global
  useEffect(() => {
    if (!useGlobalDefault && globalDefaultDeviceId) {
      setLocalSelectedDeviceId(globalDefaultDeviceId);
    }
  }, [useGlobalDefault, globalDefaultDeviceId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchAudioDevices = useCallback(() => {
    if (!navigator.mediaDevices) {
      setError("No media devices available");
      return;
    }
    setIsLoadingDevices(true);
    log.info("Fetching audio devices for test");
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (abortCtrl.signal.aborted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getTracks().forEach((track) => track.stop());
        setError(null);
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        if (!devices) {
          setError("No devices found");
          setIsLoadingDevices(false);
          return;
        }
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );

        const mappedAudioInputs = audioInputs.map((device, index) => {
          const normalizedDeviceId =
            device.deviceId === "default" ? "" : device.deviceId;
          const fallbackLabel =
            device.label ||
            (device.deviceId === "default"
              ? "System default input"
              : `Microphone ${index + 1}`);
          return {
            deviceId: normalizedDeviceId,
            label: fallbackLabel
          };
        });

        const uniqueAudioInputs = mappedAudioInputs.filter(
          (device, index, self) =>
            index ===
            self.findIndex(
              (candidate) => candidate.deviceId === device.deviceId
            )
        );

        setAudioInputDevices(uniqueAudioInputs);

        // Update selected device if current selection is not available
        const currentSelection = useGlobalDefault
          ? globalDefaultDeviceId
          : localSelectedDeviceId;
        if (!uniqueAudioInputs.some((d) => d.deviceId === currentSelection)) {
          // Default to system default (empty string) if available
          if (uniqueAudioInputs.some((d) => d.deviceId === "")) {
            setSelectedDeviceId("");
          } else if (uniqueAudioInputs.length > 0) {
            setSelectedDeviceId(uniqueAudioInputs[0].deviceId);
          }
        }

        if (audioInputs.length === 0) {
          setError("No audio input devices found");
        }
        setIsLoadingDevices(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          log.info("Fetch aborted");
        } else {
          setError(`Error enumerating devices: ${err.message}`);
        }
        setIsLoadingDevices(false);
      });
  }, [
    useGlobalDefault,
    globalDefaultDeviceId,
    localSelectedDeviceId,
    setSelectedDeviceId
  ]);

  const stopTest = useCallback(() => {
    setIsTesting(false);
    setSignalLevel(0);

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // noop
      }
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  const startTest = useCallback(() => {
    // Stop any existing test
    stopTest();
    setIsTesting(true);
    setError(null);

    const audioConstraints: MediaTrackConstraints = selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId } }
      : {};

    navigator.mediaDevices
      .getUserMedia({ audio: audioConstraints })
      .then((stream) => {
        streamRef.current = stream;

        const AudioCtx =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioContext: AudioContext = new AudioCtx();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!analyserRef.current) {
            return;
          }
          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate RMS level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const normalizedLevel = Math.min(1, rms / 128);

          setSignalLevel(normalizedLevel);
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      })
      .catch((err) => {
        setError(`Failed to access microphone: ${err.message}`);
        setIsTesting(false);
      });
  }, [selectedDeviceId, stopTest]);

  // Fetch devices on mount
  useEffect(() => {
    fetchAudioDevices();

    return () => {
      stopTest();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAudioDevices, stopTest]);

  return {
    isTesting,
    startTest,
    stopTest,
    signalLevel,
    error,
    clearError,
    audioInputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices: fetchAudioDevices,
    isLoadingDevices
  };
}
